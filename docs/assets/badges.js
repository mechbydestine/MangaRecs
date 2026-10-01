// GENERATED FROM utils/badges.js — do not hand-edit.
// Regenerate with scratchpad/port-web.mjs whenever the app's badge data or
// engine changes, so mangarecs.net computes exactly the same earned set from
// the same profiles row. Badge rarity is intentionally absent here: it needs a
// Supabase RPC round-trip the static site doesn't make.

import { supabase } from '../supabase';

// Grade keys are historical (grey..mythic) — visible label/colors are the medal
// ladder: Bronze → Silver → Gold → Platinum → Diamond → Master → Mythic.
const BADGE_GRADES = {
  grey:   { label: 'Common',    color: '#D4DCE8', bg: 'rgba(212,220,232,0.14)', border: '#D4DCE8',                glow: null },
  green:  { label: 'Uncommon',  color: '#8CEFB4', bg: 'rgba(140,239,180,0.14)', border: '#8CEFB4',                glow: 'rgba(39,163,94,0.20)' },
  blue:   { label: 'Platinum',  color: '#8FEFF9', bg: 'rgba(143,239,249,0.14)', border: '#8FEFF9',                glow: 'rgba(34,167,189,0.26)' },
  indigo: { label: 'Diamond',   color: '#7FB2FF', bg: 'rgba(127,178,255,0.15)', border: '#7FB2FF',                glow: 'rgba(30,70,180,0.32)' },
  gold:   { label: 'Legendary', color: '#FBE08A', bg: 'rgba(251,224,138,0.15)', border: '#FBE08A',                glow: 'rgba(217,154,20,0.38)' },
  mythic: { label: 'Mythic',    color: '#FF9AAA', bg: 'rgba(255,154,170,0.18)', border: 'rgba(255,154,170,0.65)', glow: 'rgba(210,31,60,0.45)' },
};

const ALL_BADGES = [

  // ══════════════════════════════════════════════════════════════════════
  // READING (15)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'first_chapter', name: "First Chapter", grade: 'grey', desc: "Your very first page turned here", requirement: { type: 'chapters', value: 1 } },
  { id: 'hours_in', name: "Hours In", grade: 'grey', desc: "One full hour lost in story", requirement: { type: 'hours', value: 1 } },
  { id: 'page_turner', name: "Page Turner", grade: 'green', desc: "Twenty-five chapters deep", requirement: { type: 'chapters', value: 25 } },
  { id: 'chapter_hunter', name: "Chapter Hunter", grade: 'green', desc: "One hundred chapters down", requirement: { type: 'chapters', value: 100 } },
  { id: 'time_spent', name: "Time Spent", grade: 'green', desc: "Ten hours given to the panels", requirement: { type: 'hours', value: 10 } },
  { id: 'week_strong', name: "Week Strong", grade: 'green', desc: "Seven days straight, no gaps", requirement: { type: 'streak', value: 7 } },
  { id: 'two_weeks', name: "Two Weeks", grade: 'green', desc: "Fourteen days without missing one", requirement: { type: 'streak', value: 14 } },
  { id: 'deep_reader', name: "Deep Reader", grade: 'blue', desc: "Two hundred fifty chapters in", requirement: { type: 'chapters', value: 250 } },
  { id: 'five_hundred', name: "Five Hundred", grade: 'blue', desc: "Five hundred chapters behind you", requirement: { type: 'chapters', value: 500 } },
  { id: 'night_reader', name: "Night Reader", grade: 'blue', desc: "Ten nights reading past midnight", requirement: { type: 'midnight', value: 10 } },
  { id: 'weekend_reader', name: "Weekend Reader", grade: 'blue', desc: "Ten weekends spent in the panels", requirement: { type: 'weekend', value: 10 } },
  { id: 'the_thousand', name: "The Thousand", grade: 'indigo', desc: "One thousand chapters read", requirement: { type: 'chapters', value: 1000 } },
  { id: 'speed_reader', name: "Speed Reader", grade: 'indigo', desc: "Two hundred fifty hours logged", requirement: { type: 'hours', value: 250 } },
  { id: 'veteran_reader', name: "Veteran Reader", grade: 'gold', desc: "Five thousand chapters, still going", requirement: { type: 'chapters', value: 5000 } },
  { id: 'bookworm', name: "Bookworm", grade: 'mythic', desc: "Fifteen thousand chapters consumed", requirement: { type: 'chapters', value: 15000 }, hidden: true },

  // ══════════════════════════════════════════════════════════════════════
  // DISCOVERY (12)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'new_series', name: "New Series", grade: 'grey', desc: "Your first series journey begins", requirement: { type: 'series', value: 1 } },
  { id: 'genre_hopper', name: "Genre Hopper", grade: 'green', desc: "Reading across three different genres", requirement: { type: 'genres', value: 3 } },
  { id: 'manga_explorer', name: "Manga Explorer", grade: 'green', desc: "Ten manga titles explored", requirement: { type: 'manga_titles', value: 10 } },
  { id: 'manhwa_explorer', name: "Manhwa Explorer", grade: 'green', desc: "Ten manhwa titles explored", requirement: { type: 'manhwa_titles', value: 10 } },
  { id: 'library_explorer', name: "Library Explorer", grade: 'green', desc: "Twenty-five different worlds visited", requirement: { type: 'manga', value: 25 } },
  { id: 'completed_hunter', name: "Completed Hunter", grade: 'blue', desc: "Thirty stories seen through", requirement: { type: 'completed', value: 30 } },
  { id: 'author_explorer', name: "Author Explorer", grade: 'blue', desc: "Fifty titles across many hands", requirement: { type: 'manga', value: 50 } },
  { id: 'hidden_gem_hunter', name: "Hidden Gem Hunter", grade: 'indigo', desc: "One hundred titles unearthed", requirement: { type: 'manga', value: 100 } },
  { id: 'trending_explorer', name: "Trending Explorer", grade: 'indigo', desc: "Eight genres followed at once", requirement: { type: 'genres', value: 8 } },
  { id: 'deep_dive', name: "Deep Dive", grade: 'gold', desc: "One thousand hours below the surface", requirement: { type: 'hours', value: 1000 } },
  { id: 'world_builder', name: "World Builder", grade: 'gold', desc: "Four hundred worlds collected", requirement: { type: 'manga', value: 400 } },
  { id: 'multiverse_seeker', name: "Multiverse Seeker", grade: 'mythic', desc: "One thousand worlds, one reader", requirement: { type: 'manga', value: 1000 }, hidden: true },

  // ══════════════════════════════════════════════════════════════════════
  // COLLECTION (8)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'first_save', name: "First Save", grade: 'grey', desc: "Your first title saved", requirement: { type: 'manga', value: 1 } },
  { id: 'save_10', name: "Save 10", grade: 'green', desc: "Ten titles on the shelf", requirement: { type: 'manga', value: 10 } },
  { id: 'save_50', name: "Save 50", grade: 'green', desc: "Fifty titles on the shelf", requirement: { type: 'manga', value: 50 } },
  { id: 'series_collector', name: "Series Collector", grade: 'green', desc: "Ten series followed at once", requirement: { type: 'series', value: 10 } },
  { id: 'save_100', name: "Save 100", grade: 'blue', desc: "One hundred titles shelved", requirement: { type: 'manga', value: 100 } },
  { id: 'genre_collector', name: "Genre Collector", grade: 'blue', desc: "Five genres in the collection", requirement: { type: 'genres', value: 5 } },
  { id: 'massive_library', name: "Massive Library", grade: 'indigo', desc: "Two hundred titles gathered", requirement: { type: 'manga', value: 200 } },
  { id: 'curator', name: "Curator", grade: 'gold', desc: "Two hundred fifty verdicts delivered", requirement: { type: 'ratings', value: 250 } },

  // ══════════════════════════════════════════════════════════════════════
  // COMMUNITY (12)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'first_friend', name: "First Friend", grade: 'grey', desc: "Your first reading companion", requirement: { type: 'friends', value: 1 } },
  { id: 'active_reader', name: "Active Reader", grade: 'grey', desc: "First words shared with everyone", requirement: { type: 'comments', value: 1 } },
  { id: 'friend_circle', name: "Friend Circle", grade: 'green', desc: "Five readers riding with you", requirement: { type: 'friends', value: 5 } },
  { id: 'community_contributor', name: "Community Contributor", grade: 'green', desc: "Ten comments in the threads", requirement: { type: 'comments', value: 10 } },
  { id: 'helper', name: "Helper", grade: 'green', desc: "Twenty-five replies given freely", requirement: { type: 'comments', value: 25 } },
  { id: 'guild_member', name: "Guild Member", grade: 'blue', desc: "Fifteen readers in your corner", requirement: { type: 'friends', value: 15 } },
  { id: 'popular_user', name: "Popular User", grade: 'blue', desc: "Twenty-five readers in your circle", requirement: { type: 'friends', value: 25 } },
  { id: 'mentor', name: "Mentor", grade: 'blue', desc: "Fifty comments guiding others", requirement: { type: 'comments', value: 50 } },
  { id: 'discussion_starter', name: "Discussion Starter", grade: 'indigo', desc: "Fifty discussions you began", requirement: { type: 'discussions', value: 50 } },
  { id: 'social_butterfly', name: "Social Butterfly", grade: 'indigo', desc: "Fifty readers riding with you", requirement: { type: 'friends', value: 50 } },
  { id: 'trusted_member', name: "Trusted Member", grade: 'indigo', desc: "A full year with MangaRecs", requirement: { type: 'account', value: 365 } },
  { id: 'community_leader', name: "Community Leader", grade: 'gold', desc: "Four hundred comments, a real voice", requirement: { type: 'comments', value: 400 } },

  // ══════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS & SOCIAL (8)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'first_recommendation', name: "First Recommendation", grade: 'grey', desc: "Your first recommendation sent", requirement: { type: 'shares', value: 1 } },
  { id: 'recommender', name: "Recommender", grade: 'green', desc: "Five stories passed along", requirement: { type: 'shares', value: 5 } },
  { id: 'recs_10', name: "10 Recs", grade: 'green', desc: "Ten recommendations shared", requirement: { type: 'shares', value: 10 } },
  { id: 'social_reader', name: "Social Reader", grade: 'green', desc: "Fifty hearts given out", requirement: { type: 'likes', value: 50 } },
  { id: 'recs_50', name: "50 Recs", grade: 'blue', desc: "Fifty recommendations sent", requirement: { type: 'shares', value: 50 } },
  { id: 'friend_reaction', name: "Friend Reaction", grade: 'blue', desc: "Twenty-five reactions given", requirement: { type: 'reactions', value: 25 } },
  { id: 'recs_100', name: "100 Recs", grade: 'indigo', desc: "One hundred recommendations shared", requirement: { type: 'shares', value: 100 } },
  { id: 'shared_discovery', name: "Shared Discovery", grade: 'gold', desc: "One thousand hearts spread around", requirement: { type: 'likes', value: 1000 } },

  // ══════════════════════════════════════════════════════════════════════
  // MASTERY / LONG-TERM (7)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'daily_reader', name: "Daily Reader", grade: 'green', desc: "Three days in a row", requirement: { type: 'streak', value: 3 } },
  { id: 'monthly_reader', name: "Monthly Reader", grade: 'blue', desc: "Thirty days unbroken", requirement: { type: 'streak', value: 30 } },
  { id: 'milestone_tracker', name: "Milestone Tracker", grade: 'indigo', desc: "Twenty-five badges collected", requirement: { type: 'badges', value: 25 } },
  { id: 'the_scholar', name: "The Scholar", grade: 'indigo', desc: "Five hundred hours of study", requirement: { type: 'hours', value: 500 } },
  { id: 'yearly_reader', name: "Yearly Reader", grade: 'gold', desc: "One hundred eighty days straight", requirement: { type: 'streak', value: 180 } },
  { id: 'the_critic', name: "The Critic", grade: 'gold', desc: "Two hundred fifty series judged", requirement: { type: 'ratings', value: 250 } },
  { id: 'the_legend', name: "The Legend", grade: 'mythic', desc: "Sixty badges earned", requirement: { type: 'badges', value: 60 }, hidden: true },

  // ══════════════════════════════════════════════════════════════════════
  // SECRET / SPECIAL (8)
  // ══════════════════════════════════════════════════════════════════════

  { id: 'seasonal_event', name: "Seasonal Event", grade: 'blue', desc: "Thirteen nights past midnight", requirement: { type: 'midnight', value: 13 }, hidden: true },
  { id: 'early_adopter', name: "Early Adopter", grade: 'indigo', desc: "Here before most of them", requirement: { type: 'account', value: 900 }, hidden: true },
  { id: 'beta_tester', name: "Beta Tester", grade: 'gold', desc: "Two years with MangaRecs", requirement: { type: 'account', value: 730 }, hidden: true },
  { id: 'collab_event', name: "Collab Event", grade: 'gold', desc: "Five hundred stories passed along", requirement: { type: 'shares', value: 500 }, hidden: true },
  { id: 'the_oracle', name: "The Oracle", grade: 'mythic', desc: "Fifteen hundred series judged", requirement: { type: 'ratings', value: 1500 }, hidden: true },
  { id: 'the_pillar', name: "The Pillar", grade: 'mythic', desc: "Two thousand comments written", requirement: { type: 'comments', value: 2000 }, hidden: true },
  { id: 'limited_edition', name: "Limited Edition", grade: 'mythic', desc: "Three thousand hours given", requirement: { type: 'hours', value: 3000 }, hidden: true },
  { id: 'the_secret', name: "The Secret", grade: 'mythic', desc: "Three hundred stories finished", requirement: { type: 'completed', value: 300 }, hidden: true },
];

// ══════════════════════════════════════════════════════════════════════
// Dynamic badge engine
// ══════════════════════════════════════════════════════════════════════

function profileToBadgeStats(profile) {
  if (!profile) return {};
  const cr = profile.chapters_read || 0;
  return {
    chapters_read:  cr,
    hours_read:     profile.hours_read      || 0,
    streak_count:   profile.streak_count    || 0,
    series_count:   profile.series_count    || 0,
    friends_count:  profile.friends_count   || 0,
    comments_count: profile.comments_count  || 0,
    likes_given:    profile.likes_given     || 0,
    completed_count:profile.completed_count || 0,
    night_reads:    profile.night_reads     || 0,
    genres_count:   profile.genres_count    || (cr > 0 ? 1 : 0),
    shares_count:   profile.shares_count    || 0,
    manga_count:    profile.manga_count     || Math.floor(cr / 12),
    ratings_count:  profile.ratings_count   || 0,
    account_days:   profile.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
      : (profile.account_days || 0),
    // Columns added for the 70-badge set. All default to 0 rather than being
    // derived from anything else: a badge nobody can earn yet is better than
    // one that unlocks off a guess. See BADGE_ART_SPEC.md for where each comes
    // from once the migration lands.
    weekend_reads:       profile.weekend_reads       || 0,
    manga_titles:        profile.manga_titles        || 0,
    manhwa_titles:       profile.manhwa_titles       || 0,
    discussions_started: profile.discussions_started || 0,
    reactions_given:     profile.reactions_given     || 0,
    has_avatar:  !!profile.avatar_url,
    has_friend:  (profile.friends_count  || 0) >= 1,
    has_comment: (profile.comments_count || 0) >= 1,
    has_like:    (profile.likes_given    || 0) >= 1,
  };
}

// Every requirement type maps to exactly one stat key. Anything not in here is
// unearnable by construction — which is how 29 badges in the old 250 silently
// never unlocked, so new types go here first and get a badge second.
const STAT_KEY_BY_TYPE = {
  chapters: 'chapters_read', hours: 'hours_read', streak: 'streak_count',
  series: 'series_count', friends: 'friends_count', comments: 'comments_count',
  likes: 'likes_given', completed: 'completed_count', midnight: 'night_reads',
  genres: 'genres_count', shares: 'shares_count', manga: 'manga_count',
  ratings: 'ratings_count', account: 'account_days', weekend: 'weekend_reads',
  manga_titles: 'manga_titles', manhwa_titles: 'manhwa_titles',
  discussions: 'discussions_started', reactions: 'reactions_given',
};

function computeEarnedBadgeIds(rawStats = {}) {
  const earned = new Set();

  // The has_* flags exist because the counters lag behind the action that
  // caused them — you can have commented without comments_count having caught
  // up yet. Fold them in as a floor of 1 so the first-step badges fire on the
  // action rather than on the sync.
  const stats = { ...rawStats };
  if (stats.has_comment) stats.comments_count = Math.max(stats.comments_count || 0, 1);
  if (stats.has_like)    stats.likes_given    = Math.max(stats.likes_given    || 0, 1);
  if (stats.has_friend)  stats.friends_count  = Math.max(stats.friends_count  || 0, 1);

  // Pass one: everything measured directly off a stat.
  for (const badge of ALL_BADGES) {
    const { type, value } = badge.requirement || {};
    if (type === 'badges') continue;              // needs the count from this pass
    if (badge.season && !seasonActive(badge)) continue;
    if (type === 'profile') {
      if (stats.has_avatar) earned.add(badge.id);
      continue;
    }
    const key = STAT_KEY_BY_TYPE[type];
    if (key && (stats[key] || 0) >= value) earned.add(badge.id);
  }

  // Pass two: badges that count other badges. Deliberately measured against the
  // first pass only, so they can never count each other and cascade.
  const collected = earned.size;
  for (const badge of ALL_BADGES) {
    if (badge.requirement?.type !== 'badges') continue;
    if (badge.season && !seasonActive(badge)) continue;
    if (collected >= badge.requirement.value) earned.add(badge.id);
  }

  return earned;
}

// ── Badge progress & discovery helpers ──────────────────────────────────────

const GRADE_ORDER = ['grey', 'green', 'blue', 'indigo', 'gold', 'mythic'];

// Grades that show locked entries with a progress bar (Common/Uncommon/
// Platinum); Diamond and above stay a mystery silhouette until earned.
const PROGRESS_GRADES = new Set(['grey', 'green', 'blue']);

// Progress toward a badge: { current, target, pct } — null when unmeasurable.
// `badges` is measured against the caller's own earned count, since it counts
// other badges rather than a profile column.
function badgeProgress(badge, stats = {}, earnedCount = null) {
  const { type, value } = badge.requirement || {};
  if (!value) return null;
  const current = type === 'badges'
    ? Math.max(0, earnedCount ?? stats.badges_earned ?? 0)
    : Math.max(0, stats[STAT_KEY_BY_TYPE[type]] || 0);
  if (type !== 'badges' && !STAT_KEY_BY_TYPE[type]) return null;
  return { current: Math.min(current, value), target: value, pct: Math.max(0, Math.min(1, current / value)) };
}

// Seasonal badge window check — non-seasonal badges are always active
function seasonActive(badge, now = new Date()) {
  if (!badge.season) return true;
  const t = now.getTime();
  return t >= new Date(badge.season.start).getTime() && t < new Date(badge.season.end).getTime();
}

// The N unearned, visible badges closest to unlocking
function nextUpBadges(stats = {}, earnedIds = new Set(), count = 3) {
  const candidates = [];
  for (const b of ALL_BADGES) {
    if (earnedIds.has(b.id) || b.hidden) continue;
    if (b.season && !seasonActive(b)) continue;
    const prog = badgeProgress(b, stats);
    if (!prog || prog.pct >= 1) continue;
    candidates.push({ badge: b, ...prog });
  }
  candidates.sort((a, b) => b.pct - a.pct || a.target - b.target);
  return candidates.slice(0, count);
}

// The next rung in a badge's own line. There is no multi-tier "challenge"
// object in this model — a line is just the badges that share a requirement
// type, each a separate id pinned to one grade — so "what's next" is derived
// here rather than stored, and the detail view can show a progression without
// restructuring ids that earned-state, pins and rarity all key off.
function nextInLine(badge) {
  const { type, value } = badge?.requirement || {};
  if (!type || !value) return null;
  let best = null;
  for (const b of ALL_BADGES) {
    if (b.id === badge.id || b.requirement?.type !== type) continue;
    if (b.hidden || (b.season && !seasonActive(b))) continue;
    const v = b.requirement.value;
    if (typeof v !== 'number' || v <= value) continue;
    if (!best || v < best.requirement.value) best = b;
  }
  return best;
}

// Highest medal grade among earned badges — null when none earned
function highestGradeEarned(earnedIds = new Set()) {
  let best = -1;
  for (const b of ALL_BADGES) {
    if (!earnedIds.has(b.id)) continue;
    const rank = GRADE_ORDER.indexOf(b.grade);
    if (rank > best) best = rank;
  }
  return best >= 0 ? GRADE_ORDER[best] : null;
}

// True when grade meets or exceeds the required grade (for tier-gated rewards)
function gradeAtLeast(grade, required) {
  return GRADE_ORDER.indexOf(grade) >= GRADE_ORDER.indexOf(required);
}
