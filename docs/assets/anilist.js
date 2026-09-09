var CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'manga', label: 'Manga', country: 'JP' },
  { id: 'manhwa', label: 'Manhwa', country: 'KR' },
  { id: 'manhua', label: 'Manhua', country: 'CN' },
  { id: 'webcomic', label: 'Webcomics', formats: ['NOVEL'] },
];

// ── Catalog data source ──────────────────────────────────────────────
var AL = 'https://graphql.anilist.co';
var CACHE_TTL = 10 * 60 * 1000;
function cacheKey(query, variables) { return 'mrcache:' + query + ':' + JSON.stringify(variables || {}); }
function readCache(key) {
  try {
    var entry = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!entry || Date.now() - entry.t > CACHE_TTL) return null;
    return entry.d;
  } catch (e) { return null; }
}
function writeCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
}
function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
// A 4xx is AniList's final answer, not a hiccup. Retrying one wastes the
// 3.7s the two backoffs add, and during an outage every rail on the page
// spends that long showing skeletons before it can fall back — which reads
// as "the content is gone" rather than "this is loading".
function isTransient(status) { return !status || status === 429 || status >= 500; }

function alRequest(query, variables) {
  return fetch(AL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: query, variables: variables }),
  }).then(function (r) {
    if (!r.ok) {
      var err = new Error('http ' + r.status);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }).then(function (j) {
    if (!j || !j.data) throw new Error('empty response');
    return j.data;
  });
}

// Circuit breaker. AniList has spent days at a time returning 403 "temporarily
// disabled due to severe stability issues". Without this, every rail on every
// page re-learns that independently, so a visitor pays the full retry cost over
// and over for an answer the first request already gave. One failure marks it
// down for a few minutes and everything else goes straight to the stand-ins.
var AL_DOWN_KEY = 'mrcache:al-down-until';
var AL_DOWN_MS = 5 * 60 * 1000;
function alIsDown() {
  try {
    var until = Number(sessionStorage.getItem(AL_DOWN_KEY) || 0);
    return until > Date.now();
  } catch (e) { return false; }
}
function alMarkDown() {
  try { sessionStorage.setItem(AL_DOWN_KEY, String(Date.now() + AL_DOWN_MS)); } catch (e) { /* private mode */ }
}

function alFetch(query, variables) {
  var key = cacheKey(query, variables);
  var cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  // Cached responses still serve while the breaker is open; only new requests
  // are skipped, so a warm page stays fully populated during an outage.
  if (alIsDown()) return Promise.reject(new Error('anilist unavailable'));

  function attempt(retriesLeft, delay) {
    return alRequest(query, variables).catch(function (err) {
      if (retriesLeft <= 0 || !isTransient(err.status)) {
        if (err.status && !isTransient(err.status)) alMarkDown();
        throw err;
      }
      return wait(delay).then(function () { return attempt(retriesLeft - 1, delay * 2); });
    });
  }

  return attempt(2, 1200).then(function (data) { writeCache(key, data); return data; });
}

var MEDIA_FIELDS = 'id title { romaji english native } description(asHtml: false) genres format status ' +
  'countryOfOrigin chapters volumes averageScore popularity favourites startDate { year } endDate { year } ' +
  'coverImage { extraLarge large color } bannerImage isAdult ' +
  'staff(perPage: 6) { edges { role node { name { full } } } } ' +
  'characters(perPage: 8, sort: ROLE) { edges { role node { id name { full } image { medium } } } } ' +
  'tags { name isMediaSpoiler rank } ' +
  'externalLinks { url site type isDisabled }';

function searchMedia(query, category, page) {
  var filters = 'search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false';
  if (category && category.country) filters += ', countryOfOrigin: "' + category.country + '"';
  if (category && category.formats) filters += ', format_in: [' + category.formats.join(',') + ']';
  var gql = 'query($search: String, $page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } media(' + filters + ') { ' + MEDIA_FIELDS + ' } } }';
  return alFetch(gql, { search: query || undefined, page: page || 1 });
}

// Lightweight single-title art lookup for MangaRecap's hero backgrounds —
// a bare `Media(search:)` for exactly one result with only the 4 fields a
// background needs (coverImage's 3 sub-fields + bannerImage), instead of
// reusing searchMedia's `Page(perPage: 50)` query built for the full catalog
// grid (50 results × every MEDIA_FIELDS, including staff/characters/tags).
// That heavier query was the actual reason recap art so often lost the race
// against its own timeout — this one is a fraction of the payload and comes
// back fast enough that a real cover reliably makes it in under the limit.
// bannerImage is a wide promotional/key-art crop (no logo/title text baked
// in like a cover often has) — preferred for full-bleed hero use; coverImage
// is kept too since MangaRecap's top-series thumbnails want a portrait crop.
// `characters` powers the Favorite Moments grid — real character portraits
// out of the reader's own top series, which is what makes the recap read as
// manga instead of as a stats dashboard.
function recapArtFor(title) {
  var gql = 'query($search: String) { Media(search: $search, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage genres characters(perPage: 6, sort: ROLE) { edges { node { name { full } image { large medium } } } } } }';
  return alFetch(gql, { search: title }).then(function (d) { return d.Media || null; });
}

function trendingMedia(category, page, sort, genre) {
  var filters = 'sort: ' + (sort || 'TRENDING_DESC') + ', type: MANGA, isAdult: false';
  if (category && category.country) filters += ', countryOfOrigin: "' + category.country + '"';
  if (category && category.formats) filters += ', format_in: [' + category.formats.join(',') + ']';
  if (genre) filters += ', genre_in: ["' + genre + '"]';
  var gql = 'query($page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } media(' + filters + ') { ' + MEDIA_FIELDS + ' } } }';
  return alFetch(gql, { page: page || 1 });
}

var GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Psychological'];

var RECOMMENDATION_FIELDS = 'id type title { romaji english native } coverImage { large } format countryOfOrigin averageScore startDate { year } chapters isAdult';
function mediaById(id) {
  var gql = 'query($id: Int) { Media(id: $id, type: MANGA) { ' + MEDIA_FIELDS +
    ' recommendations(perPage: 8, sort: RATING_DESC) { nodes { mediaRecommendation { ' + RECOMMENDATION_FIELDS + ' } } }' +
    ' } }';
  return alFetch(gql, { id: id }).then(function (d) { return d.Media; });
}

// ── Helpers ───────────────────────────────────────────────────────────
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function titleOf(m) { return (m.title.english || m.title.romaji || m.title.native || 'Untitled'); }
function formatLabel(m) {
  if (m.countryOfOrigin === 'KR') return 'Manhwa';
  if (m.countryOfOrigin === 'CN' || m.countryOfOrigin === 'TW') return 'Manhua';
  if (m.format === 'NOVEL') return 'Novel';
  return 'Manga';
}
function statusLabel(s) {
  return { RELEASING: 'Ongoing', FINISHED: 'Completed', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled', HIATUS: 'Hiatus' }[s] || s;
}

// ── Poster card ───────────────────────────────────────────────────────
// One-line pull-quote out of the AniList synopsis — first sentence only,
// with HTML, AniList's ~!spoiler!~ markers and the trailing "(Source: …)"
// credit stripped. A card that says something about the story beats one
// that just repeats the year and chapter count.
function blurbOf(m) {
  var raw = (m.description || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/~!|!~|__|\*\*|\*/g, '')
    .replace(/\(Source:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  var end = raw.search(/[.!?](\s|$)/);
  var s = end > 0 ? raw.slice(0, end + 1) : raw;
  if (s.length > 120) s = s.slice(0, 116).replace(/\s+\S*$/, '') + '…';
  return s;
}

// Depends on isSavedLocally (assets/auth.js) — auth.js must load first.
function posterCard(m) {
  var score = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
  var saved = isSavedLocally(m.id);
  var fmt = formatLabel(m);
  var blurb = blurbOf(m);
  var cover = (m.coverImage.extraLarge || m.coverImage.large);
  var meta = (m.startDate && m.startDate.year ? m.startDate.year : '') + (m.chapters ? ' · ' + m.chapters + ' ch' : '');
  var tags = (m.genres || []).slice(0, 2).map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('');
  return '<a class="poster" data-title="' + esc(titleOf(m)) + '" href="#/title/' + m.id + '" onclick="navigate(\'/title/' + m.id + '\');return false;">' +
    '<div class="poster-img-wrap">' +
      '<img src="' + cover + '" alt="' + esc(titleOf(m)) + ' cover art" loading="lazy" />' +
      '<div class="poster-chips">' +
        '<span class="poster-badge" data-fmt="' + fmt + '">' + fmt + '</span>' +
        '<span class="poster-chips-right">' +
          (score ? '<span class="poster-score"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 7.9H22l-6.3 4.6 2.4 7.9L12 17.8 5.9 22.4l2.4-7.9L2 9.9h7.4z"/></svg>' + score + '</span>' : '') +
          '<button class="poster-save' + (saved ? ' active' : '') + '" type="button" aria-label="' + (saved ? 'Remove from Library' : 'Save to Library') + '" data-id="' + m.id + '">' +
            '<svg viewBox="0 0 24 24" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
          '</button>' +
        '</span>' +
      '</div>' +
      '<div class="poster-body">' +
        '<div class="poster-title">' + esc(titleOf(m)) + '</div>' +
        (blurb ? '<div class="poster-blurb">“' + esc(blurb) + '”</div>' : '') +
        (tags || meta ? '<div class="poster-tags">' + tags + (meta ? '<span class="poster-meta">' + meta + '</span>' : '') + '</div>' : '') +
      '</div>' +
    '</div>' +
  '</a>';
}

// Event-delegated so it keeps working across re-renders; call once per page.
function wirePosterSaveButtons() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.poster-save');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var card = btn.closest('.poster');
    var id = btn.getAttribute('data-id');
    var title = card ? card.getAttribute('data-title') : '';
    var img = card ? card.querySelector('img') : null;
    btn.disabled = true;
    toggleSave(id, title, img ? img.src : '').then(function (res) {
      btn.disabled = false;
      btn.classList.toggle('active', res.saved);
      btn.setAttribute('aria-label', res.saved ? 'Remove from Library' : 'Save to Library');
      btn.querySelector('svg').setAttribute('fill', res.saved ? 'currentColor' : 'none');
      if (!res.synced) {
        btn.classList.add('sync-error');
        btn.setAttribute('title', "Saved locally, but couldn't sync to your account.");
        setTimeout(function () { btn.classList.remove('sync-error'); }, 2600);
      } else {
        btn.removeAttribute('title');
      }
    });
  });
}

function skeletonGrid(n) {
  var out = '<div class="grid">';
  for (var i = 0; i < n; i++) out += '<div class="poster"><div class="poster-img-wrap skeleton"></div></div>';
  return out + '</div>';
}

// ── Offline stand-ins ─────────────────────────────────────────────────
// assets/fallback-titles.json is a baked slice of our own catalog, shaped
// like AniList media nodes, for when AniList is unreachable. It has been
// unreachable for days at a time ("temporarily disabled due to severe
// stability issues"), so this is a normal path, not a corner case.
//
// Lives here rather than in each page because it didn't: the homepage and
// /discover/ grew separate copies, and the second one rendered an empty
// grid where the first rendered 24 covers. One implementation, one
// behaviour, both pages.
var _fallbackTitlesPromise = null;
function loadFallbackTitles() {
  if (!_fallbackTitlesPromise) {
    _fallbackTitlesPromise = fetch('/assets/fallback-titles.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        // A failed fetch must not be memoised as "there is nothing" — the
        // next caller (or the next rail on the page) deserves a real try.
        if (!data) _fallbackTitlesPromise = null;
        return data;
      });
  }
  return _fallbackTitlesPromise;
}

// Fills `el` with stand-in posters. Resolves true if anything was drawn, so
// the caller can decide what to say when there wasn't. Never writes an
// "AniList is down" notice: an upstream outage is not the reader's problem
// and makes a working site look broken.
function renderFallbackRail(el, key, limit) {
  return loadFallbackTitles().then(function (data) {
    var list = (data && data[key]) || [];
    if (!list.length) return false;
    var html = '';
    for (var i = 0; i < list.length && (!limit || i < limit); i++) {
      // One malformed node shouldn't cost the whole rail.
      try { html += posterCard(list[i]); } catch (e) { /* skip */ }
    }
    if (!html) return false;
    el.innerHTML = html;
    return true;
  }).catch(function () { return false; });
}
