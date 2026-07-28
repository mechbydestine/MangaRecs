import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, TouchableWithoutFeedback,
  Share, Dimensions, Easing, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useProfile } from '../utils/ProfileContext';
import { fetchMangaInfo } from '../utils/mangaCovers';
import { getMergedDailyLog, localDateKey } from '../utils/readerUtils';
import { BADGE_GRADES, profileToBadgeStats, computeEarnedBadgeIds, highestGradeEarned } from '../utils/badges';
import { StarRatingDisplay } from '../components/StarRating';
import { selection } from '../utils/haptics';
import StarLogo from '../components/StarLogo';

const AUTO_MS = 6000;
const FALLBACK_BG = '#15101B';

// Lightweight direct AniList lookup for MangaRecap's hero backgrounds — a
// bare single-Media search for just 4 fields, not the app's usual 5-source
// cover race (utils/mangaCovers.js), because only AniList exposes bannerImage
// (a wide promo/key-art crop with no logo baked in, unlike a portrait cover)
// and a precomputed dominant color, and a recap needs those specifically for
// a real color-graded hero rather than a plain portrait cover thumbnail.
const ANILIST_ART_QUERY = 'query($search: String) { Media(search: $search, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage } }';
async function fetchAniListArt(title) {
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_ART_QUERY, variables: { search: title } }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.data?.Media || null;
  } catch (_) {
    return null;
  }
}
// Converts a hex color (AniList's own precomputed cover color, or the
// badge-tier fallback) into an rgba() string at the given alpha — used to
// color-grade the hero scrim with the reader's own real per-title accent
// instead of a flat neutral black wash.
function hexToRgba(hex, alpha) {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(num)) return `rgba(6,4,14,${alpha})`;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Period + stat math — ported 1:1 from the website recap (docs/catalog/
// index.html) so the app and mangarecs.net always agree on what "this half"
// means and how streaks/rhythm are computed from the same daily_log shape. ──
function getRecapPeriod(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (m >= 6) return { label: `First Half ${y}`, start: new Date(y, 0, 1), end: new Date(y, 6, 0, 23, 59, 59) };
  return { label: `Second Half ${y - 1}`, start: new Date(y - 1, 6, 1), end: new Date(y, 0, 0, 23, 59, 59) };
}
function keysInRange(dailyLog, start, end) {
  return Object.keys(dailyLog).filter((k) => {
    const d = new Date(`${k}T00:00:00`);
    return d >= start && d <= end;
  });
}
function longestStreakInRange(dailyLog, start, end) {
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let longest = 0, running = 0;
  while (cur <= endDay) {
    const has = (dailyLog[localDateKey(cur)] || 0) > 0;
    running = has ? running + 1 : 0;
    if (running > longest) longest = running;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return longest;
}
function weekdayBreakdown(dailyLog, start, end) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WD_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) {
    totals[cur.getDay()] += dailyLog[localDateKey(cur)] || 0;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  let best = 0;
  for (let i = 1; i < 7; i++) if (totals[i] > totals[best]) best = i;
  return { totals, labels: WD, best: totals[best] > 0 ? best : -1, bestName: totals[best] > 0 ? WD_FULL[best] : null };
}
function pickArchetype(d) {
  const candidates = [];
  if (d.longestStreak >= 14) candidates.push({ w: d.longestStreak, icon: 'flame', title: 'The Disciplined', desc: "A streak that just doesn't quit." });
  if ((d.commentsCount + d.ratingsCount) >= 10) candidates.push({ w: d.commentsCount + d.ratingsCount, icon: 'chatbubbles', title: 'The Community Voice', desc: "You don't just read — you talk about it." });
  if (d.seriesTouched >= 8) candidates.push({ w: d.seriesTouched, icon: 'library', title: 'The Collector', desc: 'Always juggling a few stories at once.' });
  if (d.hoursRead >= 80) candidates.push({ w: d.hoursRead, icon: 'time', title: 'The Devoted', desc: 'Reading is basically a lifestyle at this point.' });
  if (!candidates.length) candidates.push({ w: 1, icon: 'star', title: 'The Steady Reader', desc: 'Slow and steady — every story starts somewhere.' });
  candidates.sort((a, b) => b.w - a.w);
  return candidates[0];
}
function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((res) => setTimeout(() => res(fallback), ms))]);
}

// ── Shared primitives ────────────────────────────────────────────────────

function Reveal({ delay = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Plays once per mount — every slide is remounted fresh on transition (see
// `key={current.key}` in the main render), so this naturally restarts on
// every visit to the slide, matching the website recap's count-up behavior.
function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    const start = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

// A real cover — the actual art of a title the reader actually read (same
// fetchMangaInfo pipeline used on the profile/library/detail screens), never
// a generated illustration. Renders a plain placeholder when no cover
// resolved rather than guessing.
function RealCover({ uri, style }) {
  return (
    <View style={[styles.coverBase, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="disk" />
      ) : (
        <Ionicons name="book-outline" size={20} color="rgba(255,255,255,0.35)" />
      )}
    </View>
  );
}

// Real art gets a slow continuous zoom (Ken Burns) instead of sitting frozen
// behind the text — restarts fresh per hero swap since `uri` changing means
// this whole tree remounts (new Image, new Animated.Value).
function HeroBackground({ uri, tintColor }) {
  const zoom = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.timing(zoom, { toValue: 1.1, duration: 22000, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {uri ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="disk" />
        </Animated.View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: FALLBACK_BG }]} />
      )}
      <LinearGradient
        colors={[hexToRgba(tintColor, 0.5), 'rgba(6,4,14,0.1)', 'rgba(6,4,14,0.34)', 'rgba(6,4,14,0.95)']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function ProgressSegment({ anim }) {
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.segTrack}>
      <Animated.View style={[styles.segFill, { width }]} />
    </View>
  );
}

// ── Slides ───────────────────────────────────────────────────────────────

function IntroSlide({ data }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>{data.period.label}</Text></Reveal>
      <Reveal delay={120}><Text style={styles.megaTitle}>Your MangaRecap</Text></Reveal>
      <Reveal delay={300}><Text style={styles.sub}>Let's see what kind of reader you were these past six months, @{data.username}.</Text></Reveal>
      <Reveal delay={480} style={styles.tapHintRow}>
        <Text style={styles.tapHint}>Tap to begin your journey</Text>
        <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.75)" />
      </Reveal>
    </View>
  );
}

function StatsSlide({ data }) {
  const hours = useCountUp(Math.round(data.hoursRead));
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Time well spent</Text></Reveal>
      <Reveal delay={100}><Text style={styles.bigNumber}>{hours.toLocaleString()}</Text></Reveal>
      <Reveal delay={180}><Text style={styles.label}>Hours read</Text></Reveal>
      <Reveal delay={320} style={styles.chipRow}>
        <View style={styles.chip}><Text style={styles.chipText}>{data.readingDays} days active</Text></View>
        <View style={styles.chip}><Text style={styles.chipText}>{data.seriesTouched} series</Text></View>
      </Reveal>
    </View>
  );
}

function TopSeriesSlide({ data }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Your top series</Text></Reveal>
      <View style={{ marginTop: 14, width: '100%' }}>
        {data.topSeries.map((s, i) => (
          <Reveal key={s.title + i} delay={140 + i * 110} style={styles.topSeriesRow}>
            <Text style={styles.topSeriesRank}>{i + 1}</Text>
            <RealCover uri={s.cover} style={styles.topSeriesCover} />
            <View style={{ flex: 1 }}>
              <Text style={styles.topSeriesTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.topSeriesChapters}>{s.chapters} {s.chapters === 1 ? 'chapter' : 'chapters'}</Text>
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

function RhythmSlide({ data }) {
  const { weekday } = data;
  const maxV = Math.max(...weekday.totals, 0.1);
  const anims = useRef(weekday.totals.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(55, anims.map((a, i) =>
      Animated.timing(a, { toValue: Math.max(0.06, weekday.totals[i] / maxV), duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    )).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Your rhythm</Text></Reveal>
      <Reveal delay={90}><Text style={styles.title}>{weekday.bestName}s</Text></Reveal>
      <View style={styles.barsRow}>
        {weekday.labels.map((label, i) => {
          const height = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });
          const isBest = i === weekday.best;
          return (
            <View key={label + i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { height }, isBest && styles.barFillBest]} />
              </View>
              <Text style={[styles.barLabel, isBest && styles.barLabelBest]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <Reveal delay={260}><Text style={styles.sub}>were your biggest reading days.</Text></Reveal>
    </View>
  );
}

function StreakSlide({ data }) {
  const streak = useCountUp(data.longestStreak);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>On a roll</Text></Reveal>
      <Reveal delay={80}>
        <Ionicons name="flame" size={60} color={data.accentColor} style={{ marginBottom: 8 }} />
      </Reveal>
      <Reveal delay={160}><Text style={styles.bigNumber}>{streak}</Text></Reveal>
      <Reveal delay={240}><Text style={styles.label}>Day streak — your longest this half</Text></Reveal>
    </View>
  );
}

function FavoriteMomentSlide({ data }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Your favorite moment</Text></Reveal>
      <Reveal delay={100}><RealCover uri={data.topRated.cover} style={styles.favCover} /></Reveal>
      <Reveal delay={220}><Text style={styles.title}>{data.topRated.title}</Text></Reveal>
      <Reveal delay={320}><StarRatingDisplay avg={data.topRated.stars} showCount={false} size={24} /></Reveal>
      <Reveal delay={420}><Text style={styles.sub}>Your highest-rated read this half.</Text></Reveal>
    </View>
  );
}

function PersonalitySlide({ data }) {
  const a = data.archetype;
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Your reading personality</Text></Reveal>
      <Reveal delay={100} style={[styles.archetypeBadge, { borderColor: data.accentColor }]}>
        <Ionicons name={a.icon} size={30} color={data.accentColor} />
      </Reveal>
      <Reveal delay={220}><Text style={styles.title}>{a.title}</Text></Reveal>
      <Reveal delay={340}><Text style={styles.sub}>{a.desc}</Text></Reveal>
    </View>
  );
}

function FinaleSlide({ data, onDone }) {
  const stats = [
    { value: Math.round(data.hoursRead), label: 'Hours read' },
    { value: data.readingDays, label: 'Days active' },
    { value: data.longestStreak, label: 'Longest streak' },
    { value: data.seriesTouched, label: 'Series kept up with' },
  ];
  if (data.favoriteGenre) stats.push({ value: data.favoriteGenre, label: 'Favorite genre' });

  function handleShare() {
    const bits = stats.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(' · ');
    Share.share({ message: `My MangaRecap (${data.period.label}) — ${bits}. What's yours?` }).catch(() => {});
  }

  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>{data.period.label}, wrapped</Text></Reveal>
      <View style={styles.finaleStatsGrid}>
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={100 + i * 80} style={styles.finaleStatCell}>
            <Text style={styles.finaleStatValue} numberOfLines={1}>{s.value}</Text>
            <Text style={styles.finaleStatLabel}>{s.label}</Text>
          </Reveal>
        ))}
      </View>
      <Reveal delay={480} style={styles.finaleActions}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-social" size={16} color="#0D0D0F" />
          <Text style={styles.btnPrimaryText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.btnGhostText}>Done</Text>
        </TouchableOpacity>
      </Reveal>
      <Reveal delay={560}><Text style={styles.sub}>See you at the next one.</Text></Reveal>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export default function RecapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile, userId, loading: profileLoading } = useProfile();

  const [status, setStatus] = useState('loading'); // loading | ready | error | signedout
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [screenW, setScreenW] = useState(Dimensions.get('window').width);

  useEffect(() => {
    if (profileLoading) return;
    if (!userId) { setStatus('signedout'); return; }
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const period = getRecapPeriod();
        const startIso = period.start.toISOString();
        const endIso = period.end.toISOString();

        const [progressRes, commentsRes, ratingsCountRes, topRatedRes, dailyLog] = await Promise.all([
          supabase.from('reading_progress').select('series_title,status,current_chapter,updated_at').eq('user_id', userId).gte('updated_at', startIso).lte('updated_at', endIso),
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('series_ratings').select('series_title', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('series_ratings').select('series_title,stars,created_at').eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso).order('stars', { ascending: false }).limit(1),
          getMergedDailyLog(profile?.daily_log),
        ]);
        if (cancelled) return;

        const progressRows = progressRes.data || [];
        const commentsCount = commentsRes.count || 0;
        const ratingsCount = ratingsCountRes.count || 0;
        const topRatedRow = (topRatedRes.data || [])[0] || null;

        const inRangeKeys = keysInRange(dailyLog, period.start, period.end);
        const hoursRead = inRangeKeys.reduce((s, k) => s + (dailyLog[k] || 0), 0);
        const badgeStats = profileToBadgeStats(profile);
        const earnedIds = computeEarnedBadgeIds(badgeStats);
        const topGrade = highestGradeEarned(earnedIds);

        const base = {
          username: profile?.username || 'Reader',
          period,
          hoursRead,
          readingDays: inRangeKeys.length,
          longestStreak: longestStreakInRange(dailyLog, period.start, period.end),
          weekday: weekdayBreakdown(dailyLog, period.start, period.end),
          seriesTouched: progressRows.length,
          commentsCount,
          ratingsCount,
          favoriteGenre: profile?.favorite_genre || null,
          accentColor: topGrade ? BADGE_GRADES[topGrade].color : '#7B5CFF',
          topRated: topRatedRow ? { title: topRatedRow.series_title, stars: topRatedRow.stars, cover: null, hero: null } : null,
        };

        // Real art per title, from two sources in parallel: AniList directly
        // (for bannerImage — a wide promo/key-art crop with no logo baked in
        // — and its precomputed dominant color, neither of which the app's
        // usual cover pipeline exposes) and fetchMangaInfo's 5-source race
        // (utils/mangaCovers.js) as a portrait-cover fallback for titles
        // AniList doesn't resolve. Text-only fallback if neither resolves —
        // never a wrong/guessed cover.
        async function resolveArt(title) {
          const [al, md] = await Promise.all([
            withTimeout(fetchAniListArt(title), 5000, null),
            withTimeout(fetchMangaInfo(title).catch(() => null), 6000, null),
          ]);
          const cover = al?.coverImage?.extraLarge || al?.coverImage?.large || md?.coverUrl || null;
          const hero = al?.bannerImage || cover || null;
          const color = al?.coverImage?.color || null;
          return { cover, hero, color };
        }

        const topSeriesRaw = [...progressRows]
          .sort((a, b) => (b.current_chapter || 0) - (a.current_chapter || 0))
          .slice(0, 3);
        const topSeries = await Promise.all(topSeriesRaw.map(async (row) => {
          const art = await resolveArt(row.series_title);
          return { title: row.series_title, chapters: row.current_chapter || 0, ...art };
        }));
        if (cancelled) return;

        if (base.topRated) {
          const art = await resolveArt(base.topRated.title);
          base.topRated.cover = art.cover;
          base.topRated.hero = art.hero;
        }
        if (cancelled) return;

        base.topSeries = topSeries;
        // Real art of the reader's own most-read series, shown as the
        // full-bleed background behind the story — the favorite-moment slide
        // spotlights its own title's art instead (see slideDefs below).
        base.heroCover = topSeries[0]?.hero || null;
        // The reader's own real per-title color (AniList's precomputed
        // dominant color for their most-read cover) drives the hero scrim
        // tint and a couple of accent touches — falls back to the badge-tier
        // color when no real color resolved, never an arbitrary constant.
        base.vividColor = topSeries[0]?.color || base.accentColor;
        base.archetype = pickArchetype(base);

        setData(base);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [profileLoading, userId]);

  const slideDefs = useMemo(() => {
    if (!data) return [];
    const list = [
      { key: 'intro', bg: data.heroCover, Comp: IntroSlide },
      { key: 'stats', bg: data.heroCover, Comp: StatsSlide },
    ];
    if (data.topSeries.length) list.push({ key: 'topseries', bg: data.heroCover, Comp: TopSeriesSlide });
    if (data.weekday.best >= 0) list.push({ key: 'rhythm', bg: data.heroCover, Comp: RhythmSlide });
    if (data.longestStreak >= 2) list.push({ key: 'streak', bg: data.heroCover, Comp: StreakSlide });
    if (data.topRated) list.push({ key: 'favmoment', bg: data.topRated.hero || data.heroCover, Comp: FavoriteMomentSlide });
    list.push({ key: 'personality', bg: data.heroCover, Comp: PersonalitySlide });
    list.push({ key: 'finale', bg: data.heroCover, Comp: FinaleSlide, isFinale: true });
    return list;
  }, [data]);

  const barsAnim = useMemo(() => slideDefs.map(() => new Animated.Value(0)), [slideDefs.length]);
  const runningAnimRef = useRef(null);
  const progressValueRef = useRef(0);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    const ids = barsAnim.map((v, i) => v.addListener(({ value }) => {
      if (i === idxRef.current) progressValueRef.current = value;
    }));
    return () => barsAnim.forEach((v, i) => v.removeListener(ids[i]));
  }, [barsAnim]);

  useEffect(() => {
    if (slideDefs.length) goToSlide(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideDefs.length]);

  function startBar(i, fromValue) {
    if (runningAnimRef.current) runningAnimRef.current.stop();
    barsAnim[i].setValue(fromValue);
    const duration = Math.max(50, AUTO_MS * (1 - fromValue));
    const anim = Animated.timing(barsAnim[i], { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false });
    runningAnimRef.current = anim;
    anim.start(({ finished }) => { if (finished) advance(1); });
  }

  function goToSlide(newIdx) {
    barsAnim.forEach((v, i) => v.setValue(i < newIdx ? 1 : 0));
    setIdx(newIdx);
    setPaused(false);
    if (slideDefs[newIdx]?.isFinale) return;
    startBar(newIdx, 0);
  }

  function advance(dir) {
    const target = idxRef.current + dir;
    if (target < 0 || target >= slideDefs.length) return;
    selection();
    goToSlide(target);
  }

  function togglePause() {
    if (!slideDefs.length || slideDefs[idxRef.current]?.isFinale) return;
    if (paused) {
      setPaused(false);
      startBar(idxRef.current, progressValueRef.current);
    } else {
      if (runningAnimRef.current) runningAnimRef.current.stop();
      setPaused(true);
    }
  }

  function close() {
    if (runningAnimRef.current) runningAnimRef.current.stop();
    navigation.goBack();
  }

  if (status === 'loading' || profileLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#7B5CFF" />
      </View>
    );
  }
  if (status === 'signedout') {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.sub}>Sign in to see your Recap, synced with the app.</Text>
        <TouchableOpacity style={styles.btnGhost} onPress={() => navigation.goBack()}>
          <Text style={styles.btnGhostText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (status === 'error' || !data || !slideDefs.length) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.sub}>Couldn't load your Recap. Try again in a moment.</Text>
        <TouchableOpacity style={styles.btnGhost} onPress={() => navigation.goBack()}>
          <Text style={styles.btnGhostText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const current = slideDefs[idx];
  const CurrentComp = current.Comp;

  return (
    <View style={styles.root} onLayout={(e) => setScreenW(e.nativeEvent.layout.width)}>
      <HeroBackground uri={current.bg} tintColor={data.vividColor} />

      <TouchableWithoutFeedback onPress={(e) => advance(e.nativeEvent.locationX < screenW * 0.3 ? -1 : 1)}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      <View style={[styles.chrome, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {slideDefs.map((s, i) => <ProgressSegment key={s.key} anim={barsAnim[i]} />)}
        </View>
        <View style={styles.topBarRow}>
          <View style={styles.brandRow}>
            <StarLogo size={16} />
            <Text style={styles.brandText}>MangaRecap</Text>
          </View>
          <View style={styles.topBarBtns}>
            {!current.isFinale && (
              <TouchableOpacity style={styles.iconBtn} onPress={togglePause} hitSlop={10}>
                <Ionicons name={paused ? 'play' : 'pause'} size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={close} hitSlop={10}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View key={current.key} style={[styles.contentWrap, { paddingBottom: insets.bottom + 28 }]} pointerEvents="box-none">
        <CurrentComp data={data} onDone={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, zIndex: 20 },
  progressRow: { flexDirection: 'row', gap: 6 },
  segTrack: { flex: 1, height: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  segFill: { height: '100%', backgroundColor: '#fff' },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },
  topBarBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },

  contentWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 26, zIndex: 10 },
  bottomAnchor: { width: '100%' },

  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  megaTitle: { color: '#fff', fontSize: 34, fontWeight: '900', lineHeight: 40, marginBottom: 10 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  sub: { color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 21, marginTop: 4, textAlign: 'center' },
  bigNumber: { color: '#fff', fontSize: 64, fontWeight: '900', letterSpacing: -1 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },

  tapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  tapHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },

  chipRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  coverBase: { backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },

  topSeriesRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 10, marginBottom: 10 },
  topSeriesRank: { color: '#fff', fontWeight: '900', fontSize: 20, width: 22, textAlign: 'center', opacity: 0.8 },
  topSeriesCover: { width: 52, height: 72, borderRadius: 8 },
  topSeriesTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  topSeriesChapters: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3 },

  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 9, height: 130, marginVertical: 16 },
  barCol: { alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end', width: 26 },
  barTrack: { width: 20, height: '100%', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 6 },
  barFillBest: { backgroundColor: '#fff' },
  barLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  barLabelBest: { color: '#fff', fontWeight: '900' },

  favCover: { width: 132, height: 184, borderRadius: 10, marginBottom: 14 },

  archetypeBadge: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 14 },

  finaleStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, marginBottom: 20 },
  finaleStatCell: { width: '47%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12 },
  finaleStatValue: { color: '#fff', fontWeight: '900', fontSize: 22 },
  finaleStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginTop: 2 },

  finaleActions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  btnPrimaryText: { color: '#0D0D0F', fontWeight: '800', fontSize: 14 },
  btnGhost: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  btnGhostText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
