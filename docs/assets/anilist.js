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
  'countryOfOrigin chapters volumes averageScore startDate { year } endDate { year } ' +
  'coverImage { extraLarge large color } bannerImage isAdult ' +
  'staff(perPage: 6) { edges { role node { name { full } } } } ' +
  'characters(perPage: 8, sort: ROLE) { edges { role node { id name { full } image { medium } } } } ' +
  'tags { name isMediaSpoiler rank } ' +
  'externalLinks { url site }';

function searchMedia(query, category, page) {
  var filters = 'search: $search, type: MANGA, sort: SEARCH_MATCH';
  if (category && category.country) filters += ', countryOfOrigin: "' + category.country + '"';
  if (category && category.formats) filters += ', format_in: [' + category.formats.join(',') + ']';
  var gql = 'query($search: String, $page: Int) { Page(page: $page, perPage: 24) { pageInfo { hasNextPage } media(' + filters + ') { ' + MEDIA_FIELDS + ' } } }';
  return alFetch(gql, { search: query || undefined, page: page || 1 });
}

function trendingMedia(category, page, sort) {
  var filters = 'sort: ' + (sort || 'TRENDING_DESC') + ', type: MANGA';
  if (category && category.country) filters += ', countryOfOrigin: "' + category.country + '"';
  if (category && category.formats) filters += ', format_in: [' + category.formats.join(',') + ']';
  var gql = 'query($page: Int) { Page(page: $page, perPage: 24) { media(' + filters + ') { ' + MEDIA_FIELDS + ' } } }';
  return alFetch(gql, { page: page || 1 });
}

function mediaById(id) {
  var gql = 'query($id: Int) { Media(id: $id, type: MANGA) { ' + MEDIA_FIELDS + ' } }';
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
function posterCard(m) {
  var score = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
  return '<a class="poster" href="#/title/' + m.id + '" onclick="navigate(\'/title/' + m.id + '\');return false;">' +
    '<div class="poster-img-wrap">' +
      '<img src="' + m.coverImage.large + '" alt="" loading="lazy" />' +
      '<span class="poster-badge">' + formatLabel(m) + '</span>' +
      (score ? '<span class="poster-score"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 7.9H22l-6.3 4.6 2.4 7.9L12 17.8 5.9 22.4l2.4-7.9L2 9.9h7.4z"/></svg>' + score + '</span>' : '') +
    '</div>' +
    '<div class="poster-title">' + esc(titleOf(m)) + '</div>' +
    '<div class="poster-meta">' + (m.startDate.year || '') + (m.chapters ? ' · ' + m.chapters + ' ch' : '') + '</div>' +
  '</a>';
}

function skeletonGrid(n) {
  var out = '<div class="grid">';
  for (var i = 0; i < n; i++) out += '<div class="poster"><div class="poster-img-wrap skeleton"></div><div style="height:12px;width:80%;border-radius:4px;" class="skeleton"></div></div>';
  return out + '</div>';
}
