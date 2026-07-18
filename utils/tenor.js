// Tenor GIF search for DM GIF messages. Register a free key at
// https://developers.google.com/tenor/guides/quickstart (Google Cloud
// Console → enable the "Tenor API" → create an API key) and paste it below —
// until then, search calls fail gracefully (empty results) rather than
// throwing, so the rest of the picker still works.
const TENOR_API_KEY = 'REPLACE_WITH_REAL_TENOR_API_KEY';
const CLIENT_KEY = 'mangarecs';

export async function searchGifs(query, limit = 24) {
  if (!TENOR_API_KEY || TENOR_API_KEY === 'REPLACE_WITH_REAL_TENOR_API_KEY') return [];
  try {
    const endpoint = query?.trim()
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query.trim())}&key=${TENOR_API_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif`
      : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map((r) => ({
      id: r.id,
      url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
      previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
      width: r.media_formats?.tinygif?.dims?.[0] || 200,
      height: r.media_formats?.tinygif?.dims?.[1] || 200,
    })).filter((g) => g.url);
  } catch (_) {
    return [];
  }
}
