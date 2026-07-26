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

function truncate(s, n) {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + '…' : clean;
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

function pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath d='M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z' fill='%237B5CFF'/%3E%3Ccircle cx='512' cy='512' r='46' fill='%230E0820'/%3E%3C/svg%3E" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="theme-color" content="#6B46F0" />
<link rel="preload" href="/assets/fonts.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link rel="stylesheet" href="/assets/fonts.css" /></noscript>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
  :root { --bg:#F6F3FB; --bg-panel:#FFFFFF; --ink:#16121F; --ink-muted:#5B5570; --ink-faint:#8A84A0; --accent:#6B46F0; --line:rgba(107,70,240,0.16); color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0D0C11; --bg-panel:#17151F; --ink:#F3F1F8; --ink-muted:#A39DB8; --ink-faint:#6D6785; --accent:#7B5CFF; --line:rgba(123,92,255,0.18); color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Strip Text', -apple-system, system-ui, sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color: inherit; }
  main { max-width: 760px; margin: 0 auto; padding: clamp(20px,5vw,48px) clamp(20px,5vw,32px) 64px; }
  .brand { display:inline-flex; align-items:center; gap:8px; text-decoration:none; font-weight:800; font-size:1.02rem; margin-bottom:28px; }
  .brand svg { width:22px; height:22px; }
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
  footer { max-width:760px; margin:0 auto; padding: 0 clamp(20px,5vw,32px) 40px; font-size:0.78rem; color:var(--ink-faint); }
  footer a { color: var(--ink-muted); text-decoration:none; }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<main>
  <a class="brand" href="/">
    <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z" fill="#7B5CFF" /><circle cx="512" cy="512" r="46" fill="#0E0820" /></svg>
    <span>Manga<b>Recs</b></span>
  </a>
  ${bodyHtml}
</main>
<footer>
  <a href="/">Home</a> · <a href="/catalog/">Full Catalog</a> · <a href="/features/">Features</a> · <a href="/about/">About</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a>
</footer>
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
  const shortDesc = truncate(m.description, 155);
  const authors = authorsOf(m);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: m.title,
    description: m.description,
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
  <p class="desc">${esc(m.description)}</p>
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
    ${titles.map((m) => {
      const cover = POOL_COVER_URLS[m.id];
      return `<a class="card" href="/catalog/title/${encodeURIComponent(m.id)}/">
        <div class="cover">${cover ? `<img src="${esc(cover)}" alt="${esc(m.title)} cover art" loading="lazy" />` : ''}</div>
        <div class="t">${esc(m.title)}</div>
      </a>`;
    }).join('')}
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
  const staticEntries = [
    { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/catalog/`, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE}/features/`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE}/about/`, changefreq: 'monthly', priority: '0.4' },
    { loc: `${SITE}/privacy/`, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/terms/`, changefreq: 'monthly', priority: '0.3' },
  ];
  const formatEntries = formatPaths.map((loc) => ({ loc, changefreq: 'weekly', priority: '0.6' }));
  const titleEntries = titlePaths.map((loc) => ({ loc, changefreq: 'monthly', priority: '0.5' }));
  const all = [...staticEntries, ...formatEntries, ...titleEntries];
  const body = all.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`).join('\n');
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
