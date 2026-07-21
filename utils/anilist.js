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
// a title search is the only option, and a wrong match just means an empty
// or slightly-off character card for an obscure title, nothing persisted.
const CHARACTERS_QUERY = `
query ($search: String) {
  Media(search: $search, type: MANGA) {
    characters(perPage: 8, sort: ROLE) {
      edges {
        role
        node { name { full } image { medium } }
      }
    }
  }
}`;

export async function fetchAnilistCharacters(title) {
  const search = (title || '').trim();
  if (!search) return [];
  try {
    const resp = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: CHARACTERS_QUERY, variables: { search } }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const edges = json?.data?.Media?.characters?.edges || [];
    return edges
      .filter((e) => e.node?.image?.medium && e.node?.name?.full)
      .map((e) => ({ name: e.node.name.full, image: e.node.image.medium, main: e.role === 'MAIN' }));
  } catch (_) {
    return [];
  }
}
