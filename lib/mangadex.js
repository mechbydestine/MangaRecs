const MD_BASE = 'https://api.mangadex.org';
const COVER_CDN = 'https://uploads.mangadex.org/covers';
const UA = 'Inklore/1.0 (manga reader app; destinekene@gmail.com)';

async function mdFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const uri = `${MD_BASE}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(uri, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`MangaDex ${res.status}: ${path}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Public helpers ─────────────────────────────────────────────────────────────

export function getCoverUrl(mangaId, filename) {
  if (!mangaId || !filename) return null;
  return `${COVER_CDN}/${mangaId}/${filename}.256.jpg`;
}

export async function fetchMangaBatch(offset = 0, limit = 20) {
  const raw = await mdFetch('/manga', {
    limit,
    offset,
    'order[followedCount]': 'desc',
    'contentRating[]': ['safe', 'suggestive'],
    'includes[]': ['cover_art', 'author', 'artist'],
    availableTranslatedLanguage: 'en',
  });

  return (raw.data || []).map(cleanMangaData);
}

export function cleanMangaData(raw) {
  const attr = raw.attributes || {};

  // Title — prefer English, then romaji, then any
  const t = attr.title || {};
  const title = t.en || t['ja-ro'] || t.ja || Object.values(t)[0] || 'Unknown';

  // Description
  const d = attr.description || {};
  const description = (d.en || d['ja-ro'] || Object.values(d)[0] || '').slice(0, 500);

  // Genres from tags
  const genres = (attr.tags || [])
    .filter(tag => tag.attributes?.group === 'genre')
    .map(tag => {
      const tn = tag.attributes?.name || {};
      return tn.en || Object.values(tn)[0] || '';
    })
    .filter(Boolean)
    .filter(g => /^[A-Za-z\s\-]+$/.test(g))
    .slice(0, 6);

  // Author / artist from relationships
  const rels = raw.relationships || [];
  const authorRel = rels.find(r => r.type === 'author');
  const artistRel = rels.find(r => r.type === 'artist');
  const author = authorRel?.attributes?.name || '';
  const artist = artistRel?.attributes?.name || author;

  // Cover from relationships
  const coverRel = rels.find(r => r.type === 'cover_art');
  const coverFile = coverRel?.attributes?.fileName;
  const cover_url = getCoverUrl(raw.id, coverFile);

  // Stats / metadata
  const year = attr.year || null;
  const contentRating = attr.contentRating || 'safe';
  const statusRaw = attr.status || 'ongoing';
  const status = statusRaw === 'completed' ? 'completed' : 'ongoing';
  const lang = attr.originalLanguage || 'ja';

  const chapters = Number(attr.lastChapter) || 0;
  const rating = 4.0;

  return {
    id: raw.id,
    title: title.slice(0, 200),
    description,
    genres: genres.length >= 2 ? genres : [...genres, 'Adventure'].slice(0, 2),
    author: author.slice(0, 100),
    artist: artist.slice(0, 100),
    cover_url,
    year,
    content_rating: contentRating,
    status,
    lang,
    chapters,
    rating,
    updated: new Date().toISOString().split('T')[0],
    color: '#0D1A2D',
    search_key: title.slice(0, 200),
  };
}

export async function syncMangaToSupabase(supabaseClient, offset = 0, limit = 20) {
  const batch = await fetchMangaBatch(offset, limit);
  if (!batch.length) return 0;

  const { error } = await supabaseClient
    .from('manga_pool')
    .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

  if (error) throw error;
  return batch.length;
}

export async function fetchAndSeedMangaPool(supabaseClient, totalTarget = 500) {
  let seeded = 0;
  let offset = 0;
  const batchSize = 20;
  const maxOffset = 10000;

  while (seeded < totalTarget && offset < maxOffset) {
    try {
      const count = await syncMangaToSupabase(supabaseClient, offset, batchSize);
      seeded += count;
      offset += batchSize;
      if (count < batchSize) break; // no more results
      await sleep(300); // stay under 5 req/sec
    } catch (err) {
      console.warn(`Seed batch at offset ${offset} failed:`, err.message);
      await sleep(2000);
      offset += batchSize; // skip bad batch
    }
  }

  return seeded;
}
