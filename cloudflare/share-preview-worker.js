// Cloudflare Worker — route: mangarecs.net/catalog/title/*
// Serves the real catalog page, but with per-title Open Graph / Twitter
// meta tags swapped in server-side so Discord/Twitter/Slack/iMessage link
// previews show the actual manga cover, title, and synopsis instead of the
// generic catalog card. Real browsers still get the full SPA — a small
// __SHARE_ID__ handoff (injected below) tells catalog/index.html which
// title to jump to before its router runs.
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
