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
import { BADGE_GRADES, ALL_BADGES, profileToBadgeStats, computeEarnedBadgeIds, highestGradeEarned } from '../utils/badges';
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
const ANILIST_ART_QUERY = 'query($search: String) { Media(search: $search, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage genres } }';
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
// Real-art fallback for the (surprisingly common while testing, and not
// impossible for a genuinely new account) case where a reader has zero
// reading_progress rows inside the current recap window — no personal
// title to fetch art *for*, so there's nothing for fetchAniListArt above to
// resolve. Grabs a real trending manga's banner instead of leaving the
// story with no photo at all — still real art off the internet, just not
// personalized to this specific reader the way the top-series art is.
const TRENDING_ART_QUERY = 'query { Page(page: 1, perPage: 8) { media(sort: TRENDING_DESC, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage } } }';
async function fetchTrendingArt() {
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: TRENDING_ART_QUERY }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const list = json?.data?.Page?.media || [];
    const withBanner = list.find((m) => m.bannerImage);
    return withBanner || list[0] || null;
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
// Weights each resolved title's real AniList genre tags by its own chapters
// read, split evenly across a title's own multiple genres so one heavily-
// tagged series doesn't inflate the total beyond real reading time — same
// weighting the website recap uses. Top 4 genres + "Other" bucket.
function genreBreakdown(topSeries) {
  const weights = {};
  let total = 0;
  topSeries.forEach((s) => {
    const genres = (s.genres && s.genres.length) ? s.genres : [];
    if (!genres.length) return;
    const share = (s.chapters || 1) / genres.length;
    genres.forEach((g) => { weights[g] = (weights[g] || 0) + share; total += share; });
  });
  if (!total) return [];
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const restWeight = sorted.slice(4).reduce((s, [, w]) => s + w, 0);
  const rows = top.map(([label, w]) => ({ label, pct: Math.round((w / total) * 100) }));
  if (restWeight > 0) rows.push({ label: 'Other', pct: Math.round((restWeight / total) * 100) });
  return rows.filter((r) => r.pct > 0);
}

// ── Shared primitives ────────────────────────────────────────────────────

// Spring-based scale+slide instead of a plain fade — a "movie title sequence"
// pop rather than a gentle fade-in, matching Wrapped's energetic reveal style.
function Reveal({ delay = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180, mass: 0.9 }).start();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  return (
    <Animated.View style={[{ opacity: anim, transform: [{ translateY }, { scale }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Plays once per mount — every slide is remounted fresh on transition (see
// `key={current.key}` in the main render), so this naturally restarts on
// every visit to the slide, matching the website recap's count-up behavior.
// Also returns `punch`, a scale value that pops on landing instead of the
// count-up quietly stopping — a real "hero moment" for the big number.
function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0);
  const punch = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let raf;
    const start = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        Animated.sequence([
          Animated.timing(punch, { toValue: 1.16, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(punch, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 180 }),
        ]).start();
      }
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { value, punch };
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

// A soft pulsing glow, always present underneath everything else — the last
// line of defense against a flat, dead-looking background on total network
// failure (no personal art, and even the trending-art fallback didn't
// resolve). Tinted with the reader's own real color when one's available.
function AmbientGlow({ color }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.55] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={{
          position: 'absolute', top: '14%', left: '50%', width: 460, height: 460, marginLeft: -230,
          borderRadius: 230, backgroundColor: color || '#7B5CFF', opacity, transform: [{ scale }],
        }}
      />
    </View>
  );
}

// The story's real art, alive instead of frozen: cycles through every one of
// the reader's own resolved covers/banners (crossfading via expo-image's own
// transition when the source changes), a continuous back-and-forth Ken Burns
// zoom running independently of which image is showing, and a slow
// "breathing" pulse on the color scrim so there's always motion and color
// shifting even behind a single image or no image at all.
function HeroBackground({ images, tintColor }) {
  const pool = images && images.length ? images : [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (pool.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % pool.length), 4800);
    return () => clearInterval(id);
  }, [pool.length]);
  const uri = pool[i] || null;

  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [zoom]);
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });

  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [breathe]);
  const tintOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: FALLBACK_BG, overflow: 'hidden' }]} pointerEvents="none">
      <AmbientGlow color={tintColor} />
      {uri && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={700} cachePolicy="disk" />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tintOpacity }]}>
        <LinearGradient
          colors={[hexToRgba(tintColor, 0.55), 'rgba(6,4,14,0.1)', 'rgba(6,4,14,0.34)', 'rgba(6,4,14,0.95)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
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
  const { value: hours, punch } = useCountUp(Math.round(data.hoursRead));
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Time well spent</Text></Reveal>
      <Reveal delay={100}>
        <Animated.Text style={[styles.bigNumber, { transform: [{ scale: punch }] }]}>{hours.toLocaleString()}</Animated.Text>
      </Reveal>
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

const GENRE_COLORS = ['#E8544A', '#F0BE66', '#7BA6F5', '#B18CFF', 'rgba(255,255,255,0.4)'];

function GenresSlide({ data }) {
  const rows = data.genreBreakdown;
  const anims = useRef(rows.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(90, anims.map((a, i) =>
      Animated.timing(a, { toValue: rows[i].pct / 100, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    )).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Genres you explored</Text></Reveal>
      <View style={{ marginTop: 14, width: '100%' }}>
        {rows.map((r, i) => {
          const width = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
          const color = GENRE_COLORS[i % GENRE_COLORS.length];
          return (
            <Reveal key={r.label} delay={100 + i * 70} style={styles.genreRow}>
              <View style={styles.genreLabelRow}>
                <View style={[styles.genreDot, { backgroundColor: color }]} />
                <Text style={styles.genreLabel}>{r.label}</Text>
                <Text style={styles.genrePct}>{r.pct}%</Text>
              </View>
              <View style={styles.genreTrack}>
                <Animated.View style={[styles.genreFill, { width, backgroundColor: color }]} />
              </View>
            </Reveal>
          );
        })}
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
  const { value: streak, punch } = useCountUp(data.longestStreak);
  const flicker = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [flicker]);
  const flickerScale = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>On a roll</Text></Reveal>
      <Reveal delay={80}>
        <Animated.View style={{ transform: [{ scale: flickerScale }], marginBottom: 8 }}>
          <Ionicons name="flame" size={60} color={data.accentColor} />
        </Animated.View>
      </Reveal>
      <Reveal delay={160}>
        <Animated.Text style={[styles.bigNumber, { transform: [{ scale: punch }] }]}>{streak}</Animated.Text>
      </Reveal>
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

function AchievementsSlide({ data }) {
  const { value: count, punch } = useCountUp(data.earnedBadgeCount);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={styles.eyebrow}>Real badges, really earned</Text></Reveal>
      <Reveal delay={100}>
        <Animated.Text style={[styles.bigNumber, { transform: [{ scale: punch }] }]}>{count}</Animated.Text>
      </Reveal>
      <Reveal delay={180}><Text style={styles.label}>of {data.totalBadgeCount} badges unlocked</Text></Reveal>
      {data.tierLabel && (
        <Reveal delay={320} style={[styles.tierPill, { borderColor: data.accentColor }]}>
          <Text style={[styles.tierPillText, { color: data.accentColor }]}>{data.tierLabel} Tier</Text>
        </Reveal>
      )}
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
          const genres = al?.genres || [];
          return { cover, hero, color, genres };
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
        base.genreBreakdown = genreBreakdown(topSeries);

        // Real art pool for the background — every one of the reader's own
        // resolved covers/banners, deduped, cycling behind the whole story
        // (not just the top-series slide) so the recap actually shows what
        // they read on every screen, not one borrowed hero image. Falls
        // back to a real trending manga's art only when the reader has
        // nothing personal to show at all (e.g. zero series this half).
        const pool = [];
        [...topSeries, base.topRated].forEach((s) => {
          if (s?.hero && !pool.includes(s.hero)) pool.push(s.hero);
        });
        let vividColor = topSeries[0]?.color || null;
        if (!pool.length) {
          const trending = await withTimeout(fetchTrendingArt(), 5000, null);
          const art = trending?.bannerImage || trending?.coverImage?.extraLarge || trending?.coverImage?.large || null;
          if (art) pool.push(art);
          vividColor = vividColor || trending?.coverImage?.color || null;
        }
        if (cancelled) return;
        base.heroImages = pool;
        // The reader's own real per-title color (AniList's precomputed
        // dominant color for their most-read cover, or the trending
        // fallback's) drives the hero scrim tint — falls back to the
        // badge-tier color only if nothing real ever resolved.
        base.vividColor = vividColor || base.accentColor;

        // Real achievement snapshot — how many of the app's own real badges
        // are earned right now, and the highest medal tier among them.
        base.earnedBadgeCount = earnedIds.size;
        base.totalBadgeCount = ALL_BADGES.length;
        base.tierLabel = topGrade ? BADGE_GRADES[topGrade].label : null;

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
      { key: 'intro', Comp: IntroSlide },
      { key: 'stats', Comp: StatsSlide },
    ];
    if (data.topSeries.length) list.push({ key: 'topseries', Comp: TopSeriesSlide });
    if (data.genreBreakdown.length >= 2) list.push({ key: 'genres', Comp: GenresSlide });
    if (data.weekday.best >= 0) list.push({ key: 'rhythm', Comp: RhythmSlide });
    if (data.longestStreak >= 2) list.push({ key: 'streak', Comp: StreakSlide });
    if (data.topRated) list.push({ key: 'favmoment', Comp: FavoriteMomentSlide });
    if (data.earnedBadgeCount > 0) list.push({ key: 'achievements', Comp: AchievementsSlide });
    list.push({ key: 'personality', Comp: PersonalitySlide });
    list.push({ key: 'finale', Comp: FinaleSlide, isFinale: true });
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
      <HeroBackground images={data.heroImages} tintColor={data.vividColor} />

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

  genreRow: { marginBottom: 14 },
  genreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  genreDot: { width: 10, height: 10, borderRadius: 5 },
  genreLabel: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14 },
  genrePct: { color: 'rgba(255,255,255,0.8)', fontWeight: '900', fontSize: 14 },
  genreTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  genreFill: { height: '100%', borderRadius: 4 },

  tierPill: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  tierPillText: { fontWeight: '800', fontSize: 14 },

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
