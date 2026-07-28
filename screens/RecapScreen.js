import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, TouchableWithoutFeedback,
  Share, Dimensions, Easing, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Pattern, Circle, Rect, Line, G } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useProfile } from '../utils/ProfileContext';
import { fetchMangaInfo } from '../utils/mangaCovers';
import { getMergedDailyLog, getMergedHourLog, peakReadingWindow, localDateKey } from '../utils/readerUtils';
import { BADGE_GRADES, ALL_BADGES, profileToBadgeStats, computeEarnedBadgeIds, highestGradeEarned } from '../utils/badges';
import { StarRatingDisplay } from '../components/StarRating';
import { selection } from '../utils/haptics';
import StarLogo from '../components/StarLogo';

const AUTO_MS = 6000;
const FALLBACK_BG = '#15101B';
// The brand display face, already loaded app-wide in App.js. Every headline
// and stat number in the recap uses it — system-bold was what made the whole
// thing read as a dashboard instead of a designed spread.
const DISPLAY = 'MangaRecsBrand';

// Each slide is its own colour composition rather than text floating over one
// shared photo — that alternation (deep colour → cream paper → deep colour) is
// what gives a Wrapped-style story its rhythm. `paper` slides deliberately
// invert to dark ink on light stock, the way a print manga volume does.
// `art` is intentionally LOW. The art is a texture inside the colour field,
// not the background — at 0.4+ a bright cover washes the whole theme out and
// every slide turns into the same photo, which is exactly what it used to do.
const THEMES = {
  crimson: { bg: ['#5E1220', '#16040A'], ink: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', accent: '#FF5A5A', art: 0.20 },
  navy:    { bg: ['#14265A', '#040814'], ink: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', accent: '#7FB4FF', art: 0.16 },
  paper:   { bg: ['#F6EDDE', '#DBC9AC'], ink: '#1A1208', dim: 'rgba(26,18,8,0.7)',  accent: '#C4452D', art: 0.10 },
  ember:   { bg: ['#6B160C', '#170503'], ink: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', accent: '#FF7A4A', art: 0.18 },
  violet:  { bg: ['#3A1670', '#0B0518'], ink: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', accent: '#C0A0FF', art: 0.18 },
  teal:    { bg: ['#0C4744', '#02100F'], ink: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', accent: '#5FE3D6', art: 0.16 },
};

// Lightweight direct AniList lookup for MangaRecap's hero backgrounds — a
// bare single-Media search for just 4 fields, not the app's usual 5-source
// cover race (utils/mangaCovers.js), because only AniList exposes bannerImage
// (a wide promo/key-art crop with no logo baked in, unlike a portrait cover)
// and a precomputed dominant color, and a recap needs those specifically for
// a real color-graded hero rather than a plain portrait cover thumbnail.
// `characters` is what makes the recap look like real manga rather than a
// stats dashboard: AniList ships a portrait per character, so the Favorite
// Moments grid can be built from actual characters out of the reader's own
// top series. (Scanned interior panels — what a mockup would use — aren't
// available from any API and aren't ours to redistribute; official character
// portraits are the legitimate equivalent and read almost identically.)
const ANILIST_ART_QUERY = 'query($search: String) { Media(search: $search, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage genres characters(perPage: 6, sort: ROLE) { edges { node { name { full } image { large medium } } } } } }';
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
function peakIconFor(startHour) {
  const h = typeof startHour === 'number' ? startHour : 21;
  if (h >= 20 || h < 5) return 'moon';
  if (h < 12) return 'sunny';
  if (h < 17) return 'partly-sunny';
  return 'cloudy-night';
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

// ── Manga texture primitives ─────────────────────────────────────────────
// The visual language that makes this read as manga rather than as a generic
// stats dashboard: screentone dots and radiating speed lines, the two most
// recognizable print-manga textures. Both are pure geometry (no bitmap
// assets, no licensed art) and sit above the photo but below the text.

function HalftoneOverlay({ color = '#ffffff', opacity = 0.16, size = 9, dot = 1.5 }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="mrHalftone" width={size} height={size} patternUnits="userSpaceOnUse">
          <Circle cx={size / 2} cy={size / 2} r={dot} fill={color} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#mrHalftone)" opacity={opacity} />
    </Svg>
  );
}

// Radiating "impact" lines, the manga shorthand for energy/emphasis. Drawn
// from an inner radius outward so the middle stays clear for the stat text.
function SpeedLines({ color = '#ffffff', opacity = 0.2, count = 30 }) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const jitter = 0.55 + ((i * 37) % 30) / 100;
    const x1 = 50 + Math.cos(a) * 26, y1 = 50 + Math.sin(a) * 26;
    const x2 = 50 + Math.cos(a) * (70 * jitter + 34), y2 = 50 + Math.sin(a) * (70 * jitter + 34);
    lines.push(
      <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.7 + (i % 3) * 0.5} strokeLinecap="round" />
    );
  }
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <G opacity={opacity}>{lines}</G>
    </Svg>
  );
}

// Slowly rotating speed lines — used behind the biggest stat moments so the
// emphasis reads as motion rather than a frozen sunburst.
function RotatingSpeedLines({ color, opacity = 0.18 }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]} pointerEvents="none">
      <SpeedLines color={color} opacity={opacity} />
    </Animated.View>
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
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.26] });
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

// Each slide's own colour composition. The reader's real art still moves
// underneath (cycling covers, Ken Burns drift), but it now sits INSIDE a
// designed colour field at a per-theme opacity rather than being the whole
// background — so a cream "paper" slide stays paper, and a crimson slide
// stays crimson, instead of every slide looking like the same photo.
function HeroBackground({ images, tintColor, theme }) {
  const t = theme || THEMES.violet;
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

  const isPaper = t.ink !== '#FFFFFF';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg[1], overflow: 'hidden' }]} pointerEvents="none">
      {/* 1. The slide's own colour field — the base everything sits on. */}
      <LinearGradient colors={t.bg} style={StyleSheet.absoluteFill} />
      {!isPaper && <AmbientGlow color={t.accent} />}
      {/* 2. The reader's real art, held at the theme's opacity so it enriches
             the colour field instead of replacing it. */}
      {uri && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }], opacity: t.art }]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={700} cachePolicy="disk" />
        </Animated.View>
      )}
      {/* 3. Re-tint hard toward the theme. These alphas are high on purpose:
             the palette must win over the photo, and the bottom two-thirds
             (where all the text lives) has to stay solidly legible. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tintOpacity }]}>
        <LinearGradient
          colors={isPaper
            ? [hexToRgba(t.bg[0], 0.86), hexToRgba(t.bg[0], 0.93), hexToRgba(t.bg[1], 0.99)]
            : [hexToRgba(t.bg[0], 0.7), hexToRgba(t.bg[0], 0.82), hexToRgba(t.bg[1], 0.97), hexToRgba(t.bg[1], 1)]}
          locations={isPaper ? [0, 0.5, 1] : [0, 0.4, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* 4. Screentone — the texture that most reads as printed manga. Fine
             and faint: at a larger dot it stops being texture and becomes a
             visible mesh laid over the art. */}
      <HalftoneOverlay color={isPaper ? '#1A1208' : '#ffffff'} opacity={isPaper ? 0.07 : 0.08} size={7} dot={1} />
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

// A fanned stack of the reader's own real covers, gently drifting — the
// "here's what you actually read" visual, instead of describing it in text.
function CoverFan({ covers, tint }) {
  const items = (covers || []).filter(Boolean).slice(0, 5);
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [float]);
  if (!items.length) return null;
  const mid = (items.length - 1) / 2;
  return (
    <View style={styles.coverFan} pointerEvents="none">
      {items.map((uri, i) => {
        const offset = i - mid;
        const drift = float.interpolate({ inputRange: [0, 1], outputRange: [0, (i % 2 === 0 ? -1 : 1) * 7] });
        return (
          <Animated.View
            key={uri + i}
            style={[
              styles.coverFanItem,
              {
                marginLeft: i === 0 ? 0 : -26,
                zIndex: 10 - Math.abs(offset),
                transform: [{ rotate: `${offset * 7}deg` }, { translateY: drift }, { scale: 1 - Math.abs(offset) * 0.06 }],
                borderColor: hexToRgba(tint, 0.7),
              },
            ]}
          >
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="disk" />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── Slides ───────────────────────────────────────────────────────────────

function IntroSlide({ data, t }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0} style={{ alignItems: 'center' }}>
        <CoverFan covers={data.topSeries.map((s) => s.cover)} tint={t.accent} />
      </Reveal>
      <Reveal delay={160}><Text style={[styles.eyebrow, { color: t.dim }]}>{data.period.label}</Text></Reveal>
      <Reveal delay={260}><Text style={[styles.megaTitle, { color: t.ink }]}>Your{'\n'}MangaRecap</Text></Reveal>
      <Reveal delay={420}><Text style={[styles.subLeft, { color: t.dim }]}>Six months of reading, wrapped. Let's get into it, @{data.username}.</Text></Reveal>
      <Reveal delay={560} style={styles.tapHintRow}>
        <Text style={[styles.tapHint, { color: t.dim }]}>Tap to begin your journey</Text>
        <Ionicons name="chevron-down" size={16} color={t.dim} />
      </Reveal>
    </View>
  );
}

// The reference's "you dove into N chapters across N series spent N hours"
// beat — three real numbers stacked as one falling headline, each landing
// with its own punch, over rotating speed lines.
function StatsSlide({ data, t }) {
  const chapters = useCountUp(data.chaptersInPeriod, 1100);
  const series = useCountUp(data.seriesTouched, 900);
  const hours = useCountUp(Math.round(data.hoursRead), 1300);
  return (
    <View style={styles.bottomAnchor}>
      <RotatingSpeedLines color={t.accent} opacity={0.16} />
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>You dove into</Text></Reveal>
      <Reveal delay={90}>
        <Animated.Text style={[styles.bigNumber, { color: t.ink, transform: [{ scale: chapters.punch }] }]}>
          {chapters.value.toLocaleString()}
        </Animated.Text>
      </Reveal>
      <Reveal delay={170}><Text style={[styles.label, { color: t.dim }]}>Chapters</Text></Reveal>
      <Reveal delay={300} style={styles.statSplitRow}>
        <View style={styles.statSplitCell}>
          <Animated.Text style={[styles.midNumber, { color: t.ink, transform: [{ scale: series.punch }] }]}>{series.value}</Animated.Text>
          <Text style={[styles.label, { color: t.dim }]}>Series</Text>
        </View>
        <View style={[styles.statSplitDivider, { backgroundColor: t.dim, opacity: 0.4 }]} />
        <View style={styles.statSplitCell}>
          <Animated.Text style={[styles.midNumber, { color: t.ink, transform: [{ scale: hours.punch }] }]}>{hours.value}</Animated.Text>
          <Text style={[styles.label, { color: t.dim }]}>Hours</Text>
        </View>
      </Reveal>
    </View>
  );
}

function TopSeriesSlide({ data, t }) {
  const paper = t.ink !== '#FFFFFF';
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Your top series</Text></Reveal>
      <View style={{ marginTop: 14, width: '100%' }}>
        {data.topSeries.map((s, i) => (
          <Reveal
            key={s.title + i}
            delay={140 + i * 110}
            style={[styles.topSeriesRow, {
              backgroundColor: paper ? 'rgba(26,18,8,0.06)' : 'rgba(255,255,255,0.09)',
              borderColor: paper ? 'rgba(26,18,8,0.14)' : 'rgba(255,255,255,0.1)',
            }]}
          >
            <Text style={[styles.topSeriesRank, { color: t.accent }]}>{i + 1}</Text>
            <RealCover uri={s.cover} style={styles.topSeriesCover} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.topSeriesTitle, { color: t.ink }]} numberOfLines={1}>{s.title}</Text>
              <Text style={[styles.topSeriesChapters, { color: t.dim }]}>{s.chapters} {s.chapters === 1 ? 'chapter' : 'chapters'}</Text>
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const GENRE_COLORS = ['#E8544A', '#E09A2B', '#4C7FD4', '#8B5CF6', '#7A8A99'];
// Ionicons standing in for each of AniList's real genre names, so the genre
// list reads as iconography rather than a plain bar chart.
const GENRE_ICONS = {
  Action: 'flash', Adventure: 'compass', Comedy: 'happy', Drama: 'rainy',
  Fantasy: 'sparkles', Horror: 'skull', Mystery: 'search', Romance: 'heart',
  'Sci-Fi': 'planet', 'Slice of Life': 'cafe', Sports: 'football',
  Supernatural: 'flame', Thriller: 'alert-circle', Psychological: 'eye',
  Mecha: 'hardware-chip', Music: 'musical-notes', Ecchi: 'flame', Other: 'ellipsis-horizontal',
};

// Real characters out of the reader's own top series, in a manga-panel grid —
// the "Favorite Moments" beat. Each tile is an official AniList character
// portrait, captioned with the character's name.
function FavoriteMomentsSlide({ data, t }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Favorite moments</Text></Reveal>
      <View style={styles.faceGrid}>
        {data.characters.map((c, i) => (
          <Reveal key={c.image} delay={110 + i * 85} style={styles.faceCell}>
            <View style={[styles.facePanel, { borderColor: hexToRgba(t.accent, 0.85) }]}>
              <Image source={{ uri: c.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="disk" />
              <LinearGradient colors={['transparent', 'rgba(6,4,14,0.92)']} style={styles.faceCaptionWrap}>
                <Text style={styles.faceName} numberOfLines={1}>{c.name}</Text>
              </LinearGradient>
            </View>
          </Reveal>
        ))}
      </View>
      <Reveal delay={620}><Text style={[styles.subLeft, { color: t.dim }]}>The characters you spent your half with.</Text></Reveal>
    </View>
  );
}

function GenresSlide({ data, t }) {
  const rows = data.genreBreakdown;
  const paper = t.ink !== '#FFFFFF';
  const anims = useRef(rows.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(90, anims.map((a, i) =>
      Animated.timing(a, { toValue: rows[i].pct / 100, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    )).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Genres you explored</Text></Reveal>
      <View style={{ marginTop: 14, width: '100%' }}>
        {rows.map((r, i) => {
          const width = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
          const color = GENRE_COLORS[i % GENRE_COLORS.length];
          return (
            <Reveal key={r.label} delay={100 + i * 70} style={styles.genreRow}>
              <View style={styles.genreLabelRow}>
                <View style={[styles.genreIconWrap, { borderColor: color, backgroundColor: paper ? 'rgba(255,255,255,0.5)' : 'rgba(6,4,14,0.4)' }]}>
                  <Ionicons name={GENRE_ICONS[r.label] || 'ellipse'} size={15} color={color} />
                </View>
                <Text style={[styles.genreLabel, { color: t.ink }]}>{r.label}</Text>
                <Text style={[styles.genrePct, { color: t.dim }]}>{r.pct}%</Text>
              </View>
              <View style={[styles.genreTrack, { backgroundColor: paper ? 'rgba(26,18,8,0.12)' : 'rgba(255,255,255,0.1)' }]}>
                <Animated.View style={[styles.genreFill, { width, backgroundColor: color }]} />
              </View>
            </Reveal>
          );
        })}
      </View>
    </View>
  );
}

function RhythmSlide({ data, t }) {
  const { weekday } = data;
  const paper = t.ink !== '#FFFFFF';
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
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>You read the most on</Text></Reveal>
      <Reveal delay={90}><Text style={[styles.title, { color: t.ink }]}>{weekday.bestName}s</Text></Reveal>
      <View style={styles.barsRow}>
        {weekday.labels.map((label, i) => {
          const height = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });
          const isBest = i === weekday.best;
          return (
            <View key={label + i} style={styles.barCol}>
              <View style={[styles.barTrack, { backgroundColor: paper ? 'rgba(26,18,8,0.1)' : 'rgba(255,255,255,0.08)' }]}>
                <Animated.View style={[styles.barFill, { height, backgroundColor: isBest ? t.accent : hexToRgba(t.ink, 0.62) }]} />
              </View>
              <Text style={[styles.barLabel, { color: isBest ? t.ink : t.dim }, isBest && styles.barLabelBest]}>{label}</Text>
            </View>
          );
        })}
      </View>
      {data.peakWindow && (
        <Reveal delay={360} style={[styles.peakPill, { borderColor: hexToRgba(t.accent, 0.9), backgroundColor: paper ? 'rgba(255,255,255,0.5)' : 'rgba(6,4,14,0.45)' }]}>
          {/* Icon follows the actual window — a moon over a 10AM peak was
              just wrong. Night = 8PM-5AM, morning = 5AM-noon, else day. */}
          <Ionicons name={peakIconFor(data.peakWindow.startHour)} size={15} color={t.accent} />
          <View>
            <Text style={[styles.peakLabel, { color: t.dim }]}>Peak reading time</Text>
            <Text style={[styles.peakValue, { color: t.ink }]}>{data.peakWindow.label}</Text>
          </View>
          <Text style={[styles.peakPct, { color: t.dim }]}>{data.peakWindow.pct}%</Text>
        </Reveal>
      )}
    </View>
  );
}

function StreakSlide({ data, t }) {
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
      <RotatingSpeedLines color={t.accent} opacity={0.22} />
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Your longest reading streak</Text></Reveal>
      <Reveal delay={80}>
        <Animated.View style={{ transform: [{ scale: flickerScale }], marginBottom: 8 }}>
          <Ionicons name="flame" size={60} color={t.accent} />
        </Animated.View>
      </Reveal>
      <Reveal delay={160}>
        <Animated.Text style={[styles.bigNumber, { color: t.ink, transform: [{ scale: punch }] }]}>{streak}</Animated.Text>
      </Reveal>
      <Reveal delay={240}><Text style={[styles.label, { color: t.dim }]}>Days in a row</Text></Reveal>
    </View>
  );
}

function FavoriteMomentSlide({ data, t }) {
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Your favorite moment</Text></Reveal>
      <Reveal delay={100}><RealCover uri={data.topRated.cover} style={styles.favCover} /></Reveal>
      <Reveal delay={220}><Text style={[styles.title, { color: t.ink }]}>{data.topRated.title}</Text></Reveal>
      <Reveal delay={320}><StarRatingDisplay avg={data.topRated.stars} showCount={false} size={24} /></Reveal>
      <Reveal delay={420}><Text style={[styles.subLeft, { color: t.dim }]}>Your highest-rated read this half.</Text></Reveal>
    </View>
  );
}

function AchievementsSlide({ data, t }) {
  const { value: count, punch } = useCountUp(data.earnedBadgeCount);
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Achievements & milestones</Text></Reveal>
      <Reveal delay={100}>
        <Animated.Text style={[styles.bigNumber, { color: t.ink, transform: [{ scale: punch }] }]}>{count}</Animated.Text>
      </Reveal>
      <Reveal delay={180}><Text style={[styles.label, { color: t.dim }]}>of {data.totalBadgeCount} badges unlocked</Text></Reveal>
      {data.tierLabel && (
        <Reveal delay={320} style={[styles.tierPill, { borderColor: t.accent }]}>
          <Text style={[styles.tierPillText, { color: t.accent }]}>{data.tierLabel} Tier</Text>
        </Reveal>
      )}
    </View>
  );
}

function PersonalitySlide({ data, t }) {
  const a = data.archetype;
  return (
    <View style={styles.bottomAnchor}>
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>Your reading personality</Text></Reveal>
      <Reveal delay={100} style={[styles.archetypeBadge, { borderColor: t.accent }]}>
        <Ionicons name={a.icon} size={30} color={t.accent} />
      </Reveal>
      <Reveal delay={220}><Text style={[styles.title, { color: t.ink }]}>{a.title}</Text></Reveal>
      <Reveal delay={340}><Text style={[styles.subLeft, { color: t.dim }]}>{a.desc}</Text></Reveal>
    </View>
  );
}

function FinaleSlide({ data, onDone, t }) {
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
      <Reveal delay={0}><Text style={[styles.eyebrow, { color: t.dim }]}>{data.period.label}</Text></Reveal>
      <Reveal delay={90}><Text style={[styles.megaTitle, { color: t.ink }]}>What a{'\n'}legendary half!</Text></Reveal>
      <View style={styles.finaleStatsGrid}>
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={220 + i * 80} style={styles.finaleStatCell}>
            <Text style={[styles.finaleStatValue, { color: t.ink }]} numberOfLines={1}>{s.value}</Text>
            <Text style={[styles.finaleStatLabel, { color: t.dim }]}>{s.label}</Text>
          </Reveal>
        ))}
      </View>
      <Reveal delay={600} style={styles.finaleActions}>
        <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: t.accent }]} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-social" size={16} color="#14060B" />
          <Text style={styles.btnPrimaryText}>Share your recap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGhost, { borderColor: hexToRgba(t.ink, 0.35) }]} onPress={onDone} activeOpacity={0.85}>
          <Text style={[styles.btnGhostText, { color: t.ink }]}>Continue reading</Text>
        </TouchableOpacity>
      </Reveal>
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

        const [progressRes, commentsRes, ratingsCountRes, topRatedRes, dailyLog, hourLog] = await Promise.all([
          supabase.from('reading_progress').select('series_title,status,current_chapter,updated_at').eq('user_id', userId).gte('updated_at', startIso).lte('updated_at', endIso),
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('series_ratings').select('series_title', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('series_ratings').select('series_title,stars,created_at').eq('user_id', userId).gte('created_at', startIso).lte('created_at', endIso).order('stars', { ascending: false }).limit(1),
          getMergedDailyLog(profile?.daily_log),
          getMergedHourLog(profile?.hour_log),
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
          // Chapters actually reached across the series they touched this
          // half — summed from their own reading_progress rows, not the
          // lifetime chapters_read counter (which spans all time).
          chaptersInPeriod: progressRows.reduce((s, r) => s + (r.current_chapter || 0), 0),
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
          const characters = (al?.characters?.edges || [])
            .map((e) => ({ name: e?.node?.name?.full || '', image: e?.node?.image?.large || e?.node?.image?.medium || null }))
            .filter((c) => c.image);
          return { cover, hero, color, genres, characters };
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

        // Favorite Moments grid — real characters from the reader's own top
        // series, interleaved round-robin so the grid spans several of their
        // series instead of showing six faces from whichever one resolved
        // first. Deduped by image URL.
        const faces = [];
        const seenFace = new Set();
        for (let round = 0; round < 6; round++) {
          topSeries.forEach((s) => {
            const c = (s.characters || [])[round];
            if (c && !seenFace.has(c.image)) { seenFace.add(c.image); faces.push({ ...c, series: s.title }); }
          });
        }
        base.characters = faces.slice(0, 6);

        // Real peak reading window — only exists once hour_log has data (the
        // column was added with this feature, so it stays empty until the
        // reader logs sessions from here on; the slide is skipped, never faked).
        base.peakWindow = peakReadingWindow(hourLog);

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

  // Theme + footer per slide. The deep-colour / cream-paper alternation is
  // deliberate: it's the rhythm that makes the story read as a designed spread
  // rather than one photo with different text on it.
  const slideDefs = useMemo(() => {
    if (!data) return [];
    const list = [
      { key: 'intro', Comp: IntroSlide, theme: THEMES.crimson, foot: 'Every chapter is a new adventure' },
      { key: 'stats', Comp: StatsSlide, theme: THEMES.navy, foot: 'Six months, one story at a time' },
    ];
    if (data.topSeries.length) list.push({ key: 'topseries', Comp: TopSeriesSlide, theme: THEMES.paper, foot: 'These stories made the biggest impact' });
    if (data.genreBreakdown.length >= 2) list.push({ key: 'genres', Comp: GenresSlide, theme: THEMES.paper, foot: 'Every genre took you somewhere new' });
    if (data.weekday.best >= 0) list.push({ key: 'rhythm', Comp: RhythmSlide, theme: THEMES.navy, foot: 'Those late nights hit different' });
    if (data.longestStreak >= 2) list.push({ key: 'streak', Comp: StreakSlide, theme: THEMES.ember, foot: 'Consistency is power' });
    // Two "favorites" beats that would otherwise both fire and push the story
    // past 10 slides. The character grid is the stronger visual (and the one
    // the design reference leads with), so it wins when there's enough real
    // character art; the highest-rated-series slide is the fallback when a
    // reader's titles don't resolve enough portraits.
    if (data.characters.length >= 3) list.push({ key: 'faces', Comp: FavoriteMomentsSlide, theme: THEMES.crimson, foot: 'Those moments will stay with you' });
    else if (data.topRated) list.push({ key: 'favmoment', Comp: FavoriteMomentSlide, theme: THEMES.crimson, foot: 'Those moments will stay with you' });
    if (data.earnedBadgeCount > 0) list.push({ key: 'achievements', Comp: AchievementsSlide, theme: THEMES.teal, foot: 'Earned, not given' });
    list.push({ key: 'personality', Comp: PersonalitySlide, theme: THEMES.violet, foot: 'This half was uniquely yours' });
    list.push({ key: 'finale', Comp: FinaleSlide, theme: THEMES.violet, foot: 'Never stop turning pages', isFinale: true });
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
      <HeroBackground images={data.heroImages} tintColor={data.vividColor} theme={current.theme} />

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

      <View key={current.key} style={[styles.contentWrap, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <CurrentComp data={data} onDone={close} t={current.theme} />
        {/* Footer caption — every slide in the reference closes on one, and
            it's a surprising amount of what makes the story feel authored. */}
        {!!current.foot && (
          <Reveal delay={760}>
            <Text style={[styles.footCaption, { color: current.theme.dim }]}>{current.foot}</Text>
          </Reveal>
        )}
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
  footCaption: { fontSize: 12.5, fontWeight: '700', textAlign: 'center', marginTop: 20, letterSpacing: 0.2 },
  bottomAnchor: { width: '100%' },

  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  megaTitle: { fontFamily: DISPLAY, fontSize: 44, lineHeight: 48, marginBottom: 12, letterSpacing: -0.5 },
  title: { fontFamily: DISPLAY, fontSize: 32, marginBottom: 8 },
  sub: { color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 21, marginTop: 4, textAlign: 'center' },
  subLeft: { color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 21, marginTop: 4 },
  bigNumber: { fontFamily: DISPLAY, fontSize: 82, letterSpacing: -1, lineHeight: 88 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },

  tapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  tapHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },

  chipRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  coverBase: { backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },

  topSeriesRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 10, marginBottom: 10 },
  topSeriesRank: { fontFamily: DISPLAY, fontSize: 24, width: 24, textAlign: 'center' },
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

  coverFan: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 22, height: 150 },
  coverFanItem: {
    width: 96, height: 138, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },

  midNumber: { fontFamily: DISPLAY, fontSize: 44 },
  statSplitRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 },
  statSplitCell: { alignItems: 'flex-start' },
  statSplitDivider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.25)' },

  faceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, marginBottom: 6 },
  faceCell: { width: '31%', aspectRatio: 0.78 },
  facePanel: { flex: 1, borderRadius: 8, overflow: 'hidden', borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  faceCaptionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 5, paddingTop: 14, paddingBottom: 5 },
  faceName: { color: '#fff', fontSize: 9.5, fontWeight: '800' },

  peakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(6,4,14,0.45)',
  },
  peakLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  peakValue: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 1 },
  peakPct: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '900', marginLeft: 4 },

  genreRow: { marginBottom: 14 },
  genreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  genreIconWrap: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,4,14,0.4)',
  },
  genreLabel: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14 },
  genrePct: { color: 'rgba(255,255,255,0.8)', fontWeight: '900', fontSize: 14 },
  genreTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  genreFill: { height: '100%', borderRadius: 4 },

  tierPill: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  tierPillText: { fontWeight: '800', fontSize: 14 },

  archetypeBadge: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 14 },

  finaleStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, marginBottom: 20 },
  finaleStatCell: { width: '47%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12 },
  finaleStatValue: { fontFamily: DISPLAY, fontSize: 24 },
  finaleStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginTop: 2 },

  finaleActions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  btnPrimaryText: { color: '#0D0D0F', fontWeight: '800', fontSize: 14 },
  btnGhost: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  btnGhostText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
