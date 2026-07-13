// Cloudflare Worker — route: mangarecs.net/catalog/title/*
// Serves the real catalog page, but with per-title Open Graph / Twitter
// meta tags swapped in server-side so Discord/Twitter/Slack/iMessage link
// previews show the actual manga cover, title, and synopsis instead of the
// generic catalog card. Real browsers still get the full SPA — a small
// __SHARE_ID__ handoff (injected below) tells catalog/index.html which
// title to jump to before its router runs.

const ANILIST_QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    title { romaji english }
    description(asHtml: false)
    averageScore
    coverImage { extraLarge }
  }
}`;

function parseShareId(pathname) {
  // /catalog/title/<id>/<optional-slug>/
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'catalog' || parts[1] !== 'title' || !parts[2]) return null;
  const id = Number(parts[2]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function fetchMedia(id) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { id } }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json && json.data && json.data.Media) || null;
}

function titleOf(m) {
  return m.title.english || m.title.romaji;
}

function plainSynopsis(html, max) {
  const text = (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).trim() + '…' : text || 'Browse this title on MangaRecs.';
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
    else if (prop === 'og:title') el.setAttribute('content', titleOf(m) + ' — MangaRecs');
    else if (prop === 'og:description') el.setAttribute('content', plainSynopsis(m.description, 200));
    else if (prop === 'og:image') el.setAttribute('content', m.coverImage.extraLarge);
    else if (prop === 'og:url') el.setAttribute('content', this.shareUrl);
    else if (prop === 'og:image:width' || prop === 'og:image:height') el.remove();
    else if (name === 'twitter:image') el.setAttribute('content', m.coverImage.extraLarge);
  }
}

class TitleRewriter {
  constructor(m) {
    this.m = m;
    this.done = false;
  }
  element(el) {
    this.done = false;
    el.setInnerContent(titleOf(this.m) + ' — MangaRecs');
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
      fetchMedia(id).catch(() => null),
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
