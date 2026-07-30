// Cloudflare Worker — routes: mangarecs.net/catalog/title/* and /recap/*
//
// /catalog/title/* serves the real catalog page, but with per-title Open
// Graph / Twitter meta tags swapped in server-side so Discord/Twitter/Slack/
// iMessage link previews show the actual manga cover, title, and synopsis
// instead of the generic catalog card. Real browsers still get the full SPA —
// a small __SHARE_ID__ handoff (injected below) tells catalog/index.html which
// title to jump to before its router runs.
//
// /recap/<username> is different: there is no web build of MangaRecap to hand
// off to, so this serves a small STATIC page directly from the Worker — a
// non-interactive summary of the reader's most recent recap_snapshots row,
// with real OG tags so the shared link looks right in a chat app, plus a
// "Get the app" link for anyone who opens it without MangaRecs installed.
// NOT LIVE until the `recap/*` entry is added to wrangler.toml's routes and
// this worker is redeployed — see that file's comment.
//
// Looks titles up directly against the live `manga_pool` Supabase table by
// its TEXT id (the same id the app's Share.share() calls send, e.g. "sh" or
// a MangaDex UUID) — NOT by AniList numeric id, which the app never has on
// hand client-side and which risks the exact kind of title-mismatch already
// seen when reconciling the pool against AniList by title search.

const SUPABASE_URL = 'https://jlzsnmwyyjefjekscvgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_L47c82XgIO4CqOhQFbsxvQ_4D3Io0dL';

function parseShareId(pathname) {
  // /catalog/title/<pool-id>/<optional-slug>/
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'catalog' || parts[1] !== 'title' || !parts[2]) return null;
  return decodeURIComponent(parts[2]);
}

function parseRecapUsername(pathname) {
  // /recap/<username>/
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'recap' || !parts[1]) return null;
  return decodeURIComponent(parts[1]);
}

async function fetchProfileByUsername(username) {
  const url =
    `${SUPABASE_URL}/rest/v1/profiles` +
    `?username=eq.${encodeURIComponent(username)}&select=id,username,display_name,avatar_url,color`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

async function fetchLatestSnapshot(userId) {
  const url =
    `${SUPABASE_URL}/rest/v1/recap_snapshots` +
    `?user_id=eq.${encodeURIComponent(userId)}&order=period_start.desc&limit=1` +
    `&select=period_label,stats`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A plain static page — no framework, no build step, matching this worker's
// existing philosophy. Deliberately does not re-derive utils/recapIdentity.js's
// palette engine here; that stays a client concern. This page's only job is
// to look right as a link preview and give a non-app viewer something worth
// reading, not to replicate the interactive story.
function renderRecapPage(profile, snapshot, shareUrl) {
  const name = profile.display_name || profile.username;
  const s = snapshot?.stats || {};
  const accent = s.topSeriesColor || '#B0362F';
  const title = `${name}'s MangaRecap — ${esc(snapshot?.period_label || '')}`;
  const desc = s.personalityTitle
    ? `${s.chapters || 0} chapters · ${s.series || 0} series · ${s.personalityTitle}`
    : 'See what this reader read this half on MangaRecs.';
  const ogImage = s.topSeriesCover || 'https://mangarecs.net/assets/og-default.png';

  const stat = (v, l) => `<div class="cell"><div class="val">${esc(v ?? '—')}</div><div class="lbl">${esc(l)}</div></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImage)}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#0a0710; background-image: radial-gradient(circle at 30% 15%, ${esc(accent)}33, transparent 60%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
  .card { width:100%; max-width:420px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.14);
    border-radius:20px; padding:26px; color:#fff; }
  .kicker { font-size:11px; font-weight:900; letter-spacing:2px; color:${esc(accent)}; text-transform:uppercase; }
  h1 { font-size:22px; margin:8px 0 2px; }
  .perso { font-size:13px; font-weight:800; color:${esc(accent)}; margin-bottom:16px; }
  .grid { display:flex; flex-wrap:wrap; gap:16px 0; margin-bottom: 18px; }
  .cell { width:50%; }
  .val { font-size:26px; font-weight:800; }
  .lbl { font-size:10px; font-weight:800; letter-spacing:1px; color:rgba(255,255,255,0.55); text-transform:uppercase; }
  .cta { display:block; text-align:center; background:${esc(accent)}; color:#12080C; font-weight:800;
    padding:13px; border-radius:999px; text-decoration:none; margin-top:4px; }
  .foot { text-align:center; font-size:11px; color:rgba(255,255,255,0.4); margin-top:14px; letter-spacing:0.5px; }
</style>
</head>
<body>
  <div class="card">
    <div class="kicker">MANGARECAP · ${esc(snapshot?.period_label || '')}</div>
    <h1>${esc(name)}</h1>
    ${s.personalityTitle ? `<div class="perso">${esc(s.personalityTitle)}</div>` : ''}
    <div class="grid">
      ${stat(s.chapters, 'Chapters')}
      ${stat(s.series, 'Series')}
      ${stat(s.hours != null ? Math.round(s.hours) : null, 'Hours')}
      ${stat(s.longest, 'Day streak')}
    </div>
    ${s.topSeriesTitle ? `<div class="foot" style="margin-bottom:14px">Top series: ${esc(s.topSeriesTitle)}</div>` : ''}
    <a class="cta" href="mangarecs://recap">Get your own MangaRecap</a>
    <div class="foot">MangaRecs · mangarecs.net</div>
  </div>
</body>
</html>`;
}

async function fetchTitle(id) {
  const url =
    `${SUPABASE_URL}/rest/v1/manga_pool` +
    `?id=eq.${encodeURIComponent(id)}` +
    `&select=id,title,description,rating,cover_url`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

function plainSynopsis(text, max) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trim() + '…' : clean || 'Browse this title on MangaRecs.';
}

class MetaRewriter {
  constructor(m, shareUrl) {
    this.m = m;
    this.shareUrl = shareUrl;
  }
  element(el) {
    const name = el.getAttribute('name');
    const prop = el.getAttribute('property');
    const m = this.m;
    if (el.tagName === 'title') return; // handled by TitleRewriter (text node access needed)
    if (name === 'description') el.setAttribute('content', plainSynopsis(m.description, 200));
    else if (prop === 'og:title') el.setAttribute('content', m.title + ' — MangaRecs');
    else if (prop === 'og:description') el.setAttribute('content', plainSynopsis(m.description, 200));
    else if (prop === 'og:image' && m.cover_url) el.setAttribute('content', m.cover_url);
    else if (prop === 'og:url') el.setAttribute('content', this.shareUrl);
    else if (prop === 'og:image:width' || prop === 'og:image:height') el.remove();
    else if (name === 'twitter:image' && m.cover_url) el.setAttribute('content', m.cover_url);
  }
}

class TitleRewriter {
  constructor(m) {
    this.m = m;
  }
  element(el) {
    el.setInnerContent(this.m.title + ' — MangaRecs');
  }
}

class HeadHandoff {
  constructor(id) {
    this.id = id;
  }
  element(el) {
    el.append(`<script>window.__SHARE_ID__=${JSON.stringify(String(this.id))};</script>`, { html: true });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const username = parseRecapUsername(url.pathname);
    if (username) {
      const cache = caches.default;
      const cacheKey = new Request('https://mangarecs.net/__recap_cache/' + username, request);
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const profile = await fetchProfileByUsername(username).catch(() => null);
      if (!profile) return new Response('Reader not found', { status: 404 });
      const snapshot = await fetchLatestSnapshot(profile.id).catch(() => null);

      const html = renderRecapPage(profile, snapshot, url.toString());
      const response = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      response.headers.set('Cache-Control', 'public, max-age=1800');
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    const id = parseShareId(url.pathname);
    if (!id) return fetch('https://mangarecs.net/catalog/', request);

    const cache = caches.default;
    const cacheKey = new Request('https://mangarecs.net/__share_cache/' + id, request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const [originRes, media] = await Promise.all([
      fetch('https://mangarecs.net/catalog/', request),
      fetchTitle(id).catch(() => null),
    ]);

    if (!media) return originRes; // unknown/removed id — fall back to the plain catalog shell

    const shareUrl = url.toString();
    let rewritten = new HTMLRewriter()
      .on('title', new TitleRewriter(media))
      .on('meta', new MetaRewriter(media, shareUrl))
      .on('head', new HeadHandoff(id))
      .transform(originRes);

    const response = new Response(rewritten.body, rewritten);
    response.headers.set('Cache-Control', 'public, max-age=3600');
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
