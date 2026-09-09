// Static-page generator for SEO — run with: node scripts/generateCatalogPages.mjs
//
// The public catalog (docs/catalog/index.html) is a hash-routed SPA
// (#/title/<id>), so individual titles have no real server path — crawlers
// can't index them, sitemap.xml can't list them, and link unfurls (Discord/
// Twitter/iMessage) can't show per-title previews. This script bakes one
// real, crawlable, static HTML file per curated pool title (from
// utils/mangaPool.js — the ~730 hand-authored entries, NOT the ~5,300-row
// live `manga_pool` Supabase table, which is MangaDex-sourced, volatile, and
// reseeded periodically per memory — prerendering that would need a
// scheduled rebuild against live DB state, a separate follow-up), plus four
// static format landing pages, then regenerates sitemap.xml to include all
// of it.
//
// Re-run this whenever utils/mangaPool.js changes (new titles added, covers
// rebaked). Output is fully generated — do not hand-edit files under
// docs/catalog/title/ or docs/catalog/{manga,manhwa,manhua,webcomic}/.

import { MANGA_POOL } from '../utils/mangaPool.js';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, '../docs');
const SITE = 'https://mangarecs.net';

const FORMAT_BY_LANG = { ja: 'Manga', ko: 'Manhwa', zh: 'Manhua', en: 'Webcomic' };
const FORMAT_SLUGS = [
  { slug: 'manga', lang: 'ja', label: 'Manga' },
  { slug: 'manhwa', lang: 'ko', label: 'Manhwa' },
  { slug: 'manhua', lang: 'zh', label: 'Manhua' },
  { slug: 'webcomic', lang: 'en', label: 'Webcomic' },
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Trailing punctuation that reads as a finished thought.
const ENDS_CLEANLY = /[.!?…"'\)\]]$/;
// Dangling connectives left at a cut: "and", "of", "to the" etc. read worse
// than stopping a word earlier.
const DANGLING = /\s+(a|an|and|as|at|but|by|for|from|in|into|of|on|or|the|to|with|that|which|who|when|while)$/i;

function tidyCut(text) {
  let out = text.replace(/[\s,;:\-–—]+$/, '');
  while (DANGLING.test(out)) out = out.replace(DANGLING, '');
  return out;
}

// The pool's synopses are stored pre-truncated at ~320 characters with no
// ellipsis, so 392 of 587 publishable entries end without terminal
// punctuation and 383 stop mid-word ("For the past century, w"). That is the
// single worst-looking thing on the public site, and it is in the DATA — the
// generator was faithfully printing what it was given.
//
// Prefer the last complete sentence when that keeps most of the text;
// otherwise drop the partial word and mark the elision honestly.
function cleanSynopsis(s) {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  if (ENDS_CLEANLY.test(clean)) return clean;

  const lastStop = Math.max(
    clean.lastIndexOf('. '), clean.lastIndexOf('! '), clean.lastIndexOf('? ')
  );
  if (lastStop > clean.length * 0.55) return clean.slice(0, lastStop + 1);

  const lastSpace = clean.lastIndexOf(' ');
  const cut = lastSpace > 0 ? clean.slice(0, lastSpace) : clean;
  return tidyCut(cut) + '…';
}

function truncate(s, n) {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return ENDS_CLEANLY.test(clean) ? clean : tidyCut(clean) + '…';
  const slice = clean.slice(0, n - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return tidyCut(lastSpace > n * 0.5 ? slice.slice(0, lastSpace) : slice) + '…';
}

function authorsOf(m) {
  if (!m.author) return [];
  return m.author.split(/,| & /).map((n) => n.trim()).filter(Boolean);
}

// Entries worth a public, indexable page: real synopsis text, not NSFW
// (this app has an adult-content gate on the AniList-browsing side of the
// catalog — pool titles have no such gate today, so excluding nsfw:true
// entirely from the crawlable/sitemap surface is the safe default rather
// than publishing them unguarded).
const PUBLISHABLE = MANGA_POOL.filter((m) => !m.nsfw && m.description);

// Every title page was a leaf: 587 pages with no lateral link, while the
// .grid/.card CSS for exactly this shipped on all of them and went unused.
// Rank same-format titles by shared genres, break ties on rating.
const RELATED_COUNT = 6;

function relatedTo(m) {
  const mine = new Set(m.genres || []);
  return PUBLISHABLE
    .filter((o) => o.id !== m.id && o.lang === m.lang)
    .map((o) => ({
      m: o,
      shared: (o.genres || []).reduce((n, g) => n + (mine.has(g) ? 1 : 0), 0),
    }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => (b.shared - a.shared) || ((b.m.rating || 0) - (a.m.rating || 0)))
    .slice(0, RELATED_COUNT)
    .map((x) => x.m);
}

function cardHtml(m) {
  const cover = POOL_COVER_URLS[m.id];
  return `<a class="card" href="/catalog/title/${encodeURIComponent(m.id)}/">
        <div class="cover">${cover ? `<img src="${esc(cover)}" alt="${esc(m.title)} cover art" loading="lazy" />` : ''}</div>
        <div class="t">${esc(m.title)}</div>
      </a>`;
}

function pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Applies the saved theme before first paint, exactly as docs/index.html and
     the catalog SPA do. Without it a visitor who chose Light on the homepage
     watched every title page flash back to their OS theme. -->
<script>(function(){try{var t=localStorage.getItem('mangarecs_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" href="/assets/favicon.png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="theme-color" content="#F6F3FB" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0D0C11" media="(prefers-color-scheme: dark)" />
<link rel="preload" href="/assets/fonts.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link rel="stylesheet" href="/assets/fonts.css" /></noscript>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
  :root { --bg:#F6F3FB; --bg-panel:#FFFFFF; --bg-sunken:#EFEAFA; --ink:#16121F; --ink-muted:#5B5570; --ink-faint:#8A84A0; --accent:#6B46F0; --line:rgba(107,70,240,0.16); color-scheme: light; }
  /* Three states, same as the rest of the site: no attribute = follow the OS,
     data-theme = the visitor chose, and the choice has to win both ways. */
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0D0C11; --bg-panel:#17151F; --bg-sunken:#1D1A26; --ink:#F3F1F8; --ink-muted:#A39DB8; --ink-faint:#6D6785; --accent:#7B5CFF; --line:rgba(123,92,255,0.18); color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#0D0C11; --bg-panel:#17151F; --bg-sunken:#1D1A26; --ink:#F3F1F8; --ink-muted:#A39DB8; --ink-faint:#6D6785; --accent:#7B5CFF; --line:rgba(123,92,255,0.18); color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Strip Text', -apple-system, system-ui, sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color: inherit; }
  main { max-width: 760px; margin: 0 auto; padding: clamp(20px,5vw,48px) clamp(20px,5vw,32px) 64px; }
  .brand { display:inline-flex; align-items:center; gap:8px; text-decoration:none; font-weight:800; font-size:1.02rem; margin-bottom:28px; }
  .brand svg { width:22px; height:22px; }
  .brand img { height:30px; width:auto; }
  .brand b { color: var(--accent); }
  .crumb { font-size:0.82rem; color:var(--ink-muted); margin-bottom:18px; }
  .crumb a { color:var(--ink-muted); text-decoration:underline; }
  .crumb a:hover { color:var(--accent); }
  h1 { font-size: clamp(1.6rem,4vw,2.3rem); margin: 0 0 4px; }
  .badges { display:flex; gap:8px; flex-wrap:wrap; margin: 10px 0 20px; }
  .chip { font-size:0.76rem; font-weight:700; padding:5px 11px; border-radius:999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .hero { display:flex; gap:24px; flex-wrap:wrap; }
  .cover { width:180px; flex:none; border-radius:12px; overflow:hidden; background:var(--bg-panel); box-shadow:0 12px 30px -16px rgba(0,0,0,0.35); }
  .cover img { width:100%; display:block; }
  .meta { flex:1; min-width:240px; }
  .desc { margin-top:22px; color:var(--ink); font-size:0.98rem; max-width:66ch; }
  .facts { margin-top:18px; font-size:0.86rem; color:var(--ink-muted); display:grid; grid-template-columns:auto 1fr; gap:6px 14px; max-width:360px; }
  .facts dt { font-weight:700; color:var(--ink-faint); }
  .facts dd { margin:0; }
  .cta { display:flex; gap:10px; flex-wrap:wrap; margin-top:24px; }
  .btn { display:inline-flex; align-items:center; padding:11px 18px; border-radius:10px; font-weight:700; font-size:0.9rem; text-decoration:none; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-ghost { border:1px solid var(--line); color:var(--ink); }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:18px; margin-top:24px; }
  .card { text-decoration:none; color:var(--ink); }
  .card .cover { width:100%; aspect-ratio:2/3; margin-bottom:8px; }
  .card .t { font-size:0.86rem; font-weight:700; }
  .topnav { position:sticky; top:0; z-index:10; background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }
  .topnav-in { max-width:760px; margin:0 auto; padding:10px clamp(20px,5vw,32px); display:flex; align-items:center; gap:14px; }
  .topnav .brand { margin:0; flex:none; font-size:0.95rem; }
  .navsearch { flex:1; min-width:0; display:flex; }
  .navsearch input { width:100%; font:inherit; font-size:0.85rem; padding:7px 12px; border-radius:999px; border:1px solid var(--line); background:var(--bg-panel); color:var(--ink); }
  .navsearch input::placeholder { color:var(--ink-faint); }
  .navlinks { display:flex; align-items:center; gap:14px; flex:none; font-size:0.84rem; }
  .navlinks a { color:var(--ink-muted); text-decoration:none; }
  .navlinks a:hover { color:var(--accent); }
  .theme-btn { background:none; border:1px solid var(--line); border-radius:999px; color:var(--ink-muted); cursor:pointer; font:inherit; font-size:0.78rem; padding:5px 11px; }
  .theme-btn:hover { color:var(--accent); }
  @media (max-width:640px) { .navlinks .opt { display:none; } }
  .related { margin-top:48px; border-top:1px solid var(--line); padding-top:26px; }
  .related h2 { font-size:1.05rem; margin:0 0 4px; }
  .related p.sub { margin:0; font-size:0.84rem; color:var(--ink-muted); }
  footer { max-width:760px; margin:0 auto; padding: 0 clamp(20px,5vw,32px) 40px; font-size:0.78rem; color:var(--ink-faint); }
  footer a { color: var(--ink-muted); text-decoration:none; }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<header class="topnav">
  <div class="topnav-in">
    <a class="brand" href="/">
      <img src="/assets/logo-mark.png" alt="MangaRecs" width="40" height="30" decoding="async" />
    </a>
    <form class="navsearch" action="/catalog/" method="get" role="search" onsubmit="return mrSearch(this);">
      <input type="search" name="q" placeholder="Search the catalog…" aria-label="Search the catalog" autocomplete="off" />
    </form>
    <nav class="navlinks">
      <a class="opt" href="/catalog/">Catalog</a>
      <a class="opt" href="/features/">Features</a>
      <button class="theme-btn" type="button" id="themeBtn" aria-label="Switch between light and dark theme">Theme</button>
    </nav>
  </div>
</header>
<main>
  ${bodyHtml}
</main>
<footer>
  <a href="/">Home</a> · <a href="/catalog/">Full Catalog</a> · <a href="/features/">Features</a> · <a href="/about/">About</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a>
</footer>
<script>
  // The catalog is a hash-routed SPA, so a plain GET would land on /catalog/?q=
  // and lose the term. Hand it straight to the route the SPA already has.
  function mrSearch(form){
    var q = (form.q.value || '').trim();
    window.location.href = q ? '/catalog/#/search/' + encodeURIComponent(q) : '/catalog/';
    return false;
  }
  (function(){
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var root = document.documentElement;
      var cur = root.getAttribute('data-theme');
      if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('mangarecs_theme', next); } catch (e) {}
    });
  })();
</script>
<script src="/assets/analytics.js" defer></script>
</body>
</html>
`;
}

function renderTitlePage(m) {
  const cover = POOL_COVER_URLS[m.id] || '';
  const ogImage = cover || `${SITE}/assets/og-image.png`;
  const format = FORMAT_BY_LANG[m.lang] || 'Manga';
  const formatSlug = FORMAT_SLUGS.find((f) => f.lang === m.lang)?.slug || 'manga';
  const canonical = `${SITE}/catalog/title/${encodeURIComponent(m.id)}/`;
  const synopsis = cleanSynopsis(m.description);
  const shortDesc = truncate(m.description, 155);
  const related = relatedTo(m);
  const authors = authorsOf(m);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: m.title,
    description: synopsis,
    inLanguage: m.lang,
    bookFormat: 'https://schema.org/GraphicNovel',
    genre: m.genres || [],
    url: canonical,
    ...(cover ? { image: cover } : {}),
    ...(authors.length ? { author: authors.map((n) => ({ '@type': 'Person', name: n })) } : {}),
  };

  const bodyHtml = `
  <div class="crumb"><a href="/catalog/">Catalog</a> / <a href="/catalog/${formatSlug}/">${esc(format)}</a> / ${esc(m.title)}</div>
  <div class="hero">
    <div class="cover">${cover ? `<img src="${esc(cover)}" alt="${esc(m.title)} cover art" width="360" height="512" loading="lazy" />` : ''}</div>
    <div class="meta">
      <h1>${esc(m.title)}</h1>
      <div class="badges">
        <span class="chip">${esc(format)}</span>
        ${m.status ? `<span class="chip">${esc(m.status === 'ongoing' ? 'Ongoing' : m.status === 'completed' ? 'Completed' : m.status)}</span>` : ''}
        ${(m.genres || []).slice(0, 4).map((g) => `<span class="chip">${esc(g)}</span>`).join('')}
      </div>
      <dl class="facts">
        ${m.rating ? `<dt>Rating</dt><dd>${Number(m.rating).toFixed(1)} / 10</dd>` : ''}
        ${authors.length ? `<dt>Creator</dt><dd>${esc(authors.join(', '))}</dd>` : ''}
        ${m.chapters ? `<dt>Chapters</dt><dd>${esc(m.chapters)}</dd>` : ''}
        ${m.readers ? `<dt>Readers</dt><dd>${esc(m.readers)}</dd>` : ''}
      </dl>
      <div class="cta">
        <a class="btn btn-primary" href="mangarecs://series/${encodeURIComponent(m.title)}">Open in the MangaRecs app</a>
        <a class="btn btn-ghost" href="/catalog/#/title/${encodeURIComponent(m.id)}">Track it &amp; see live rating</a>
      </div>
    </div>
  </div>
  <p class="desc">${esc(synopsis)}</p>
  ${related.length ? `<section class="related">
    <h2>More ${esc(format.toLowerCase())} like this</h2>
    <p class="sub">Picked on shared genres with ${esc(m.title)}.</p>
    <div class="grid">
      ${related.map(cardHtml).join('')}
    </div>
  </section>` : ''}
  `;

  return pageShell({
    title: `${m.title} — MangaRecs`,
    description: shortDesc,
    canonical,
    ogImage,
    jsonLd,
    bodyHtml,
  });
}

function renderFormatPage({ slug, lang, label }) {
  const titles = PUBLISHABLE.filter((m) => m.lang === lang).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const canonical = `${SITE}/catalog/${slug}/`;
  const description = `Browse ${titles.length} ${label.toLowerCase()} titles on MangaRecs — track progress, rate, and get personalized recs.`;

  const bodyHtml = `
  <div class="crumb"><a href="/catalog/">Catalog</a> / ${esc(label)}</div>
  <h1>${esc(label)}</h1>
  <p class="desc" style="margin-top:6px;">${esc(titles.length)} titles, curated and tracked on MangaRecs.</p>
  <div class="grid">
    ${titles.map(cardHtml).join('')}
  </div>
  `;

  return pageShell({
    title: `${label} — MangaRecs Catalog`,
    description,
    canonical,
    ogImage: `${SITE}/assets/og-image.png`,
    jsonLd: null,
    bodyHtml,
  });
}

function buildSitemap(titlePaths, formatPaths) {
  // 716 of 722 entries were stuck at 2026-07-26 because nothing ever wrote a
  // lastmod. Stamped at generation time, which is when the pages change.
  const lastmod = new Date().toISOString().slice(0, 10);
  const staticEntries = [
    { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/catalog/`, changefreq: 'daily', priority: '0.8' },
    // Both discover views share one page and differ only by ?c=, so the
    // bare URL is the one crawlers get; the query variant is the same
    // document with a different rail loaded into it.
    { loc: `${SITE}/discover/`, changefreq: 'daily', priority: '0.7' },
    { loc: `${SITE}/features/`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE}/badges/`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE}/schedule/`, changefreq: 'weekly', priority: '0.5' },
    { loc: `${SITE}/about/`, changefreq: 'monthly', priority: '0.4' },
    { loc: `${SITE}/privacy/`, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/terms/`, changefreq: 'monthly', priority: '0.3' },
  ];
  const formatEntries = formatPaths.map((loc) => ({ loc, changefreq: 'weekly', priority: '0.6' }));
  const titleEntries = titlePaths.map((loc) => ({ loc, changefreq: 'monthly', priority: '0.5' }));
  const all = [...staticEntries, ...formatEntries, ...titleEntries];
  const body = all.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function main() {
  const titleDir = join(DOCS_DIR, 'catalog/title');
  if (existsSync(titleDir)) rmSync(titleDir, { recursive: true, force: true });
  mkdirSync(titleDir, { recursive: true });

  const titlePaths = [];
  for (const m of PUBLISHABLE) {
    const dir = join(titleDir, m.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderTitlePage(m), 'utf8');
    titlePaths.push(`${SITE}/catalog/title/${encodeURIComponent(m.id)}/`);
  }

  const formatPaths = [];
  for (const f of FORMAT_SLUGS) {
    const dir = join(DOCS_DIR, 'catalog', f.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderFormatPage(f), 'utf8');
    formatPaths.push(`${SITE}/catalog/${f.slug}/`);
  }

  writeFileSync(join(DOCS_DIR, 'sitemap.xml'), buildSitemap(titlePaths, formatPaths), 'utf8');

  console.log(`Generated ${titlePaths.length} title pages (skipped ${MANGA_POOL.length - PUBLISHABLE.length} nsfw/no-synopsis entries) and ${formatPaths.length} format pages.`);
  console.log('Wrote docs/sitemap.xml.');
}

main();
