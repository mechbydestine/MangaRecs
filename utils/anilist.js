// Real read-only AniList sync — AniList's GraphQL API returns a user's public
// manga list by username with no OAuth needed (unlike MyAnimeList, which
// requires an authenticated app for even read access). MAL stays a plain
// profile-link button until a MAL API client id exists.
const ANILIST_API = 'https://graphql.anilist.co';

const QUERY = `
query ($name: String) {
  MediaListCollection(userName: $name, type: MANGA) {
    lists {
      entries {
        status
        progress
        score
        media { title { romaji english } }
      }
    }
  }
}`;

const STATUS_LABELS = {
  CURRENT: 'Reading',
  COMPLETED: 'Completed',
  PLANNING: 'Planning',
  DROPPED: 'Dropped',
  PAUSED: 'Paused',
  REPEATING: 'Rereading',
};

export async function fetchAnilistMangaList(username) {
  const name = (username || '').trim();
  if (!name) return null;
  try {
    const resp = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { name } }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const lists = json?.data?.MediaListCollection?.lists || [];
    const entries = lists.flatMap((l) => l.entries || []);
    if (!entries.length && !json?.data?.MediaListCollection) return null;

    const counts = {};
    entries.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });

    const current = entries
      .filter((e) => e.status === 'CURRENT')
      .sort((a, b) => (b.progress || 0) - (a.progress || 0))
      .slice(0, 5)
      .map((e) => ({
        title: e.media?.title?.english || e.media?.title?.romaji || 'Untitled',
        progress: e.progress || 0,
      }));

    return {
      total: entries.length,
      counts: Object.entries(counts).map(([status, count]) => ({
        status,
        label: STATUS_LABELS[status] || status,
        count,
      })),
      current,
    };
  } catch (_) {
    return null;
  }
}

// Best-effort character lookup for a given manga title — same public AniList
// API + query shape mangarecs.net's catalog page already uses (search by
// title, then characters(perPage, sort: ROLE)). This app is keyed by
// MangaDex UUIDs, not AniList's numeric ids, so there's no stored mapping —
// a title search is the only option. AniList's search is fuzzy, so it will
// happily return a *different* series (a same-named light novel, an unrelated
// adaptation, etc.) with its own unrelated cast — same failure mode
// scripts/reconcileWithAniList.mjs's isExactMatch guard was built to catch.
// We apply the same guard here: only trust the characters if the returned
// media's own titles/synonyms actually match what we searched for, otherwise
// return no characters rather than a confidently wrong cast.
const CHARACTERS_QUERY = `
query ($search: String) {
  Media(search: $search, type: MANGA) {
    title { romaji english native }
    synonyms
    characters(perPage: 8, sort: ROLE) {
      edges {
        role
        node { name { full } image { medium } }
      }
    }
  }
}`;

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titlesMatch(media, ...candidates) {
  const known = [
    media?.title?.romaji, media?.title?.english, media?.title?.native,
    ...(media?.synonyms || []),
  ].filter(Boolean).map(norm);
  const ours = candidates.filter(Boolean).map(norm);
  return ours.some((o) => known.includes(o));
}

// Per-title official links, curated by AniList's moderators. Same fuzzy-search
// caveat as the character lookup — and the same isExactMatch guard, which
// matters much more here: a wrong match would send someone to a *different*
// series' official page, which is worse than showing no link at all.
const LINKS_QUERY = `
query ($search: String) {
  Media(search: $search, type: MANGA) {
    title { romaji english native }
    synonyms
    externalLinks { site url type language isDisabled }
  }
}`;

export async function fetchAnilistSources(title, searchKey) {
  const search = (searchKey || title || '').trim();
  if (!search) return [];
  try {
    const resp = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: LINKS_QUERY, variables: { search } }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const media = json?.data?.Media;
    if (!media || !titlesMatch(media, title, searchKey)) return [];
    return (media.externalLinks || [])
      .filter((l) => l?.url && !l.isDisabled && l.type !== 'SOCIAL')
      .map((l) => ({ site: l.site || '', url: l.url, language: l.language || null }));
  } catch (_) {
    return [];
  }
}

export async function fetchAnilistCharacters(title, searchKey) {
  const search = (searchKey || title || '').trim();
  if (!search) return [];
  try {
    const resp = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: CHARACTERS_QUERY, variables: { search } }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const media = json?.data?.Media;
    if (!media || !titlesMatch(media, title, searchKey)) return [];
    const edges = media.characters?.edges || [];
    return edges
      .filter((e) => e.node?.image?.medium && e.node?.name?.full)
      .map((e) => ({ name: e.node.name.full, image: e.node.image.medium, main: e.role === 'MAIN' }));
  } catch (_) {
    return [];
  }
}
