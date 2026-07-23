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
function alRequest(query, variables) {
  return fetch(AL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: query, variables: variables }),
  }).then(function (r) {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }).then(function (j) {
    if (!j || !j.data) throw new Error('empty response');
    return j.data;
  });
}
function alFetch(query, variables) {
  var key = cacheKey(query, variables);
  var cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  return alRequest(query, variables)
    .catch(function () { return wait(1200).then(function () { return alRequest(query, variables); }); })
    .catch(function () { return wait(2500).then(function () { return alRequest(query, variables); }); })
    .then(function (data) { writeCache(key, data); return data; });
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

// Batched genre lookup for up to a handful of titles in a single GraphQL
// round trip (aliased Media fields), instead of one request per title —
// used by the website's Reading Recap to build a real per-user genre
// breakdown. Callers are responsible for catching failures.
function genresForTitles(titles) {
  if (!titles || !titles.length) return Promise.resolve([]);
  var capped = titles.slice(0, 12);
  var params = capped.map(function (_, i) { return '$s' + i + ': String'; }).join(', ');
  var fields = capped.map(function (_, i) { return 'm' + i + ': Media(search: $s' + i + ', type: MANGA, isAdult: false) { genres }'; }).join(' ');
  var gql = 'query(' + params + ') { ' + fields + ' }';
  var vars = {};
  capped.forEach(function (t, i) { vars['s' + i] = t; });
  return alFetch(gql, vars).then(function (data) {
    return capped.map(function (t, i) {
      var m = data['m' + i];
      return { title: t, genres: (m && m.genres) || [] };
    });
  });
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
// Depends on isSavedLocally (assets/auth.js) — auth.js must load first.
function posterCard(m) {
  var score = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
  var saved = isSavedLocally(m.id);
  return '<a class="poster" data-title="' + esc(titleOf(m)) + '" href="#/title/' + m.id + '" onclick="navigate(\'/title/' + m.id + '\');return false;">' +
    '<div class="poster-img-wrap">' +
      '<img src="' + m.coverImage.large + '" alt="" loading="lazy" />' +
      '<span class="poster-badge">' + formatLabel(m) + '</span>' +
      (score ? '<span class="poster-score"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 7.9H22l-6.3 4.6 2.4 7.9L12 17.8 5.9 22.4l2.4-7.9L2 9.9h7.4z"/></svg>' + score + '</span>' : '') +
      '<button class="poster-save' + (saved ? ' active' : '') + '" type="button" aria-label="' + (saved ? 'Remove from Library' : 'Save to Library') + '" data-id="' + m.id + '">' +
        '<svg viewBox="0 0 24 24" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="poster-title">' + esc(titleOf(m)) + '</div>' +
    '<div class="poster-meta">' + (m.startDate.year || '') + (m.chapters ? ' · ' + m.chapters + ' ch' : '') + '</div>' +
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
  for (var i = 0; i < n; i++) out += '<div class="poster"><div class="poster-img-wrap skeleton"></div><div style="height:12px;width:80%;border-radius:4px;" class="skeleton"></div></div>';
  return out + '</div>';
}
