const BASE = 'https://api.comick.io';
const TIMEOUT = 7000;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
}

function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Returns { hid, slug, title } or null
export async function searchComicK(query) {
  try {
    const resp = await withTimeout(
      fetch(`${BASE}/v1.0/search?q=${encodeURIComponent(query)}&tachiyomi=true&limit=10`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Tachiyomi' },
      }),
      TIMEOUT
    );
    if (!resp?.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return null;
    const q = normTitle(query);
    const best =
      data.find((m) => normTitle(m.title || '') === q) ||
      data.find((m) => normTitle(m.title || '').startsWith(q.split(' ')[0])) ||
      data[0];
    return best ? { hid: best.hid, slug: best.slug, title: best.title } : null;
  } catch (_) {
    return null;
  }
}

// Returns array of { id, chapter, title, pages, source: 'comick' }
// sorted ascending, deduped by chapter number, full pagination.
export async function getComicKChapters(hid) {
  try {
    const all = [];
    let page = 1;
    while (true) {
      const resp = await withTimeout(
        fetch(`${BASE}/comic/${hid}/chapters?lang=en&tachiyomi=true&page=${page}&limit=300`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Tachiyomi' },
        }),
        TIMEOUT
      );
      if (!resp?.ok) break;
      const json = await resp.json();
      const batch = json?.chapters || [];
      all.push(...batch);
      if (batch.length < 300 || all.length >= 1500) break;
      page++;
    }
    const seen = new Set();
    return all
      .filter((c) => (c.page_count || 0) > 0)
      .map((c) => ({
        id: c.hid,
        chapter: parseFloat(c.chap) || 0,
        title: c.title || '',
        volume: c.vol || null,
        pages: c.page_count || 0,
        source: 'comick',
      }))
      .sort((a, b) => a.chapter - b.chapter)
      .filter((c) => {
        const key = String(c.chapter);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch (_) {
    return [];
  }
}

// Returns array of image URLs for a ComicK chapter
export async function getComicKChapterPages(hid) {
  try {
    const resp = await withTimeout(
      fetch(`${BASE}/chapter/${hid}?tachiyomi=true`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Tachiyomi' },
      }),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const json = await resp.json();
    const images = json?.chapter?.images || [];
    return images.map((img) => img.url).filter(Boolean);
  } catch (_) {
    return [];
  }
}
