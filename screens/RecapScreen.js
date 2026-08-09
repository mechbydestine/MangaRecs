// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — MangaRecs' half-yearly reading story.
//
// Ten slides, and no two of them are the same shape. The old recap put every
// beat in the same bottom-left stack over a scrim, which is why it read as a
// statistics page no matter how the background moved; here each slide owns its
// composition — a poster, a printed page of panels, a number that fills the
// frame, a day/night split, a 3D card runway, a radial chart, a trading card,
// a badge shelf, a calendar of fire, and a share poster.
//
// Nothing about the look is fixed. utils/recapIdentity.js derives three
// independent axes from real reading history — print mode from where the
// reader's stories come from, palette from the true dominant colours of their
// covers, texture from their genre lane — so two readers get structurally
// different recaps, not the same recap tinted differently.
//
// All artwork is real: official covers the app already displays, moved rather
// than generated (components/RecapStage.js).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, Share,
  Easing, ActivityIndicator, PanResponder, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../utils/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { DeviceMotion } from 'expo-sensors';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase';
import { useProfile } from '../utils/ProfileContext';
import { fetchMangaInfo } from '../utils/mangaCovers';
import { getMergedDailyLog, getMergedHourLog, peakReadingWindow, localDateKey } from '../utils/readerUtils';
import {
  BADGE_GRADES, ALL_BADGES, GRADE_ORDER,
  profileToBadgeStats, computeEarnedBadgeIds, highestGradeEarned,
} from '../utils/badges';
import BadgeIcon from '../components/BadgeIcon';
import { buildIdentity, surfaceFor, rgba } from '../utils/recapIdentity';
import { getState as ambienceState } from '../utils/ambiencePlayer';
import { trackFor, fadeIn, fadeOutAndStop, MUSIC_VOLUME } from '../utils/recapMusic';
import {
  TextureStack, Panel, PrintText, Bubble, GhostNumeral, Stamp, TornEdge, Band, TransitionCut,
  StageWall, StageDrift, StageImpact, StageHorizon, StageRunway,
  StageOrbit, StagePanelGrid, StageCelebrate, StageEmber, StageFinale,
} from '../components/RecapStage';
import RecapExportCard from '../components/RecapExportCard';
import RecapCompareModal from '../components/RecapCompareModal';
import {
  fetchPreviousSnapshot, fetchOldestSnapshot, fetchFriendsRecap, saveSnapshot,
  readingDnaCode, ratingPersonality,
} from '../utils/recapHistory';
import { selection, light as hapticLight, success as hapticSuccess } from '../utils/haptics';
import { HIT_SLOP } from '../utils/tokens';
import { TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { useReducedMotion } from '../utils/a11y';

const DISPLAY = 'MangaRecsBrand';
// Per-slide autoplay pace — slides carrying more to read (top series, badge
// shelf, time) get longer than a pure title-card beat. Index-aligned with
// SLIDES below.
const SLIDE_DURATIONS = [6200, 7800, 6800, 8400, 8800, 7600, 7400, 8600, 7200, 0];


// ── period + stat maths ──────────────────────────────────────────────────

function getPeriod(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (m >= 6) return { label: `First Half ${y}`, short: `Jan – Jun ${y}`, start: new Date(y, 0, 1), end: new Date(y, 6, 0, 23, 59, 59) };
  return { label: `Second Half ${y - 1}`, short: `Jul – Dec ${y - 1}`, start: new Date(y - 1, 6, 1), end: new Date(y, 0, 0, 23, 59, 59) };
}

// ── TEMP TESTING TOGGLE ──────────────────────────────────────────────────
// Flip this back to false to restore the real half-year recap. While true,
// the recap covers everything since the account was created instead of just
// the current half — for previewing every beat with real accumulated data
// before deciding what to change. getPeriod() itself is untouched, so this
// is a one-line revert whenever you're done.
const TESTING_ALL_TIME = false;

function getAllTimePeriod(profile, now = new Date()) {
  const start = profile?.created_at ? new Date(profile.created_at) : new Date(2024, 0, 1);
  return { label: 'All Time', short: 'All Time', start, end: now };
}

function keysInRange(log, start, end) {
  return Object.keys(log || {}).filter((k) => { const d = new Date(`${k}T00:00:00`); return d >= start && d <= end; });
}

// Returns the run itself, not just its length — slide 9 shows the reader the
// real dates they held the streak across.
function longestStreak(log, start, end) {
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let best = 0, run = 0, bestEnd = null, runEnd = null;
  while (cur <= endDay) {
    if ((log[localDateKey(cur)] || 0) > 0) { run += 1; runEnd = new Date(cur); }
    else { run = 0; runEnd = null; }
    if (run > best) { best = run; bestEnd = runEnd; }
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  const bestStart = bestEnd ? new Date(bestEnd.getFullYear(), bestEnd.getMonth(), bestEnd.getDate() - best + 1) : null;
  return { best, start: bestStart, end: bestEnd };
}

function weekdayBreakdown(log, start, end) {
  const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) { totals[cur.getDay()] += log[localDateKey(cur)] || 0; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1); }
  const sum = totals.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 1; i < 7; i++) if (totals[i] > totals[best]) best = i;
  return {
    totals,
    best: totals[best] > 0 ? best : -1,
    bestName: totals[best] > 0 ? FULL[best] : null,
    weekendShare: sum > 0 ? (totals[0] + totals[6]) / sum : 0,
  };
}

function genreBreakdown(series) {
  const w = {}; let total = 0;
  (series || []).forEach((s) => {
    const g = (s.genres && s.genres.length) ? s.genres : [];
    if (!g.length) return;
    const share = (s.chapters || 1) / g.length;
    g.forEach((x) => { w[x] = (w[x] || 0) + share; total += share; });
  });
  if (!total) return [];
  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, v]) => ({ label, pct: Math.round((v / total) * 100) }))
    .filter((r) => r.pct > 0);
}

// Reading personality, from real signals only, ordered by how distinctive the
// signal is — the rarest true statement about a reader wins. Every entry
// carries its own seal glyph for the trading card on slide 7.
function personality(d) {
  const c = [];
  const night = d.peakWindow && (d.peakWindow.startHour >= 21 || d.peakWindow.startHour < 4);
  const dawn = d.peakWindow && d.peakWindow.startHour >= 4 && d.peakWindow.startHour < 8;

  if (night) c.push({ w: 100, icon: 'moon', seal: '夜', title: 'The Night Owl', desc: 'The best chapters happen after midnight.' });
  if (dawn) c.push({ w: 96, icon: 'partly-sunny', seal: '暁', title: 'The Dawn Reader', desc: 'You get the first pages of the day, every day.' });
  if (d.completed >= 3) c.push({ w: 90 + d.completed, icon: 'checkmark-done', seal: '完', title: 'The Completionist', desc: 'You do not leave a story unfinished.' });
  if (d.longest >= 21) c.push({ w: 86 + d.longest, icon: 'flame', seal: '炎', title: 'The Devoted', desc: 'A streak that simply refuses to break.' });
  if (d.comments >= 15) c.push({ w: 84, icon: 'chatbubbles', seal: '声', title: 'The Voice', desc: 'You never finish a chapter quietly.' });
  if (d.chaptersPerHour >= 12) c.push({ w: 80, icon: 'flash', seal: '疾', title: 'The Speed Reader', desc: 'You move through pages like they owe you money.' });
  if (d.ratings >= 10) c.push({ w: 76, icon: 'star', seal: '評', title: 'The Critic', desc: 'Nothing you read escapes a verdict.' });
  if (d.weekendShare >= 0.5) c.push({ w: 72, icon: 'sunny', seal: '週', title: 'The Weekender', desc: 'Saturday morning belongs to the shelf.' });
  if (d.genres >= 5) c.push({ w: 70 + d.genres, icon: 'compass', seal: '探', title: 'The Explorer', desc: 'No single genre could ever hold you.' });
  if (d.series >= 8) c.push({ w: 60 + d.series, icon: 'library', seal: '集', title: 'The Collector', desc: 'Always three stories deep, at minimum.' });
  if (d.series > 0 && d.series <= 3 && d.chapters >= 40) c.push({ w: 55, icon: 'heart', seal: '忠', title: 'The Loyalist', desc: 'A few worlds, known completely.' });
  if (d.hours >= 60) c.push({ w: 50, icon: 'hourglass', seal: '没', title: 'The Immersed', desc: 'Time genuinely disappears when you read.' });
  c.push({ w: 1, icon: 'sparkles', seal: '新', title: 'The Rising Reader', desc: 'The story is only getting started.' });

  c.sort((a, b) => b.w - a.w);
  return c[0];
}

// ── AniList art (one batched request) ────────────────────────────────────
// countryOfOrigin is the axis that picks the reader's whole design language,
// so it matters as much here as the cover URL does.
async function fetchArtBatch(titles) {
  const capped = (titles || []).slice(0, 12);
  if (!capped.length) return {};
  const params = capped.map((_, i) => `$s${i}: String`).join(', ');
  const fields = capped.map((_, i) =>
    `m${i}: Media(search: $s${i}, type: MANGA, isAdult: false) { coverImage { extraLarge large color } genres countryOfOrigin }`
  ).join(' ');
  const variables = {};
  capped.forEach((t, i) => { variables[`s${i}`] = t; });
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: `query(${params}) { ${fields} }`, variables }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const data = json?.data || {};
    const out = {};
    capped.forEach((t, i) => { out[t] = data[`m${i}`] || null; });
    return out;
  } catch (_) {
    return {};
  }
}

// Only reached when a reader has no resolvable art of their own at all.
async function fetchTrendingArt() {
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query { Page(page:1, perPage:14){ media(sort:TRENDING_DESC, type:MANGA, isAdult:false){ coverImage{ extraLarge large color } countryOfOrigin } } }' }),
    });
    if (!resp.ok) return [];
    const j = await resp.json();
    return (j?.data?.Page?.media || []).map((m) => ({
      cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
      color: m.coverImage?.color || null,
      country: m.countryOfOrigin || null,
    })).filter((x) => x.cover);
  } catch (_) { return []; }
}

function withTimeout(p, ms, fb) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]);
}

// ── motion primitives ────────────────────────────────────────────────────

function Reveal({ delay = 0, from = 'up', dist, style, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 165, mass: 0.85 }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [a, delay]);
  const D = dist != null ? dist : (from === 'left' || from === 'right' ? 38 : 24);
  const tf = from === 'left' || from === 'right'
    ? [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [from === 'left' ? -D : D, 0] }) }]
    : [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [from === 'down' ? -D : D, 0] }) }];
  return (
    <Animated.View style={[{ opacity: a, transform: [...tf, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Per-character kinetic headline — each glyph lands on its own spring, which is
// what gives the titles their anime title-card snap. Grouped by WORD (each
// word is its own flexWrap:'nowrap' row) so a line break can only ever land
// between words, never mid-letter — splitting "MANGA" into "MANG"/"A" or
// "HALF" into "HAL"/"F" was exactly what per-character-only wrapping did.
function Kinetic({ text, style, delay = 0, stagger = 40, from = 'below' }) {
  const words = String(text).split(' ');
  let i = 0;
  const groups = words.map((word, wi) => {
    const chars = word.split('');
    const startIdx = i;
    i += chars.length;
    const spaceIdx = wi < words.length - 1 ? i++ : null;
    return { chars, startIdx, spaceIdx };
  });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {groups.map((g, gi) => (
        <View key={gi} style={{ flexDirection: 'row', flexWrap: 'nowrap' }}>
          {g.chars.map((ch, ci) => (
            <KineticChar key={ci} ch={ch} style={style} delay={delay + (g.startIdx + ci) * stagger} from={from} />
          ))}
          {g.spaceIdx != null && <KineticChar ch=" " style={style} delay={delay + g.spaceIdx * stagger} from={from} />}
        </View>
      ))}
    </View>
  );
}
function KineticChar({ ch, style, delay, from }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 13, stiffness: 210, mass: 0.7 }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [a, delay]);
  const dy = from === 'above' ? -46 : 46;
  return (
    <Animated.Text
      style={[style, {
        opacity: a,
        transform: [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.45, 1] }) },
          { rotate: a.interpolate({ inputRange: [0, 1], outputRange: [`${from === 'above' ? -8 : 8}deg`, '0deg'] }) },
        ],
      }]}
    >
      {ch === ' ' ? ' ' : ch}
    </Animated.Text>
  );
}

// Odometer digit — each digit rolls on its own delay, so a four-figure chapter
// count lands like a counter instead of a number fading in.
function Odometer({ value, style, duration = 1800, onDone }) {
  const digits = String(Math.max(0, Math.round(value)));
  return (
    <View style={{ flexDirection: 'row' }}>
      {digits.split('').map((d, i) => (
        <Digit key={i} target={parseInt(d, 10)} style={style} duration={duration} delay={i * 110}
          onDone={i === digits.length - 1 ? onDone : undefined} />
      ))}
    </View>
  );
}
function Digit({ target, style, duration, delay, onDone }) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    let raf; const start = Date.now() + delay;
    const tick = () => {
      const now = Date.now();
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(target * eased + (1 - eased) * ((target + 7) % 10) * (1 - p)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setShown(target); if (!done.current) { done.current = true; onDone && onDone(); } }
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration, delay, onDone]);
  return <Text style={style}>{shown}</Text>;
}

function useCountUp(target, duration = 1500, delay = 0) {
  const [v, setV] = useState(0);
  const punch = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let raf; const start = Date.now() + delay;
    const tick = () => {
      const now = Date.now();
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, (now - start) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        Animated.sequence([
          Animated.timing(punch, { toValue: 1.16, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(punch, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 210 }),
        ]).start();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration, delay, punch]);
  return { value: v, punch };
}

// JS-driven 0→1 ramp, used where the value has to redraw real SVG geometry
// (the genre wheel's arcs, the clock's peak-window sweep) rather than move a
// transform — those cannot ride the native driver.
function useProgress(duration = 1100, delay = 200) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf; const start = Date.now() + delay;
    const tick = () => {
      const now = Date.now();
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(1, (now - start) / duration);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [duration, delay]);
  return p;
}

// ── svg arc helper ───────────────────────────────────────────────────────
function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx, cy, r, from, to) {
  const span = Math.max(0.01, Math.min(359.99, to - from));
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, from + span);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

// "+123 vs last half" — only renders once a prior recap_snapshots row exists,
// so a reader's very first MangaRecap never shows a hollow "+0".
function DeltaPill({ value, s }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const color = up ? '#3ECB6A' : '#FF6B6B';
  return (
    <View style={[styles.deltaPill, { borderColor: rgba(color, 0.5), backgroundColor: rgba(color, 0.14) }]}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={color} />
      <Text style={[styles.deltaText, { color }]}>{up ? '+' : ''}{value} vs last half</Text>
    </View>
  );
}

// A reader's real 24-hour shape, from their own hourLog — replaces a bare
// weekday caption with an actual line through the day.
function PulseSparkline({ pulse, peak, s, width, height = 44 }) {
  const path = useMemo(() => {
    if (!pulse || !pulse.length) return '';
    const n = pulse.length;
    const step = width / (n - 1);
    return pulse.map((v, i) => {
      const x = i * step;
      const y = height - (Math.min(1, v / peak) * (height - 6) + 3);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, [pulse, peak, width, height]);
  if (!path) return null;
  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={s.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </Svg>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 1 — THE POSTER
// Centred title card. No stats anywhere; this is the cold open.
// ═════════════════════════════════════════════════════════════════════════
function S1Welcome({ d, s, id, cw }) {
  const t = useT();
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [bob]);
  const chev = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });
  // Each glyph renders as its own Text node (Kinetic's per-character spring),
  // which loses natural kerning and runs noticeably wider than one continuous
  // string at the same font size — this multiplier is sized against that
  // measured width, not the font's nominal em-width, so "MANGA"/"RECAP"
  // actually fit instead of wrapping mid-word.
  const heroSize = Math.min(64, cw * 0.185);

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Reveal delay={60}>
        <Band s={s} id={id}>
          <Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.presents')}</Text>
        </Band>
      </Reveal>

      <View style={{ marginTop: 22, alignItems: 'center' }}>
        <Kinetic text="MANGA" delay={300} stagger={52} from="above"
          style={[styles.hero, { color: s.ink, fontSize: heroSize, lineHeight: heroSize * 1.02 }]} />
        <View style={{ marginTop: -heroSize * 0.1 }}>
          <Kinetic text="RECAP" delay={620} stagger={52}
            style={[styles.hero, { color: s.accent, fontSize: heroSize, lineHeight: heroSize * 1.02 }]} />
        </View>
      </View>

      <Reveal delay={1250} style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <View style={{ width: 34, height: 2.5, backgroundColor: s.accent }} />
          <Text style={[styles.lede, { color: s.ink }]}>{d.period.short.toUpperCase()}</Text>
          <View style={{ width: 34, height: 2.5, backgroundColor: s.accent }} />
        </View>
      </Reveal>

      <Reveal delay={1450}>
        <Text style={[styles.sub, { color: s.dim, textAlign: 'center' }]}>@{d.username}, here is your half.</Text>
      </Reveal>

      <Reveal delay={1900} style={{ marginTop: 34, alignItems: 'center' }}>
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: chev }] }}>
          <Ionicons name="chevron-up" size={22} color={s.accent} />
          <Text style={[styles.swipe, { color: s.dim }]}>{t('recap.swipeUp')}</Text>
        </Animated.View>
      </Reveal>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 2 — THE PRINTED PAGE
// Panels with gutters, and a real six-month calendar of the days they showed
// up, built from the actual daily log.
// ═════════════════════════════════════════════════════════════════════════
function S2Journey({ d, s, id }) {
  const t = useT();
  return (
    <View style={{ width: '100%' }}>
      <Reveal delay={0} from="left">
        <Panel s={s} id={id} tilt={-1} style={{ alignSelf: 'flex-start', paddingVertical: 14 }}>
          <Text style={[styles.kicker, { color: s.accent, marginBottom: 4 }]}>{t('recap.chapterOne')}</Text>
          <Text style={[styles.h3, { color: s.ink }]}>{t('recap.itStartedOn')}</Text>
          <PrintText s={s} id={id} style={[styles.h1, { color: s.ink, marginTop: 2 }]}>
            {d.firstDayLabel || 'day one'}
          </PrintText>
        </Panel>
      </Reveal>

      <Reveal delay={340} from="right" style={{ marginTop: 16 }}>
        <MonthStrip d={d} s={s} id={id} />
      </Reveal>

      <Reveal delay={900} style={{ marginTop: 18 }}>
        <Bubble s={s} id={id}>
          <Text style={[styles.bubbleText, { color: s.light ? id.paperInk : s.ink }]}>
            {d.readingDays > 0
              ? `You showed up on ${d.readingDays} different ${d.readingDays === 1 ? 'day' : 'days'}.`
              : 'Your first chapter of the half is still waiting.'}
          </Text>
        </Bubble>
      </Reveal>

      {!!d.firstEverTopSeries && (
        <Reveal delay={1150}>
          <Text style={[styles.subSmall, { color: s.dim, marginTop: 14 }]}>
            Your very first MangaRecap led with {d.firstEverTopSeries} — this half it's {d.topSeries[0]?.title || 'still being written'}.
          </Text>
        </Reveal>
      )}
    </View>
  );
}

// Six mini month grids, one per month of the period, each cell shaded by the
// real hours logged that day. Months animate in on a stagger.
function MonthStrip({ d, s, id }) {
  const months = useMemo(() => {
    const out = [];
    const cur = new Date(d.period.start.getFullYear(), d.period.start.getMonth(), 1);
    const endMonth = new Date(d.period.end.getFullYear(), d.period.end.getMonth(), 1);
    // Real month count between period.start and period.end — normally 6, but
    // TESTING_ALL_TIME can span years, so this can't be a hardcoded loop.
    const spanMonths = Math.max(1, (endMonth.getFullYear() - cur.getFullYear()) * 12 + (endMonth.getMonth() - cur.getMonth()) + 1);
    const showYear = spanMonths > 12;
    for (let i = 0; i < spanMonths; i++) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const days = new Date(y, m + 1, 0).getDate();
      const cells = [];
      for (let day = 1; day <= days; day++) {
        const key = localDateKey(new Date(y, m, day));
        cells.push(d.dailyLog[key] || 0);
      }
      const monthLabel = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      out.push({ label: showYear ? `${monthLabel} '${String(y).slice(2)}` : monthLabel, cells, lead: new Date(y, m, 1).getDay() });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [d.period, d.dailyLog]);

  const peak = useMemo(() => Math.max(0.5, ...months.flatMap((m) => m.cells)), [months]);
  const anims = useRef(months.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(95, anims.map((a) =>
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 150 })
    )).start();
  }, [anims]);

  return (
    <View style={styles.monthWrap}>
      {months.map((m, i) => (
        <Animated.View
          key={m.label + i}
          style={[styles.monthBlock, {
            opacity: anims[i],
            transform: [
              { scale: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
              { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            ],
          }]}
        >
          <Text style={[styles.monthLabel, { color: s.dim }]}>{m.label}</Text>
          <View style={styles.monthGrid}>
            {Array.from({ length: m.lead }).map((_, k) => <View key={`p${k}`} style={styles.dayCell} />)}
            {m.cells.map((v, k) => (
              <View
                key={k}
                style={[styles.dayCell, {
                  backgroundColor: v > 0 ? rgba(s.accent, 0.3 + Math.min(0.7, v / peak) * 0.7) : s.faint,
                  borderRadius: id.mode.radius > 8 ? 3 : 1,
                }]}
              />
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 3 — THE NUMBER
// The chapter count IS the page: a ghost numeral bleeding off both edges, the
// live odometer on top of it, and an impact shake when the last digit lands.
// ═════════════════════════════════════════════════════════════════════════
function S3Chapters({ d, s, id, w, cw }) {
  const t = useT();
  const [landed, setLanded] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const onDone = useCallback(() => {
    setLanded(true);
    hapticSuccess();
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -0.3, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const tx = shake.interpolate({ inputRange: [-1, 1], outputRange: [-11, 11] });
  const ty = shake.interpolate({ inputRange: [-1, 1], outputRange: [6, -6] });
  const digits = String(Math.max(0, Math.round(d.chapters))).length;
  const megaSize = Math.min(140, (cw / Math.max(1, digits)) * 1.45);
  const volumes = Math.round(d.chapters / 9);

  return (
    <Animated.View style={{ width: '100%', alignItems: 'center', transform: [{ translateX: tx }, { translateY: ty }] }}>
      <GhostNumeral text={String(d.chapters)} s={s} size={w * 0.62} style={{ top: -w * 0.16, left: -w * 0.1 }} />

      <Reveal delay={0}>
        <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.youDoveInto')}</Text></Band>
      </Reveal>

      <View style={{ marginTop: 14 }}>
        <Odometer value={d.chapters} onDone={onDone}
          style={[styles.mega, { color: s.ink, fontSize: megaSize, lineHeight: megaSize * 1.04 }]} />
      </View>

      <Reveal delay={260}>
        <Text style={[styles.h2, { color: s.accent, letterSpacing: 6, marginTop: -4 }]}>{t('recap.chaptersLabel')}</Text>
      </Reveal>

      {landed && (
        <Reveal delay={60} style={{ alignItems: 'center', marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ height: 1, width: 26, backgroundColor: s.faint }} />
            <Text style={[styles.sub, { color: s.dim, marginTop: 0 }]}>
              across {d.series} {d.series === 1 ? 'series' : 'series'}
            </Text>
            <View style={{ height: 1, width: 26, backgroundColor: s.faint }} />
          </View>
          {volumes >= 2 && (
            <Text style={[styles.subSmall, { color: s.dim }]}>
              roughly {volumes} volumes on the shelf
            </Text>
          )}
          {(d.deltas?.chapters != null || d.friendRank) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <DeltaPill value={d.deltas?.chapters} s={s} />
              {!!d.friendRank && (
                <View style={[styles.rankPill, { borderColor: rgba(s.ink, 0.3), backgroundColor: rgba(s.accent, 0.14) }]}>
                  <Ionicons name="podium" size={12} color={s.accent} />
                  <Text style={[styles.rankPillText, { color: s.accent }]}>#{d.friendRank} among your friends</Text>
                </View>
              )}
            </View>
          )}
        </Reveal>
      )}
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 4 — DAY AND NIGHT
// Split composition against the horizon stage: hours above the line, the real
// peak-reading window drawn as a swept arc on a 24-hour dial below it.
// ═════════════════════════════════════════════════════════════════════════
function S4Time({ d, s, id, h, cw }) {
  const t = useT();
  const hrs = useCountUp(Math.round(d.hours), 1600, 200);
  const p = useProgress(1200, 700);
  const night = d.peakWindow && (d.peakWindow.startHour >= 20 || d.peakWindow.startHour < 5);
  const dialSize = Math.min(180, cw * 0.55);
  const R = dialSize / 2 - 12;

  return (
    <View style={{ width: '100%', flex: 1, justifyContent: 'space-between' }}>
      {/* upper half — the total */}
      <View style={{ alignItems: 'flex-start', paddingTop: h * 0.06 }}>
        <Reveal delay={0}>
          <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.timeSpent')}</Text></Band>
        </Reveal>
        <Reveal delay={160}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
            <Animated.Text style={[styles.mega, { color: s.ink, fontSize: 96, lineHeight: 100, transform: [{ scale: hrs.punch }] }]}>
              {hrs.value}
            </Animated.Text>
            <Text style={[styles.h2, { color: s.accent, marginBottom: 16, marginLeft: 10 }]}>{t('recap.hrsLabel')}</Text>
          </View>
        </Reveal>
        {d.hours >= 24 && (
          <Reveal delay={520}>
            <Text style={[styles.sub, { color: s.dim }]}>
              {Math.round(d.hours / 24)} full {Math.round(d.hours / 24) === 1 ? 'day' : 'days'} of nothing but story.
            </Text>
          </Reveal>
        )}
        {(d.deltas?.hours != null || d.lateNightHours > 0.4) && (
          <Reveal delay={600} style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <DeltaPill value={d.deltas?.hours} s={s} />
            {d.lateNightHours > 0.4 && (
              <View style={[styles.rankPill, { borderColor: rgba(s.ink, 0.3), backgroundColor: rgba(s.accent, 0.14) }]}>
                <Ionicons name="moon" size={12} color={s.accent} />
                <Text style={[styles.rankPillText, { color: s.accent }]}>{d.lateNightHours.toFixed(1)}h after midnight</Text>
              </View>
            )}
          </Reveal>
        )}
        {d.hourPulseMax > 0.5 && (
          <Reveal delay={660} style={{ marginTop: 16 }}>
            <Text style={[styles.microLabel, { color: s.dim }]}>{t('recap.yourDayInChapters')}</Text>
            <PulseSparkline pulse={d.hourPulse} peak={d.hourPulseMax} s={s} width={cw} />
          </Reveal>
        )}
      </View>

      {/* lower half — the dial */}
      {d.peakWindow ? (
        <Reveal delay={700} from="down" style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ width: dialSize, height: dialSize }}>
            <Svg width={dialSize} height={dialSize}>
              <Circle cx={dialSize / 2} cy={dialSize / 2} r={R} stroke={s.faint} strokeWidth={11} fill="none" />
              {/* the reader's real window, swept onto a 24-hour face */}
              <Path
                d={arcPath(dialSize / 2, dialSize / 2, R, (d.peakWindow.startHour / 24) * 360, (d.peakWindow.startHour / 24) * 360 + 45 * p)}
                stroke={s.accent} strokeWidth={11} fill="none" strokeLinecap="round"
              />
              <G opacity={0.4}>
                {Array.from({ length: 12 }).map((_, i) => {
                  const [x0, y0] = polar(dialSize / 2, dialSize / 2, R - 11, i * 30);
                  const [x1, y1] = polar(dialSize / 2, dialSize / 2, R - 16, i * 30);
                  return <Path key={i} d={`M${x0} ${y0} L${x1} ${y1}`} stroke={s.ink} strokeWidth={1.5} />;
                })}
              </G>
            </Svg>
            <View style={{ position: 'absolute', width: dialSize, height: dialSize, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={night ? 'moon' : 'sunny'} size={26} color={s.accent} />
              <Text style={[styles.dialPct, { color: s.ink }]}>{d.peakWindow.pct}%</Text>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: s.dim }]}>{t('recap.peakWindow')}</Text>
            <PrintText s={s} id={id} offset={2} style={[styles.h2, { color: s.ink, marginTop: 4 }]}>
              {d.peakWindow.label}
            </PrintText>
            {!!d.weekday.bestName && (
              <Text style={[styles.subSmall, { color: s.dim, marginTop: 8 }]}>
                heaviest on {d.weekday.bestName}s
              </Text>
            )}
          </View>
        </Reveal>
      ) : (
        <Reveal delay={700} from="down">
          <Bubble s={s} id={id}>
            <Text style={[styles.bubbleText, { color: s.light ? id.paperInk : s.ink }]}>
              {d.weekday.bestName
                ? `${d.weekday.bestName}s carried this half.`
                : 'Keep reading and your hours will start telling their own story.'}
            </Text>
          </Bubble>
        </Reveal>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 5 — TOP SERIES  (the hero page)
// The #1 cover is a large tilted card in perspective with its rank set behind
// it; ranks two to five deal in from the right like a hand of cards.
// ═════════════════════════════════════════════════════════════════════════
function S5TopSeries({ d, s, id, cw }) {
  const t = useT();
  if (!d.topSeries.length) {
    return (
      <View style={{ width: '100%' }}>
        <Reveal delay={0}><Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.yourTopSeries')}</Text></Band></Reveal>
        <Reveal delay={200}><Text style={[styles.h1, { color: s.ink, marginTop: 18 }]}>Still writing{'\n'}this chapter</Text></Reveal>
        <Reveal delay={420}><Text style={[styles.sub, { color: s.dim }]}>{t('recap.noTopSeries')}</Text></Reveal>
      </View>
    );
  }
  const [lead, ...rest] = d.topSeries;
  const leadW = Math.min(196, cw * 0.58);

  return (
    <View style={{ width: '100%' }}>
      <Reveal delay={0}>
        <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.yourTopSeries')}</Text></Band>
      </Reveal>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 18 }}>
        <HeroCover uri={lead.cover} s={s} id={id} width={leadW} />
        <View style={{ flex: 1, paddingLeft: 16, paddingBottom: 6 }}>
          <Reveal delay={520} from="right">
            <Text style={[styles.rankBig, { color: s.accent }]}>01</Text>
            <PrintText s={s} id={id} offset={2} style={[styles.leadTitle, { color: s.ink }]}>
              {lead.title.length > 34 ? `${lead.title.slice(0, 33)}…` : lead.title}
            </PrintText>
            <Text style={[styles.leadMeta, { color: s.accent }]}>{lead.chapters} chapters</Text>
            {!!d.friendsReadingSame?.length && (
              <View style={[styles.friendTag, { borderColor: rgba(s.ink, 0.3) }]}>
                <Ionicons name="people" size={11} color={s.accent} />
                <Text style={[styles.friendTagText, { color: s.dim }]} numberOfLines={1}>
                  you & @{d.friendsReadingSame[0]}{d.friendsReadingSame.length > 1 ? ` +${d.friendsReadingSame.length - 1}` : ''} both read this
                </Text>
              </View>
            )}
          </Reveal>
        </View>
      </View>

      <View style={{ marginTop: 18, width: '100%' }}>
        {rest.slice(0, 4).map((x, i) => (
          <Reveal key={x.title + i} delay={780 + i * 130} from="right" dist={70}>
            <View style={[styles.rankRow, { borderBottomColor: s.faint }]}>
              <Text style={[styles.rankNum, { color: s.dim }]}>{String(i + 2).padStart(2, '0')}</Text>
              <View style={[styles.rankCover, { borderColor: s.faint, borderRadius: Math.min(6, id.mode.radius + 2) }]}>
                {!!x.cover && <Image source={{ uri: x.cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={240} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rankTitle, { color: s.ink }]} numberOfLines={1}>{x.title}</Text>
                <Text style={[styles.rankMeta, { color: s.dim }]}>{x.chapters} chapters</Text>
              </View>
              <View style={{ width: 40, height: 3, backgroundColor: s.accent, opacity: Math.max(0.25, x.chapters / (lead.chapters || 1)) }} />
            </View>
          </Reveal>
        ))}
      </View>

      {d.waiting > 0 && (
        <Reveal delay={1350}>
          <Text style={[styles.subSmall, { color: s.dim, marginTop: 4 }]}>
            {d.waiting} more {d.waiting === 1 ? 'series' : 'series'} waiting on your shelf.
          </Text>
        </Reveal>
      )}
    </View>
  );
}

// The #1 cover: enters rotated in perspective and settles, with a slow float
// so it never sits dead on the page.
function HeroCover({ uri, s, id, width }) {
  const enter = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: 180, useNativeDriver: true, damping: 15, stiffness: 120, mass: 1 }).start();
    const a = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [enter, float]);

  const rotY = enter.interpolate({ inputRange: [0, 1], outputRange: ['52deg', '-9deg'] });
  const tx = enter.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  const fy = float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ perspective: 900 }, { translateX: tx }, { translateY: fy }, { rotateY: rotY }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
        shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 8, height: 16 }, elevation: 14,
      }}
    >
      <View style={{
        width, height: width * 1.46,
        borderRadius: Math.min(12, id.mode.radius + 4),
        borderWidth: id.mode.border, borderColor: s.accent,
        overflow: 'hidden', backgroundColor: rgba(s.ink, 0.08),
      }}
      >
        {!!uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={320} />}
        <LinearGradient colors={['transparent', rgba('#000000', 0.45)]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' }} />
      </View>
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 6 — THE WHEEL
// A radial breakdown that actually draws itself, with the reader's own ramp
// as the segment colours and their top genre held in the middle.
// ═════════════════════════════════════════════════════════════════════════
function S6Genres({ d, s, id, cw }) {
  const t = useT();
  const rows = d.genres;
  const p = useProgress(1300, 260);

  if (!rows.length) {
    return (
      <View style={{ width: '100%', alignItems: 'center' }}>
        <Reveal delay={0}><Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.genresExploredLabel')}</Text></Band></Reveal>
        <Reveal delay={200}><Text style={[styles.h1, { color: s.ink, marginTop: 18 }]}>{t('recap.uncharted')}</Text></Reveal>
        <Reveal delay={420}><Text style={[styles.sub, { color: s.dim, textAlign: 'center' }]}>Your map is still blank — that is the fun part.</Text></Reveal>
      </View>
    );
  }

  const ICONS = {
    Action: 'flash', Adventure: 'compass', Comedy: 'happy', Drama: 'rainy', Fantasy: 'sparkles',
    Horror: 'skull', Mystery: 'search', Romance: 'heart', 'Sci-Fi': 'planet', 'Slice of Life': 'cafe',
    Sports: 'football', Supernatural: 'flame', Thriller: 'alert-circle', Psychological: 'eye',
    Mecha: 'hardware-chip', Music: 'musical-notes', 'Martial Arts': 'body', Ecchi: 'flame',
  };

  const size = Math.min(250, cw * 0.86);
  const R = size / 2 - 20;
  const total = rows.reduce((a, r) => a + r.pct, 0) || 1;
  let cursor = -90;
  const arcs = rows.map((r, i) => {
    const span = (r.pct / total) * 360;
    const seg = { from: cursor, span, color: id.ramp[i % id.ramp.length], row: r };
    cursor += span;
    return seg;
  });

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <Reveal delay={0}>
        <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.genresExploredLabel')}</Text></Band>
      </Reveal>

      <View style={{ width: size, height: size, marginTop: 20 }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={R} stroke={s.faint} strokeWidth={26} fill="none" />
          {arcs.map((a, i) => (
            <Path
              key={i}
              d={arcPath(size / 2, size / 2, R, a.from, a.from + a.span * p)}
              stroke={a.color}
              strokeWidth={26}
              fill="none"
              strokeLinecap="butt"
              opacity={0.94}
            />
          ))}
        </Svg>
        <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.wheelPct, { color: s.ink }]}>{rows[0].pct}%</Text>
          <Text style={[styles.wheelLabel, { color: s.accent }]} numberOfLines={1}>{rows[0].label.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.chipWrap}>
        {rows.map((r, i) => (
          <Reveal key={r.label} delay={500 + i * 100} from="down" dist={16}>
            <View style={[styles.chip, {
              borderColor: id.ramp[i % id.ramp.length],
              backgroundColor: rgba(id.ramp[i % id.ramp.length], s.light ? 0.14 : 0.2),
              borderRadius: id.mode.radius > 8 ? 999 : 3,
            }]}
            >
              <Ionicons name={ICONS[r.label] || 'ellipse'} size={13} color={id.ramp[i % id.ramp.length]} />
              <Text style={[styles.chipText, { color: s.ink }]}>{r.label}</Text>
              <Text style={[styles.chipPct, { color: id.ramp[i % id.ramp.length] }]}>{r.pct}%</Text>
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 7 — THE READER CARD
// The personality arrives as a collectible: the reader's own #1 cover as the
// card art, a foil sheen sweeping across it, their seal stamped in the corner.
// ═════════════════════════════════════════════════════════════════════════
function S7Personality({ d, s, id, h, cw }) {
  const t = useT();
  const p = d.personality;
  const enter = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: 140, useNativeDriver: true, damping: 14, stiffness: 110 }).start();
    const a = Animated.loop(Animated.sequence([
      Animated.timing(sheen, { toValue: 1, duration: 2200, delay: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [enter, sheen]);

  // The card is the whole slide, so it is bounded by height as well as width —
  // a short device must not push the seal or the footer off the page.
  const cardW = Math.min(300, cw, (h * 0.52) / 1.42);
  const cardH = cardW * 1.42;
  const rot = enter.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '-2.5deg'] });
  const sx = sheen.interpolate({ inputRange: [0, 1], outputRange: [-cardW, cardW * 1.4] });

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            { perspective: 900 },
            { rotate: rot },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
          ],
          shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 16,
        }}
      >
        <View style={{
          width: cardW, height: cardH,
          borderRadius: Math.min(18, id.mode.radius + 6),
          borderWidth: Math.max(3, id.mode.border), borderColor: s.accent,
          backgroundColor: s.light ? '#FFFFFF' : rgba('#000000', 0.62),
          overflow: 'hidden',
        }}
        >
          {/* card art — their most-read cover */}
          <View style={{ height: cardH * 0.52, overflow: 'hidden' }}>
            {!!d.topSeries[0]?.cover && (
              <Image source={{ uri: d.topSeries[0].cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={300} />
            )}
            <LinearGradient
              colors={[rgba(id.primary, 0.15), rgba(s.light ? '#FFFFFF' : '#000000', 0.92)]}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ position: 'absolute', left: 16, top: 14 }}>
              <Ionicons name={p.icon} size={44} color={s.accent} />
            </View>
            <View style={{ position: 'absolute', right: 12, top: 10 }}>
              <Stamp text={p.seal} color={s.accent} size={54} />
            </View>
          </View>

          {/* card body */}
          <View style={{ flex: 1, paddingHorizontal: 18, paddingBottom: 16, marginTop: -cardH * 0.06 }}>
            <Text style={[styles.cardKicker, { color: s.accent }]}>{t('recap.personality')}</Text>
            <PrintText s={s} id={id} offset={2} style={[styles.cardTitle, { color: s.ink }]}>{p.title}</PrintText>
            <Text style={[styles.cardDesc, { color: s.dim }]}>{p.desc}</Text>
            {!!d.ratingPersona && (
              <Text style={[styles.cardDesc, { color: s.accent, marginTop: 2 }]}>{d.ratingPersona.label}.</Text>
            )}

            <View style={{ flex: 1 }} />
            <View style={[styles.cardRule, { backgroundColor: s.faint }]} />
            <View style={styles.cardFooter}>
              <Text style={[styles.cardFooterText, { color: s.dim, flex: 1, marginRight: 8 }]} numberOfLines={1}>{d.dnaCode}</Text>
              <Text style={[styles.cardFooterText, { color: s.dim }]} numberOfLines={1}>@{d.username}</Text>
            </View>
          </View>

          {/* foil sheen */}
          <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: cardW * 0.4, transform: [{ translateX: sx }, { rotate: '18deg' }] }} pointerEvents="none">
            <LinearGradient
              colors={['transparent', rgba(s.ink, 0.26), 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </Animated.View>

      <Reveal delay={1100}>
        <Text style={[styles.sub, { color: s.dim, textAlign: 'center', marginTop: 18 }]}>
          Out of {d.personalityPool} reader types, this half made you this one.
        </Text>
      </Reveal>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 8 — THE SHELF
// Real earned badges — the same shields as the profile screen — flying in on
// arcs, highest tier first.
// ═════════════════════════════════════════════════════════════════════════
function S8Achievements({ d, s, id, cw }) {
  const t = useT();
  const n = useCountUp(d.badgesEarned, 1400, 150);
  const show = d.showcaseBadges;
  const anims = useRef(show.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!anims.length) return;
    Animated.stagger(120, anims.map((a) =>
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 11, stiffness: 145, mass: 0.9 })
    )).start();
  }, [anims]);

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <Reveal delay={0}>
        <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.achievements')}</Text></Band>
      </Reveal>

      {show.length > 0 && (
        <View style={styles.badgeShelf}>
          {show.map((b, i) => {
            const dir = i % 2 ? 1 : -1;
            return (
              <Animated.View
                key={b.id}
                style={{
                  opacity: anims[i],
                  transform: [
                    { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) },
                    { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [46 * dir, 0] }) },
                    { rotate: anims[i].interpolate({ inputRange: [0, 1], outputRange: [`${28 * dir}deg`, '0deg'] }) },
                    { scale: anims[i] },
                  ],
                }}
              >
                <View style={styles.badgeCell}>
                  <BadgeIcon badge={b} size={Math.min(66, cw * 0.21)} />
                  <Text style={[styles.badgeName, { color: s.dim }]} numberOfLines={1}>{b.name}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}

      <Reveal delay={620} style={{ alignItems: 'center', marginTop: show.length ? 8 : 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Animated.Text style={[styles.mega, { color: s.ink, fontSize: 82, lineHeight: 86, transform: [{ scale: n.punch }] }]}>
            {n.value}
          </Animated.Text>
          <Text style={[styles.h3, { color: s.dim, marginLeft: 8 }]}>/ {d.badgesTotal}</Text>
        </View>
        <Text style={[styles.h2, { color: s.accent, letterSpacing: 4, marginTop: -2 }]}>{t('recap.badgesLabel')}</Text>
      </Reveal>

      {!!d.tierLabel && (
        <Reveal delay={900}>
          <View style={[styles.tier, {
            borderColor: d.tierColor,
            backgroundColor: rgba(d.tierColor, 0.16),
            borderRadius: id.mode.radius > 8 ? 999 : 3,
          }]}
          >
            <Ionicons name="shield" size={15} color={d.tierColor} />
            <Text style={[styles.tierText, { color: d.tierColor }]}>{d.tierLabel} Tier</Text>
          </View>
        </Reveal>
      )}

      {!!d.topComment && (
        <Reveal delay={1100} style={{ marginTop: 18, width: '100%' }}>
          <Bubble s={s} id={id}>
            <Text style={[styles.microLabel, { color: s.accent, marginBottom: 4 }]}>{t('recap.loudestMoment')}</Text>
            <Text style={[styles.bubbleText, { color: s.light ? id.paperInk : s.ink }]} numberOfLines={3}>
              "{d.topComment.text}"
            </Text>
            <Text style={[styles.subSmall, { color: s.dim, marginTop: 6 }]}>{d.topComment.likes} likes</Text>
          </Bubble>
        </Reveal>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 9 — THE STREAK
// The real run of consecutive days, drawn as a calendar that grows a cell at
// a time, with the flame behind it scaled by how long the streak actually was.
// ═════════════════════════════════════════════════════════════════════════
function S9Streak({ d, s, id, cw }) {
  const t = useT();
  const n = useCountUp(d.longest, 1400, 120);
  const cols = 7;
  const shown = Math.min(49, Math.max(7, d.longest));
  const cells = useMemo(() => Array.from({ length: shown }, (_, i) => i < d.longest), [shown, d.longest]);
  const anims = useRef(cells.map(() => new Animated.Value(0))).current;
  const flame = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(Math.max(14, 420 / Math.max(1, cells.length)), anims.map((a) =>
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 220 })
    )).start();
    const a = Animated.loop(Animated.sequence([
      Animated.timing(flame, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(flame, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [anims, flame, cells.length]);

  const cell = Math.min(30, (cw - cols * 6) / cols);
  const flick = flame.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const range = d.streakRange;

  return (
    <View style={{ width: '100%' }}>
      <Reveal delay={0}>
        <Band s={s} id={id}><Text style={[styles.bandText, { color: s.onAccent }]}>{t('recap.longestStreak')}</Text></Band>
      </Reveal>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Animated.Text style={[styles.mega, { color: s.ink, fontSize: 104, lineHeight: 108, transform: [{ scale: n.punch }] }]}>
          {n.value}
        </Animated.Text>
        <View style={{ marginLeft: 12, marginBottom: 10 }}>
          <Text style={[styles.h2, { color: s.accent }]}>{t('recap.daysLabel')}</Text>
          <Animated.View style={{ transform: [{ scale: flick }], alignSelf: 'flex-start', marginTop: 4 }}>
            <Ionicons name={d.longest >= 30 ? 'bonfire' : 'flame'} size={26 + Math.min(16, d.longest / 2)} color={s.accent} />
          </Animated.View>
        </View>
      </View>

      {!!range && (
        <Reveal delay={280}>
          <Text style={[styles.subSmall, { color: s.dim }]}>{range}</Text>
        </Reveal>
      )}

      <View style={[styles.streakGrid, { width: cols * (cell + 6) }]}>
        {cells.map((on, i) => (
          <Animated.View
            key={i}
            style={{
              width: cell, height: cell, marginRight: 6, marginBottom: 6,
              borderRadius: id.mode.radius > 8 ? cell / 3 : 2,
              backgroundColor: on ? s.accent : s.faint,
              opacity: anims[i],
              transform: [{ scale: anims[i] }],
            }}
          />
        ))}
      </View>

      <Reveal delay={800}>
        <Text style={[styles.sub, { color: s.dim }]}>
          {d.longest >= 30 ? 'A month straight. That is not a habit, that is devotion.'
            : d.longest >= 7 ? 'Consistency is its own superpower.'
              : 'Every streak starts with day one.'}
        </Text>
      </Reveal>
      {d.deltas?.longest != null && (
        <Reveal delay={900} style={{ marginTop: 12 }}>
          <DeltaPill value={d.deltas.longest} s={s} />
        </Reveal>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 10 — THE POSTER
// Everything at once, composed as one framed card that is meant to be
// screenshotted and posted.
// ═════════════════════════════════════════════════════════════════════════
function S10Finale({ d, s, id, onShareImage, onCompare, exporting, onDone }) {
  const t = useT();
  const stats = [
    { v: d.chapters, l: 'CHAPTERS' },
    { v: d.series, l: 'SERIES' },
    { v: Math.round(d.hours), l: 'HOURS' },
    { v: d.longest, l: 'DAY STREAK' },
  ];
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: 320, useNativeDriver: true, damping: 16, stiffness: 120 }).start();
  }, [enter]);

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <Reveal delay={0} style={{ alignItems: 'center' }}>
        <Kinetic text="WHAT A HALF" delay={140} stagger={44}
          style={[styles.hero2, { color: s.ink }]} />
      </Reveal>

      <Animated.View
        style={{
          width: '100%', marginTop: 16, opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        }}
      >
        <View style={[styles.poster, {
          borderColor: s.accent,
          borderWidth: Math.max(2, id.mode.border - 1),
          borderRadius: Math.min(20, id.mode.radius + 4),
          backgroundColor: s.light ? rgba('#FFFFFF', 0.86) : rgba('#000000', 0.6),
        }]}
        >
          {id.mode.tone === 'screentone' && <TornEdge color={s.accent} height={9} />}

          <View style={styles.posterHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.posterName, { color: s.ink }]} numberOfLines={1}>@{d.username}</Text>
              <Text style={[styles.posterPerso, { color: s.accent }]}>{d.personality.title}</Text>
            </View>
            <Stamp text={d.personality.seal} color={s.accent} size={46} rotate={8} />
          </View>

          <View style={styles.posterGrid}>
            {stats.map((x) => (
              <View key={x.l} style={styles.posterCell}>
                <Text style={[styles.posterVal, { color: s.ink }]}>{x.v}</Text>
                <Text style={[styles.posterLbl, { color: s.dim }]}>{x.l}</Text>
              </View>
            ))}
          </View>

          {!!d.topSeries.length && (
            <>
              <Text style={[styles.posterSection, { color: s.dim }]}>{t('recap.topSeries')}</Text>
              <View style={styles.posterCovers}>
                {d.topSeries.slice(0, 5).map((x, i) => (
                  <View key={i} style={[styles.posterCover, {
                    borderColor: s.faint,
                    marginLeft: i ? -12 : 0,
                    zIndex: 5 - i,
                    borderRadius: Math.min(6, id.mode.radius + 2),
                    transform: [{ rotate: `${(i - 2) * 2.5}deg` }],
                  }]}
                  >
                    {!!x.cover && <Image source={{ uri: x.cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />}
                  </View>
                ))}
                <View style={{ flex: 1, paddingLeft: 12 }}>
                  <Text style={[styles.posterTop, { color: s.ink }]} numberOfLines={2}>{d.topSeries[0].title}</Text>
                </View>
              </View>
            </>
          )}

          <View style={[styles.posterFootRow, { borderTopColor: s.faint }]}>
            <Text style={[styles.posterFoot, { color: s.dim, flex: 1, marginRight: 8 }]} numberOfLines={1}>{d.dnaCode}</Text>
            <Text style={[styles.posterFoot, { color: s.accent }]} numberOfLines={1}>mangarecs.net</Text>
          </View>
        </View>
      </Animated.View>

      <Reveal delay={1100} style={styles.actions}>
        <TouchableOpacity
          style={[styles.btnMain, { backgroundColor: s.accent, borderRadius: id.mode.radius > 8 ? 999 : 4 }]}
          onPress={() => onShareImage('story')}
          activeOpacity={0.86}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel={exporting ? 'Preparing your recap image' : 'Share your recap'}
          accessibilityState={{ disabled: exporting, busy: exporting }}
        >
          {exporting
            ? <ActivityIndicator size="small" color={s.onAccent} />
            : <Ionicons name="share-social" size={17} color={s.onAccent} />}
          <Text style={[styles.btnMainText, { color: s.onAccent }]}>{exporting ? 'Preparing…' : 'Share your recap'}</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={HIT_SLOP}
          style={[styles.iconSquareBtn, { borderColor: rgba(s.ink, 0.38), borderRadius: id.mode.radius > 8 ? 999 : 4 }]}
          onPress={() => onShareImage('square')}
          activeOpacity={0.86}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Share as a square image"
          accessibilityState={{ disabled: exporting, busy: exporting }}
        >
          <Ionicons name="square-outline" size={15} color={s.ink} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnGhost, styles.btnGhostRow, { borderColor: rgba(s.ink, 0.38), borderRadius: id.mode.radius > 8 ? 999 : 4 }]}
          onPress={onCompare}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t('recap.compare')}
        >
          <Ionicons name="people-outline" size={15} color={s.ink} />
          <Text style={[styles.btnGhostText, { color: s.ink }]}>{t('recap.compare')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGhost, { borderColor: rgba(s.ink, 0.38), borderRadius: id.mode.radius > 8 ? 999 : 4 }]} onPress={onDone} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel={t('common.done')}>
          <Text style={[styles.btnGhostText, { color: s.ink }]}>{t('common.done')}</Text>
        </TouchableOpacity>
      </Reveal>
    </View>
  );
}

// ── slide manifest ───────────────────────────────────────────────────────
// Ten slides, always. `align` is what stops the recap reading as one template:
// each beat is composed differently rather than stacked bottom-left.
export const SLIDES = [
  { key: 'welcome',  Stage: StageWall,      Comp: S1Welcome,      align: 'center', foot: 'Every chapter is a new adventure' },
  { key: 'journey',  Stage: StageDrift,     Comp: S2Journey,      align: 'end',    foot: 'It all started somewhere' },
  { key: 'chapters', Stage: StageImpact,    Comp: S3Chapters,     align: 'center', foot: 'Page after page after page' },
  { key: 'time',     Stage: StageHorizon,   Comp: S4Time,         align: 'fill',   foot: 'Those late nights hit different' },
  { key: 'top',      Stage: StageRunway,    Comp: S5TopSeries,    align: 'end',    foot: 'These stories made the biggest impact' },
  { key: 'genres',   Stage: StageOrbit,     Comp: S6Genres,       align: 'center', foot: 'Every genre took you somewhere new' },
  { key: 'perso',    Stage: StagePanelGrid, Comp: S7Personality,  align: 'center', foot: 'This half was uniquely yours' },
  { key: 'badges',   Stage: StageCelebrate, Comp: S8Achievements, align: 'center', foot: 'Earned, never given' },
  { key: 'streak',   Stage: StageEmber,     Comp: S9Streak,       align: 'end',    foot: 'Consistency is power' },
  { key: 'finale',   Stage: StageFinale,    Comp: S10Finale,      align: 'center', foot: 'Never stop turning pages', isFinale: true },
];

// A reader's identity isn't known yet at this point — nothing to personalize
// against — but the wait itself can still feel like the app's world rather
// than a bare spinner: a slowly closing ink ring on newsprint.
function LoadingStage() {
  const t = useT();
  const spin = useRef(new Animated.Value(0)).current;
  const close = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(close, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(close, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, [spin, close]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = close.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.04] });
  return (
    <View style={[styles.root, styles.center]}>
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Svg width={64} height={64} viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="40" stroke="#B0362F" strokeWidth="6" fill="none" strokeDasharray="180 70" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Text style={styles.loadingText}>{t('recap.printing')}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SCREEN
// ═════════════════════════════════════════════════════════════════════════
export default function RecapScreen() {
  const t = useT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { profile, userId, loading: profileLoading } = useProfile();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportRatio, setExportRatio] = useState('story');

  // ── accessibility: reduce motion ────────────────────────────────────────
  // Shared with the rest of the app now (utils/a11y.js) rather than a copy
  // that only this screen honoured.
  const reduced = useReducedMotion();

  // ── tilt parallax ────────────────────────────────────────────────────────
  // A few degrees of device tilt nudges the background, on top of its own
  // drift — skipped entirely under reduce-motion, and any sensor failure
  // (denied permission, no hardware) just leaves the stage static.
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { tiltX.setValue(0); tiltY.setValue(0); return; }
    let sub;
    try {
      DeviceMotion.setUpdateInterval(60);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        Animated.timing(tiltX, { toValue: Math.max(-1, Math.min(1, rotation.gamma / 0.6)) * 10, duration: 220, useNativeDriver: true }).start();
        Animated.timing(tiltY, { toValue: Math.max(-1, Math.min(1, rotation.beta / 0.6)) * 8, duration: 220, useNativeDriver: true }).start();
      });
    } catch (_) {}
    return () => { try { sub?.remove(); } catch (_) {} };
  }, [reduced, tiltX, tiltY]);

  // ── image export (finale + per-slide share) ─────────────────────────────
  const posterShotRef = useRef(null);
  const slideShotRef = useRef(null);

  const shareUri = useCallback(async (uri, dialogTitle) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
      } else {
        // expo-sharing covers both platforms in practice; this only runs on
        // some exotic device with no share sheet at all, where a raw file
        // URI has nowhere good to go either way — best effort, not a promise.
        await Share.share({ url: uri });
      }
    } catch (_) {}
  }, []);

  const onShareImage = useCallback(async (ratio) => {
    if (!data || exporting) return;
    hapticSuccess();
    setExporting(true);
    setExportRatio(ratio);
    try {
      // One frame for the ratio change to land before the shot fires.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
      const uri = await posterShotRef.current?.capture?.();
      if (uri) await shareUri(uri, 'Share your MangaRecap');
      else throw new Error('capture failed');
    } catch (_) {
      // Native capture unavailable (e.g. no new build yet) — text still works.
      const lines = [
        `My MangaRecap — ${data.period.short}`,
        `${data.chapters} chapters · ${data.series} series · ${Math.round(data.hours)} hours`,
        `${data.longest}-day streak · ${data.personality.title}`,
        data.topSeries[0] ? `Top series: ${data.topSeries[0].title}` : null,
        'Get yours on MangaRecs — mangarecs.net',
      ].filter(Boolean);
      Share.share({ message: lines.join('\n') }).catch(() => {});
    } finally {
      setExporting(false);
    }
  }, [data, exporting, shareUri]);

  const onShareSlide = useCallback(async () => {
    if (exporting) return;
    hapticLight();
    try {
      const uri = await slideShotRef.current?.capture?.();
      if (uri) await shareUri(uri, 'Share this moment');
    } catch (_) {}
  }, [exporting, shareUri]);

  // ── data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (profileLoading) return;
    if (!userId) { setStatus('signedout'); return; }
    let dead = false;
    setStatus('loading');

    (async () => {
      try {
        const period = TESTING_ALL_TIME ? getAllTimePeriod(profile) : getPeriod();
        const sIso = period.start.toISOString(), eIso = period.end.toISOString();

        const [progRes, cmtRes, ratRes, dailyLog, hourLog] = await Promise.all([
          supabase.from('reading_progress').select('series_title,status,current_chapter,updated_at').eq('user_id', userId).gte('updated_at', sIso).lte('updated_at', eIso).order('series_title', { ascending: true }),
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sIso).lte('created_at', eIso),
          supabase.from('series_ratings').select('series_title,stars').eq('user_id', userId).gte('created_at', sIso).lte('created_at', eIso),
          getMergedDailyLog(profile?.daily_log),
          getMergedHourLog(profile?.hour_log),
        ]);
        if (dead) return;

        const rows = progRes.data || [];
        const myRatings = ratRes.data || [];
        const inRange = keysInRange(dailyLog, period.start, period.end);
        const hours = inRange.reduce((a, k) => a + (dailyLog[k] || 0), 0);
        const badgeStats = profileToBadgeStats(profile);
        const earned = computeEarnedBadgeIds(badgeStats);
        const grade = highestGradeEarned(earned);

        // Tie-broken alphabetically, not left to whatever order Postgres
        // happens to return equal-chapter rows in (PostgREST makes no such
        // guarantee, and reading_progress rows get UPDATEd constantly, which
        // can reshuffle physical row order between requests). Without this,
        // a reader with two series tied for #1 chapters could get a
        // different lead series — and therefore a different palette/mode —
        // every single time they opened the same recap.
        const ranked = [...rows]
          .sort((a, b) => (b.current_chapter || 0) - (a.current_chapter || 0) || a.series_title.localeCompare(b.series_title))
          .slice(0, 12);
        const ratingTitles = [...new Set(myRatings.map((r) => r.series_title))];

        // Everything below is independent of everything else in this batch —
        // AniList art, cross-period history, friend totals, the loudest
        // comment, and the community's own ratings on the same titles all
        // resolve in parallel rather than as a waterfall.
        const [art, prevSnap, oldestSnap, friendsRecap, topCommentRes, communityRes] = await Promise.all([
          withTimeout(fetchArtBatch(ranked.map((r) => r.series_title)), 7000, {}),
          fetchPreviousSnapshot(userId, period),
          fetchOldestSnapshot(userId),
          fetchFriendsRecap(period),
          supabase.from('comments').select('text,likes').eq('user_id', userId).gte('created_at', sIso).lte('created_at', eIso).order('likes', { ascending: false }).limit(1),
          ratingTitles.length
            ? supabase.from('series_ratings').select('series_title,stars').in('series_title', ratingTitles)
            : Promise.resolve({ data: [] }),
        ]);
        if (dead) return;

        const topSeries = ranked.map((r) => {
          const m = art[r.series_title];
          return {
            title: r.series_title,
            chapters: r.current_chapter || 0,
            cover: m?.coverImage?.extraLarge || m?.coverImage?.large || null,
            color: m?.coverImage?.color || null,
            country: m?.countryOfOrigin || null,
            genres: m?.genres || [],
          };
        });

        // Backfill anything AniList could not resolve through the app's own
        // five-source cover pipeline, so the collages never run thin.
        const missing = topSeries.filter((x) => !x.cover).slice(0, 5);
        if (missing.length) {
          await Promise.all(missing.map(async (x) => {
            const info = await withTimeout(fetchMangaInfo(x.title).catch(() => null), 5000, null);
            if (info?.coverUrl) x.cover = info.coverUrl;
          }));
        }
        if (dead) return;

        let covers = topSeries.map((x) => x.cover).filter(Boolean);
        let seeds = topSeries
          .filter((x) => x.color || x.country)
          .map((x) => ({ color: x.color, weight: Math.max(1, x.chapters), country: x.country }));

        // Only when a reader has literally no resolvable art of their own.
        if (!covers.length) {
          const trend = await withTimeout(fetchTrendingArt(), 6000, []);
          covers = trend.map((t) => t.cover);
          if (!seeds.length) seeds = trend.map((t) => ({ color: t.color, weight: 1, country: t.country }));
        }
        if (dead) return;

        const genres = genreBreakdown(topSeries);
        const identity = buildIdentity(seeds, {
          genre: genres[0]?.label || profile?.favorite_genre || null,
          genres: genres.map((g) => g.label),
        });

        const sortedKeys = inRange.slice().sort();
        const firstDay = sortedKeys.length ? new Date(`${sortedKeys[0]}T00:00:00`) : null;
        const chapters = rows.reduce((a, r) => a + (r.current_chapter || 0), 0);
        const peak = peakReadingWindow(hourLog);
        const weekday = weekdayBreakdown(dailyLog, period.start, period.end);
        const streak = longestStreak(dailyLog, period.start, period.end);

        // Highest-tier earned badges first — the shelf should lead with the
        // hardest things the reader actually did.
        const showcase = ALL_BADGES
          .filter((b) => earned.has(b.id))
          .sort((a, b) => GRADE_ORDER.indexOf(b.grade) - GRADE_ORDER.indexOf(a.grade))
          .slice(0, 6);

        const fmtDay = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // "Bookmarked" is this app's real plan-to-read status — the honest
        // read of "series waiting on your shelf", not an invented dropped/
        // paused state the schema doesn't have.
        const waiting = rows.filter((r) => r.status === 'bookmarked').length;

        const hourPulse = Array.from({ length: 24 }, (_, h) => hourLog?.[String(h)] || 0);
        const hourPulseMax = Math.max(0.5, ...hourPulse);
        const lateNightHours = [23, 0, 1, 2].reduce((a, h) => a + (hourLog?.[String(h)] || 0), 0);

        const topComment = (topCommentRes?.data?.[0] && topCommentRes.data[0].likes > 0) ? topCommentRes.data[0] : null;
        const ratingPersona = ratingPersonality(myRatings, communityRes?.data || []);

        // Friends: rank among mutual friends by chapters this period, and who
        // else independently landed on the same #1 series. Both silently
        // absent when the friend RPCs (supabase_migrations.sql §57) aren't
        // applied yet or the reader has no accepted friends.
        let friendRank = null, friendsReadingSame = [];
        if (friendsRecap.length) {
          const standings = [...friendsRecap.map((f) => f.chapters || 0), chapters].sort((a, b) => b - a);
          friendRank = standings.indexOf(chapters) + 1;
          if (topSeries[0]) {
            const leadNorm = topSeries[0].title.trim().toLowerCase();
            friendsReadingSame = friendsRecap
              .filter((f) => (f.top_series || '').trim().toLowerCase() === leadNorm)
              .map((f) => f.username)
              .filter(Boolean);
          }
        }

        const deltas = prevSnap ? {
          chapters: chapters - (prevSnap.chapters || 0),
          hours: Math.round(hours - (prevSnap.hours || 0)),
          longest: streak.best - (prevSnap.longest || 0),
        } : null;

        const dnaCode = readingDnaCode(identity, genres);

        const base = {
          username: profile?.username || 'reader',
          period,
          identity,
          covers,
          topSeries,
          genres,
          dailyLog,
          chapters,
          series: rows.length,
          completed: rows.filter((r) => r.status === 'completed').length,
          hours,
          readingDays: inRange.length,
          longest: streak.best,
          streakRange: streak.start && streak.end ? `${fmtDay(streak.start)} → ${fmtDay(streak.end)}` : null,
          weekday,
          peakWindow: peak,
          firstDayLabel: firstDay ? firstDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null,
          badgesEarned: earned.size,
          badgesTotal: ALL_BADGES.length,
          showcaseBadges: showcase,
          tierLabel: grade ? BADGE_GRADES[grade].label : null,
          tierColor: grade ? BADGE_GRADES[grade].color : identity.accent,
          comments: cmtRes.count || 0,
          ratings: myRatings.length,
          personalityPool: 13,
          waiting,
          hourPulse,
          hourPulseMax,
          lateNightHours,
          topComment,
          ratingPersona,
          friendRank,
          friendsReadingSame,
          firstEverTopSeries: oldestSnap?.topSeriesTitle || null,
          deltas,
          dnaCode,
        };
        base.chaptersPerHour = base.hours > 0 ? base.chapters / base.hours : 0;
        base.personality = personality({
          peakWindow: peak, completed: base.completed, longest: base.longest,
          chaptersPerHour: base.chaptersPerHour, genres: genres.length,
          series: base.series, chapters: base.chapters, hours: base.hours,
          comments: base.comments, ratings: base.ratings,
          weekendShare: weekday.weekendShare,
        });

        setData(base);
        setStatus('ready');

        // Fire-and-forget — never blocks the render, and silently a no-op
        // until recap_snapshots (supabase_migrations.sql §57) is applied.
        // Just the numbers the in-app deltas/vault-diff features actually
        // read back (fetchPreviousSnapshot/fetchOldestSnapshot in
        // utils/recapHistory.js) — there is no web page to feed anymore.
        // Skipped entirely under TESTING_ALL_TIME: an "All Time" period_start
        // would sit in the same snapshot history as real half-year recaps and
        // could get picked up as the "oldest snapshot" once testing is over.
        if (!TESTING_ALL_TIME) saveSnapshot(userId, period, {
          chapters: base.chapters,
          series: base.series,
          hours: base.hours,
          longest: base.longest,
          badgesEarned: base.badgesEarned,
          personalityTitle: base.personality.title,
          topSeriesTitle: base.topSeries[0]?.title || null,
          topSeriesCover: base.topSeries[0]?.cover || null,
          topSeriesColor: base.topSeries[0]?.color || null,
          dnaCode: base.dnaCode,
        });
      } catch (e) {
        if (!dead) setStatus('error');
      }
    })();

    return () => { dead = true; };
  }, [profileLoading, userId, profile]);

  // ── soundtrack ─────────────────────────────────────────────────────────
  // A dedicated player, never the shared ambience singleton — hijacking that
  // would overwrite the soundscape the user picked for reading. If their
  // ambience is already running we stay silent and let it carry the recap.
  const audio = useRef(null);
  const fadeTimer = useRef(null);
  useEffect(() => {
    if (!data) return;
    let dead = false;

    (async () => {
      if (ambienceState().presetId) return;

      // Which track is entirely the reader's genre lane's business — see
      // moodFor() in utils/recapMusic.js for why peak hour no longer overrides it.
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
        if (dead) return;
        const p = createAudioPlayer(trackFor(data));
        // Still looped: the tracks outrun the ~69s of slides, but a reader who
        // holds to pause on a slide can outlast anything.
        p.loop = true;
        p.volume = MUSIC_VOLUME;
        p.play();
        audio.current = p;
        fadeTimer.current = fadeIn(p);
      } catch (_) {}
    })();

    return () => {
      dead = true;
      if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; }
      if (audio.current) {
        // Faded rather than cut: leaving the recap mid-track otherwise chops
        // the music dead on the same frame the screen animates away.
        // fadeOutAndStop owns pause/remove once it reaches silence.
        fadeOutAndStop(audio.current);
        audio.current = null;
      }
    };
  }, [data]);

  // ── story engine ───────────────────────────────────────────────────────
  const bars = useMemo(() => SLIDES.map(() => new Animated.Value(0)), []);
  const running = useRef(null);
  const progressAt = useRef(0);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    const ids = bars.map((v, i) => v.addListener(({ value }) => { if (i === idxRef.current) progressAt.current = value; }));
    return () => bars.forEach((v, i) => v.removeListener(ids[i]));
  }, [bars]);

  // Cut transition — a hard wipe plus a flash of the incoming slide's accent,
  // so slides change like a page turn instead of cross-fading.
  const wipe = useRef(new Animated.Value(1)).current;
  const runWipe = useCallback(() => {
    wipe.setValue(0);
    Animated.timing(wipe, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [wipe]);

  const go = useCallback((next) => {
    if (next < 0 || next >= SLIDES.length) return;
    if (running.current) running.current.stop();
    bars.forEach((v, i) => v.setValue(i < next ? 1 : 0));
    // The bar listener only writes progressAt for the *current* index, and
    // idxRef does not catch up until the effect after this render — so without
    // this reset a press-and-hold in the first frames of a new slide would
    // resume against the previous slide's finished progress and cut it to 60ms.
    progressAt.current = 0;
    setIdx(next);
    setPaused(false);
    runWipe();
    if (SLIDES[next].isFinale) return;
    const a = Animated.timing(bars[next], { toValue: 1, duration: SLIDE_DURATIONS[next], easing: Easing.linear, useNativeDriver: false });
    running.current = a;
    a.start(({ finished }) => { if (finished) go(next + 1); });
  }, [bars, runWipe]);

  const advance = useCallback((dir) => {
    const t = idxRef.current + dir;
    if (t < 0 || t >= SLIDES.length) return;
    selection();
    go(t);
  }, [go]);

  useEffect(() => { if (status === 'ready') go(0); }, [status, go]);

  const holdTimer = useRef(null);
  const didHold = useRef(false);

  const pause = useCallback(() => {
    if (SLIDES[idxRef.current].isFinale) return;
    if (running.current) running.current.stop();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (SLIDES[idxRef.current].isFinale) return;
    const i = idxRef.current;
    const remain = Math.max(60, SLIDE_DURATIONS[i] * (1 - progressAt.current));
    const a = Animated.timing(bars[i], { toValue: 1, duration: remain, easing: Easing.linear, useNativeDriver: false });
    running.current = a;
    a.start(({ finished }) => { if (finished) go(i + 1); });
    setPaused(false);
  }, [bars, go]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 || Math.abs(g.dx) > 12,
    onPanResponderGrant: () => {
      didHold.current = false;
      holdTimer.current = setTimeout(() => { didHold.current = true; hapticLight(); pause(); }, 220);
    },
    onPanResponderRelease: (e, g) => {
      clearTimeout(holdTimer.current);
      if (didHold.current) { resume(); return; }
      if (g.dy < -60) { advance(1); return; }
      if (g.dy > 60) { advance(-1); return; }
      // Screen coordinates, never locationX: locationX is measured against the
      // view the finger actually landed on, not the root that owns this
      // responder. Tapping the slide-3 odometer — a 140pt numeral sitting dead
      // centre — reported an x of a few points inside that digit, which read as
      // a left-edge tap and sent the story backwards, so the recap could never
      // get past it. x0 is the grant point in screen space; pageX backs it up.
      const x = g.x0 != null ? g.x0 : e.nativeEvent.pageX;
      advance(x < W * 0.3 ? -1 : 1);
    },
    onPanResponderTerminate: () => { clearTimeout(holdTimer.current); if (didHold.current) resume(); },
  }), [advance, pause, resume, W]);

  const close = useCallback(() => {
    if (running.current) running.current.stop();
    navigation.goBack();
  }, [navigation]);

  // ── states ─────────────────────────────────────────────────────────────
  if (profileLoading || status === 'loading') {
    return <LoadingStage />;
  }
  if (status === 'signedout' || status === 'error' || !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.fallbackText}>
          {status === 'signedout' ? 'Sign in to see your MangaRecap.' : "Couldn't build your MangaRecap. Try again in a moment."}
        </Text>
        <TouchableOpacity style={[styles.btnGhost, { borderColor: 'rgba(255,255,255,0.34)' }]} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Text style={[styles.btnGhostText, { color: '#fff' }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const slide = SLIDES[idx];
  const id = data.identity;
  const s = surfaceFor(id, idx);
  const Stage = slide.Stage;
  const Comp = slide.Comp;
  const night = data.peakWindow && (data.peakWindow.startHour >= 20 || data.peakWindow.startHour < 5);
  const streakIntensity = Math.min(1, data.longest / 30);

  const align = slide.align === 'center' ? 'center' : slide.align === 'fill' ? 'stretch' : 'flex-end';
  const contentJustify = slide.align === 'center' ? 'center' : slide.align === 'fill' ? 'flex-start' : 'flex-end';
  // Centred slides need symmetric gutters or they read as shifted left.
  const basePadL = slide.align === 'center' ? 46 : 26;
  const basePadR = slide.align === 'center' ? 46 : 50;
  // On an iPad the stage art still runs edge to edge — it is a full-bleed
  // poster — but the type column is capped and centred, the same cap the rest
  // of the app uses. Without this every slide caps its own hero element at a
  // phone size and then strands it against the left edge of a 1024pt frame.
  const sidePad = Math.max(0, (W - basePadL - basePadR - TABLET_CONTENT_MAX_WIDTH) / 2);
  const padL = basePadL + sidePad;
  const padR = basePadR + sidePad;
  const contentW = W - padL - padR;

  const slideIn = wipe.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const slideScale = wipe.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1] });

  return (
    // The pan handlers live on the ROOT, not on an absolute sibling layer:
    // responder negotiation bubbles from the touched view upward, so a sibling
    // underneath the content would never be offered taps that land on a slide's
    // own type. Chrome buttons still win because they sit deeper in the tree.
    <View style={[styles.root, { backgroundColor: s.to }]} {...pan.panHandlers}>
      {/* per-slide export target — captures stage + content, excludes chrome */}
      <ViewShot ref={slideShotRef} options={{ format: 'png', quality: 1 }} style={StyleSheet.absoluteFill}>
        {/* colour field → living cover stage → the reader's texture stack */}
        <LinearGradient colors={[s.from, s.to]} style={StyleSheet.absoluteFill} />

        <Animated.View
          key={`bg-${slide.key}`}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: tiltX }, { translateY: tiltY }, { scale: slideScale }] }]}
        >
          <Stage
            covers={data.covers}
            s={s}
            id={id}
            w={W}
            h={H}
            night={night}
            intensity={streakIntensity}
            reduced={reduced}
          />
        </Animated.View>

        <TextureStack id={id} s={s} w={W} h={H} seed={idx + 1} focal={{ x: 50, y: slide.align === 'center' ? 46 : 62 }} />

        {/* content */}
        <Animated.View
          key={`c-${slide.key}`}
          style={[
            styles.content,
            {
              justifyContent: contentJustify,
              alignItems: align,
              paddingTop: insets.top + 76,
              paddingBottom: insets.bottom + 58,
              paddingLeft: padL,
              paddingRight: padR,
              opacity: wipe,
              transform: [{ translateY: slideIn }],
            },
          ]}
          pointerEvents="box-none"
        >
          <Comp
            d={data} s={s} id={id} w={W} h={H} cw={contentW}
            onShareImage={onShareImage} onCompare={() => setCompareOpen(true)} exporting={exporting}
            onDone={close}
          />
        </Animated.View>
      </ViewShot>

      {/* chrome */}
      <View style={[styles.chrome, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {SLIDES.map((x, i) => (
            <View key={x.key} style={[styles.barTrack, { backgroundColor: rgba(s.ink, 0.26) }]}>
              <Animated.View
                style={[styles.barFill, {
                  backgroundColor: s.ink,
                  width: bars[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]}
              />
            </View>
          ))}
        </View>
        <View style={styles.topRow}>
          <Text style={[styles.brand, { color: s.ink }]}>MangaRecap</Text>
          <View style={styles.topBtns}>
            {!slide.isFinale && <ChromeBtn s={s} icon="share-outline" onPress={onShareSlide} label={t('recap.shareSlide')} />}
            <ChromeBtn s={s} icon="close" size={18} onPress={close} label={t('common.close')} />
          </View>
        </View>
      </View>

      <View style={[styles.footWrap, { bottom: insets.bottom + 18 }]} pointerEvents="none">
        <Reveal delay={800}>
          <Text style={[styles.foot, { color: s.dim }]}>{slide.foot}</Text>
        </Reveal>
      </View>

      {/* the cut — a mode-aware transition, fired on every slide change */}
      <TransitionCut id={id} s={s} wipe={wipe} w={W} h={H} />

      <RecapCompareModal
        visible={compareOpen}
        onClose={() => setCompareOpen(false)}
        d={data}
        id={id}
        s={s}
        period={data.period}
      />

      {/* off-screen export target — a static twin of the finale, captured for
          the real image share. Laid out three screens to the right so native
          view-shot has real, painted pixels to grab without ever being seen. */}
      <View style={{ position: 'absolute', left: W * 3, top: 0 }} pointerEvents="none">
        {/*
          `capture()` rasterizes at native pixel density, not dp — laying
          this out at literal 1080x1920 dp would be a view several phone-
          widths wide. Instead the view is sized at a normal on-screen dp
          (matching device width), and `options.width/height` on ViewShot
          asks the native side to resize the OUTPUT to real Stories/feed
          pixel dimensions, per the library's own guidance for this exact
          dp-vs-pixel mismatch.
        */}
        <ViewShot
          ref={posterShotRef}
          options={{ format: 'png', quality: 1, width: 1080, height: exportRatio === 'square' ? 1080 : 1920 }}
        >
          <RecapExportCard
            d={data}
            id={id}
            s={surfaceFor(id, 9)}
            width={W}
            height={exportRatio === 'square' ? W : W * (16 / 9)}
          />
        </ViewShot>
      </View>
    </View>
  );
}

function ChromeBtn({ s, icon, onPress, size = 15, label }) {
  return (
    <TouchableOpacity
      style={[styles.iconBtn, { backgroundColor: rgba(s.ink, 0.16) }]}
      onPress={onPress}
      hitSlop={10}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={size} color={s.ink} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08050C' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 34 },
  fallbackText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  microLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.4 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  deltaText: { fontSize: 11.5, fontWeight: '900' },
  rankPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  rankPillText: { fontSize: 11.5, fontWeight: '900' },
  friendTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  friendTagText: { fontSize: 10.5, fontWeight: '800', maxWidth: 180 },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 30 },
  bars: { flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 2.5, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  brand: { fontFamily: DISPLAY, fontSize: 15, letterSpacing: 0.4 },
  topBtns: { flexDirection: 'row', gap: 5, flexShrink: 1 },
  iconBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  content: { flex: 1, zIndex: 20 },

  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 2 },
  bandText: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  hero: { fontFamily: DISPLAY, letterSpacing: -1.5, textAlign: 'center' },
  hero2: { fontFamily: DISPLAY, fontSize: 42, lineHeight: 46, letterSpacing: -0.5, textAlign: 'center' },
  h1: { fontFamily: DISPLAY, fontSize: 38, lineHeight: 42 },
  h2: { fontFamily: DISPLAY, fontSize: 25, letterSpacing: 0.5 },
  h3: { fontFamily: DISPLAY, fontSize: 20, letterSpacing: 0.3 },
  mega: { fontFamily: DISPLAY, letterSpacing: -4 },
  lede: { fontFamily: DISPLAY, fontSize: 17, letterSpacing: 1.6 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 10, fontWeight: '600' },
  subSmall: { fontSize: 12.5, lineHeight: 18, marginTop: 6, fontWeight: '700', letterSpacing: 0.2 },
  swipe: { fontSize: 10, fontWeight: '900', letterSpacing: 2.5, marginTop: 2 },

  bubbleText: { fontSize: 15, fontWeight: '700', lineHeight: 21 },

  // slide 2 — month strip
  monthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  monthBlock: { width: 86 },
  monthLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 84 },
  dayCell: { width: 10, height: 10, margin: 1 },

  // slide 4 — dial
  dialPct: { fontFamily: DISPLAY, fontSize: 26, marginTop: 2 },

  // slide 5 — top series
  rankBig: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: -1, marginBottom: 2 },
  leadTitle: { fontFamily: DISPLAY, fontSize: 22, lineHeight: 25 },
  leadMeta: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  rankNum: { fontFamily: DISPLAY, fontSize: 17, width: 24 },
  rankCover: { width: 34, height: 50, borderWidth: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)' },
  rankTitle: { fontSize: 14, fontWeight: '800' },
  rankMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // slide 6 — wheel
  wheelPct: { fontFamily: DISPLAY, fontSize: 44, letterSpacing: -1.5 },
  wheelLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginTop: -2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '800' },
  chipPct: { fontSize: 11.5, fontWeight: '900' },

  // slide 7 — reader card
  cardKicker: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.8 },
  cardTitle: { fontFamily: DISPLAY, fontSize: 30, lineHeight: 34, marginTop: 4 },
  cardDesc: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 8 },
  cardRule: { height: 1, marginBottom: 9 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardFooterText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  // slide 8 — badge shelf
  badgeShelf: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 22 },
  badgeCell: { width: 78, alignItems: 'center', gap: 5 },
  badgeName: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1.5 },
  tierText: { fontFamily: DISPLAY, fontSize: 15 },

  // slide 9 — streak
  streakGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 },

  // slide 10 — poster
  poster: { padding: 18, width: '100%', overflow: 'hidden' },
  posterHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posterName: { fontFamily: DISPLAY, fontSize: 22 },
  posterPerso: { fontSize: 12.5, fontWeight: '900', letterSpacing: 0.5, marginTop: 1 },
  posterGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  posterCell: { width: '50%', marginBottom: 12 },
  posterVal: { fontFamily: DISPLAY, fontSize: 30, letterSpacing: -1 },
  posterLbl: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.2, marginTop: -1 },
  posterSection: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginTop: 2, marginBottom: 8 },
  posterCovers: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  posterCover: { width: 40, height: 58, borderWidth: 1.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  posterTop: { fontSize: 12.5, fontWeight: '800', lineHeight: 16 },
  posterFootRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10 },
  posterFoot: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  btnMain: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13 },
  btnMainText: { fontWeight: '900', fontSize: 14.5 },
  btnGhost: { paddingHorizontal: 20, paddingVertical: 13, borderWidth: 1.5 },
  btnGhostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnGhostText: { fontWeight: '900', fontSize: 14.5 },
  iconSquareBtn: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },

  footWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  foot: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
});
