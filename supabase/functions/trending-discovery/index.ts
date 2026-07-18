// Trending-title discovery pipeline. Meant to run on a pg_cron schedule
// (e.g. daily) — pulls MangaDex's real most-followed feed, cross-checks each
// candidate against AniList for a real rating/synopsis/cover, dedupes against
// the live manga_pool table, and writes survivors into the manga_pool_candidates
// staging table (migration §54) for manual admin review/approval — never
// directly into manga_pool. See §54's comment for why: a past scraper
// (lib/mangadex.js, deleted) once bulk-inserted 9,069 junk rows (fake 4.0
// ratings, 0% covers, mangled non-JP titles) straight into the live catalog.
import { createClient } from "npm:@supabase/supabase-js@2";

const COUNTRY_MAP: Record<string, string> = { ja: "JP", ko: "KR", zh: "CN" };
const GENRE_MAP: Record<string, string> = {
  Action: "Action", Adventure: "Adventure", Comedy: "Comedy", Drama: "Drama",
  Fantasy: "Fantasy", Horror: "Horror", Mystery: "Mystery", Romance: "Romance",
  "Sci-Fi": "Sci-Fi", "Slice of Life": "Slice of Life", Sports: "Sports",
  Supernatural: "Supernatural", Psychological: "Psychological", Thriller: "Thriller",
  Mecha: "Sci-Fi", Isekai: "Isekai",
};
const DARK_COLORS = ["#0D1A2D", "#1A0D0A", "#0A1A2D", "#2D1A0A", "#0D0A2D", "#1A2D0D", "#2D0A0A", "#0A0D1A"];
const MAX_CANDIDATES_PER_RUN = 20;
const MANGADEX_PAGE_SIZE = 50;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function norm(s: string) { return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(); }
function stableColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return DARK_COLORS[Math.abs(h) % DARK_COLORS.length];
}
function cleanDescription(html: string | null | undefined) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<i>|<\/i>|<b>|<\/b>/gi, "")
    .replace(/\(Source[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

// AniList's public GraphQL limiter is much tighter than documented — respects
// Retry-After on a 429 instead of hammering it, same lesson learned building
// scripts/reconcileWithAniList.mjs.
async function fetchWithBackoff(url: string, opts: RequestInit, attempt = 0): Promise<Response> {
  const resp = await fetch(url, opts);
  if (resp.status === 429 && attempt < 3) {
    const retryAfter = parseInt(resp.headers.get("retry-after") || "", 10);
    const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 8 * (attempt + 1)) * 1000;
    await sleep(waitMs);
    return fetchWithBackoff(url, opts, attempt + 1);
  }
  return resp;
}

async function queryAniList(title: string, lang: string) {
  const query = `
    query ($search: String, $country: CountryCode) {
      Media(search: $search, type: MANGA, countryOfOrigin: $country, isAdult: false) {
        id
        title { romaji english native }
        description(asHtml: false)
        genres
        meanScore
        coverImage { extraLarge }
      }
    }`;
  const variables: Record<string, unknown> = { search: title };
  if (COUNTRY_MAP[lang]) variables.country = COUNTRY_MAP[lang];
  try {
    const resp = await fetchWithBackoff("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.data?.Media || null;
  } catch (_) {
    return null;
  }
}

// A title-based AniList search is not sufficient confidence on its own —
// reconcileWithAniList.mjs found two confirmed-wrong matches this exact way
// (generic-sounding titles matching an unrelated famous series). Require the
// AniList result's own title to substantially overlap with what we searched
// for before trusting it, rather than accepting whatever AniList's fuzzy
// search returns first.
function titlesLikelyMatch(searched: string, media: any): boolean {
  const candidates = [media?.title?.romaji, media?.title?.english, media?.title?.native].filter(Boolean).map(norm);
  const s = norm(searched);
  if (!s || candidates.length === 0) return false;
  return candidates.some((c) => c === s || c.includes(s) || s.includes(c));
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // MangaDex's real most-followed feed — same sort chapter-push and
  // scripts/seedRealMangaPool.mjs already use for "what's actually popular."
  const mdRes = await fetch(
    `https://api.mangadex.org/manga?order[followedCount]=desc&limit=${MANGADEX_PAGE_SIZE}` +
      `&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`,
    { headers: { Accept: "application/json" } },
  );
  if (!mdRes.ok) {
    return new Response(JSON.stringify({ error: "MangaDex fetch failed" }), { status: 502 });
  }
  const mdJson = await mdRes.json();
  const mangaList: any[] = mdJson?.data || [];

  // Dedupe against manga_pool by normalized title (the curated JS pool is kept
  // synced into this same table, so this also covers the hand-authored list —
  // see scripts/genFullSyncSql.mjs) and against manga_pool_candidates so an
  // already-reviewed (approved or rejected) title never gets re-suggested.
  const { data: existingPool } = await supabase.from("manga_pool").select("title");
  const { data: existingCandidates } = await supabase.from("manga_pool_candidates").select("id, title");
  const existingTitles = new Set([
    ...(existingPool || []).map((r: any) => norm(r.title)),
    ...(existingCandidates || []).map((r: any) => norm(r.title)),
  ]);
  const existingIds = new Set((existingCandidates || []).map((r: any) => r.id));

  let inserted = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const manga of mangaList) {
    if (inserted >= MAX_CANDIDATES_PER_RUN) break;

    const id = manga.id;
    if (existingIds.has(id)) continue;
    const attrs = manga.attributes || {};
    const titleObj = attrs.title || {};
    const rawTitle = titleObj.en || Object.values(titleObj)[0] as string || "";
    if (!rawTitle || existingTitles.has(norm(rawTitle))) continue;

    const origLang = (attrs.originalLanguage || "ja").slice(0, 2);
    const lang = ["ja", "ko", "zh"].includes(origLang) ? origLang : "ja";

    const media = await queryAniList(rawTitle, lang);
    await sleep(1600); // same delay reconcileWithAniList.mjs settled on after 429s

    if (!media || !titlesLikelyMatch(rawTitle, media) || !media.description) continue;

    const finalTitle = media.title?.english || media.title?.romaji || rawTitle;
    if (existingTitles.has(norm(finalTitle))) continue;

    const genres = (media.genres || [])
      .map((g: string) => GENRE_MAP[g])
      .filter(Boolean)
      .filter((g: string, i: number, arr: string[]) => arr.indexOf(g) === i)
      .slice(0, 3);

    toInsert.push({
      id,
      title: finalTitle,
      lang,
      description: cleanDescription(media.description),
      genres,
      rating: media.meanScore ? Math.round(media.meanScore) / 10 : null,
      chapters: parseInt(attrs.lastChapter, 10) || 0,
      cover_url: media.coverImage?.extraLarge || null,
      color: stableColor(id),
      source_note: `MangaDex trending, matched AniList #${media.id}`,
    });
    existingTitles.add(norm(finalTitle));
    inserted++;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("manga_pool_candidates").upsert(toInsert, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({ checked: mangaList.length, candidatesAdded: toInsert.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
