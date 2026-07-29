// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — MangaRecs' flagship half-yearly reading story.
//
// Ten slides, each with its own living background built from the reader's
// REAL cover art (see components/RecapVisuals.js) and its own surface colour
// derived from the real dominant colours of what they actually read (see
// utils/recapTheme.js). There is no default theme anywhere in this file — a
// One Piece reader and a Solo Leveling reader get structurally different
// palettes because the palette is computed from their shelves.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, Share, Dimensions,
  Easing, ActivityIndicator, PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useProfile } from '../utils/ProfileContext';
import { fetchMangaInfo } from '../utils/mangaCovers';
import { getMergedDailyLog, getMergedHourLog, peakReadingWindow, localDateKey } from '../utils/readerUtils';
import { BADGE_GRADES, ALL_BADGES, profileToBadgeStats, computeEarnedBadgeIds, highestGradeEarned } from '../utils/badges';
import { buildIdentity, slideSurface, rgba } from '../utils/recapTheme';
import {
  Halftone, SpeedLines, InkSplatter, Grain,
  BgCollage, BgFloatingCards, BgBurst, BgLightSweep, BgCarousel,
  BgRadial, BgPanels, BgEmbers, BgConfetti, BgMosaic,
} from '../components/RecapVisuals';
import { selection, light as hapticLight, success as hapticSuccess } from '../utils/haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const AUTO_MS = 7000;
const DISPLAY = 'MangaRecsBrand';

// ── period + stat maths (shared shape with the website recap) ────────────

function getPeriod(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (m >= 6) return { label: `First Half ${y}`, short: `Jan – Jun ${y}`, start: new Date(y, 0, 1), end: new Date(y, 6, 0, 23, 59, 59) };
  return { label: `Second Half ${y - 1}`, short: `Jul – Dec ${y - 1}`, start: new Date(y - 1, 6, 1), end: new Date(y, 0, 0, 23, 59, 59) };
}
function keysInRange(log, start, end) {
  return Object.keys(log || {}).filter((k) => { const d = new Date(`${k}T00:00:00`); return d >= start && d <= end; });
}
function longestStreak(log, start, end) {
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let best = 0, run = 0;
  while (cur <= endDay) {
    run = (log[localDateKey(cur)] || 0) > 0 ? run + 1 : 0;
    if (run > best) best = run;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return best;
}
function weekdayBreakdown(log, start, end) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) { totals[cur.getDay()] += log[localDateKey(cur)] || 0; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1); }
  let best = 0;
  for (let i = 1; i < 7; i++) if (totals[i] > totals[best]) best = i;
  return { totals, labels: WD, best: totals[best] > 0 ? best : -1, bestName: totals[best] > 0 ? FULL[best] : null };
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
  const sorted = Object.entries(w).sort((a, b) => b[1] - a[1]);
  const rows = sorted.slice(0, 5).map(([label, v]) => ({ label, pct: Math.round((v / total) * 100) }));
  return rows.filter((r) => r.pct > 0);
}

// Reading personality, from real signals only. Ordered by how distinctive the
// signal is, so the rarest true statement about a reader wins.
function personality(d) {
  const c = [];
  if (d.peakWindow && (d.peakWindow.startHour >= 21 || d.peakWindow.startHour < 4)) {
    c.push({ w: 100, key: 'night', icon: 'moon', title: 'The Night Owl', desc: 'The best chapters happen after midnight.' });
  }
  if (d.completed >= 3) c.push({ w: 90 + d.completed, icon: 'checkmark-done', title: 'The Completionist', desc: 'You do not leave a story unfinished.' });
  if (d.longest >= 21) c.push({ w: 85 + d.longest, icon: 'flame', title: 'The Devoted', desc: 'A streak that simply refuses to break.' });
  if (d.chaptersPerHour >= 12) c.push({ w: 80, icon: 'flash', title: 'The Speed Reader', desc: 'You move through pages like they owe you money.' });
  if (d.genres >= 5) c.push({ w: 70 + d.genres, icon: 'compass', title: 'The Explorer', desc: 'No single genre could ever hold you.' });
  if (d.series >= 8) c.push({ w: 60 + d.series, icon: 'library', title: 'The Collector', desc: 'Always three stories deep, at minimum.' });
  if (d.series > 0 && d.series <= 3 && d.chapters >= 40) c.push({ w: 55, icon: 'heart', title: 'The Loyalist', desc: 'A few worlds, known completely.' });
  if (d.hours >= 60) c.push({ w: 50, icon: 'hourglass', title: 'The Immersed', desc: 'Time genuinely disappears when you read.' });
  c.push({ w: 1, icon: 'sparkles', title: 'The Rising Reader', desc: 'The story is only getting started.' });
  c.sort((a, b) => b.w - a.w);
  return c[0];
}

// ── AniList art (batched) ────────────────────────────────────────────────
// One aliased query for up to 10 titles instead of 10 round trips — the
// collages need a lot of covers and 10 sequential requests would blow past
// any sane timeout.
async function fetchArtBatch(titles) {
  const capped = (titles || []).slice(0, 10);
  if (!capped.length) return {};
  const params = capped.map((_, i) => `$s${i}: String`).join(', ');
  const fields = capped.map((_, i) =>
    `m${i}: Media(search: $s${i}, type: MANGA, isAdult: false) { coverImage { extraLarge large color } bannerImage genres }`
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
// Trending art, used only when a reader has no resolvable covers at all.
async function fetchTrendingArt() {
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query { Page(page:1, perPage:12){ media(sort:TRENDING_DESC, type:MANGA, isAdult:false){ coverImage{ extraLarge large color } } } }' }),
    });
    if (!resp.ok) return [];
    const j = await resp.json();
    return (j?.data?.Page?.media || []).map((m) => ({
      cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
      color: m.coverImage?.color || null,
    })).filter((x) => x.cover);
  } catch (_) { return []; }
}
function withTimeout(p, ms, fb) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]);
}

// ── motion primitives ────────────────────────────────────────────────────

function Reveal({ delay = 0, from = 'up', style, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 170, mass: 0.85 }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [a, delay]);
  const dist = from === 'left' ? -34 : from === 'right' ? 34 : 22;
  const tf = from === 'left' || from === 'right'
    ? [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) }]
    : [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) }];
  return (
    <Animated.View style={[{ opacity: a, transform: [...tf, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Per-character kinetic headline — each glyph lands on its own spring, which
// is what gives the titles their anime-title-card feel.
function Kinetic({ text, style, delay = 0, stagger = 42 }) {
  const chars = String(text).split('');
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {chars.map((ch, i) => (
        <KineticChar key={`${ch}-${i}`} ch={ch} style={style} delay={delay + i * stagger} />
      ))}
    </View>
  );
}
function KineticChar({ ch, style, delay }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 220, mass: 0.7 }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [a, delay]);
  return (
    <Animated.Text
      style={[style, {
        opacity: a,
        transform: [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) },
        ],
      }]}
    >
      {ch === ' ' ? ' ' : ch}
    </Animated.Text>
  );
}

// Odometer digit — each digit rolls independently, so a 4-digit chapter count
// lands like a counter rather than a single number fading in.
function Odometer({ value, style, duration = 1700, onDone }) {
  const digits = String(Math.max(0, Math.round(value)));
  return (
    <View style={{ flexDirection: 'row' }}>
      {digits.split('').map((d, i) => (
        <Digit key={i} target={parseInt(d, 10)} style={style} duration={duration} delay={i * 90} onDone={i === digits.length - 1 ? onDone : undefined} />
      ))}
    </View>
  );
}
function Digit({ target, style, duration, delay, onDone }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf; const start = Date.now() + delay;
    const tick = () => {
      const now = Date.now();
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(target * eased + (1 - eased) * ((target + 7) % 10) * (1 - p)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setShown(target); onDone && onDone(); }
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration, delay, onDone]);
  return <Text style={style}>{shown}</Text>;
}

function useCountUp(target, duration = 1400) {
  const [v, setV] = useState(0);
  const punch = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let raf; const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        Animated.sequence([
          Animated.timing(punch, { toValue: 1.18, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(punch, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 200 }),
        ]).start();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration, punch]);
  return { value: v, punch };
}

// A manga speech bubble — used for the reader's callouts.
function Bubble({ children, surface, style }) {
  return (
    <View style={[styles.bubble, { backgroundColor: surface.light ? '#fff' : rgba(surface.ink, 0.1), borderColor: surface.ink }, style]}>
      {children}
      <View style={[styles.bubbleTail, { borderTopColor: surface.light ? '#fff' : rgba(surface.ink, 0.1) }]} />
    </View>
  );
}

// ── slides ───────────────────────────────────────────────────────────────
// Each receives { d } (data) and { s } (its own surface colours).

function S1Welcome({ d, s }) {
  return (
    <View style={styles.body}>
      <Reveal delay={80}><Text style={[styles.kicker, { color: s.accent }]}>MANGARECS PRESENTS</Text></Reveal>
      <Kinetic text="MANGA" style={[styles.hero, { color: s.ink }]} delay={260} />
      <Kinetic text="RECAP" style={[styles.hero, { color: s.accent }]} delay={520} />
      <Reveal delay={1100}>
        <View style={[styles.rule, { backgroundColor: s.accent }]} />
        <Text style={[styles.lede, { color: s.ink }]}>{d.period.short.toUpperCase()}</Text>
      </Reveal>
      <Reveal delay={1300}><Text style={[styles.sub, { color: s.dim }]}>@{d.username}, here's your half.</Text></Reveal>
    </View>
  );
}

function S2Journey({ d, s }) {
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOUR JOURNEY</Text></Reveal>
      <Reveal delay={140}><Text style={[styles.h2, { color: s.ink }]}>It started on</Text></Reveal>
      <Kinetic text={d.firstDayLabel || 'day one'} style={[styles.h1, { color: s.accent }]} delay={340} stagger={34} />
      <Reveal delay={900}>
        <Bubble surface={s} style={{ marginTop: 26 }}>
          <Text style={[styles.bubbleText, { color: s.light ? '#1A1208' : s.ink }]}>
            {d.readingDays > 0
              ? `You showed up on ${d.readingDays} different ${d.readingDays === 1 ? 'day' : 'days'} this half.`
              : 'Your first chapter of the half is still waiting.'}
          </Text>
        </Bubble>
      </Reveal>
    </View>
  );
}

function S3Chapters({ d, s }) {
  const [landed, setLanded] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const onDone = useCallback(() => {
    setLanded(true);
    hapticSuccess();
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.5, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shake]);
  const tx = shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
  return (
    <Animated.View style={[styles.body, { transform: [{ translateX: tx }] }]}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOU DOVE INTO</Text></Reveal>
      <Odometer value={d.chapters} style={[styles.mega, { color: s.ink }]} onDone={onDone} />
      <Reveal delay={200}><Text style={[styles.h2, { color: s.accent }]}>CHAPTERS</Text></Reveal>
      {landed && (
        <Reveal delay={80}>
          <Text style={[styles.sub, { color: s.dim }]}>across {d.series} {d.series === 1 ? 'series' : 'series'}</Text>
        </Reveal>
      )}
    </Animated.View>
  );
}

function S4Time({ d, s }) {
  const hrs = useCountUp(Math.round(d.hours));
  const night = d.peakWindow && (d.peakWindow.startHour >= 20 || d.peakWindow.startHour < 5);
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>TIME SPENT READING</Text></Reveal>
      <Reveal delay={120}>
        <Animated.Text style={[styles.mega, { color: s.ink, transform: [{ scale: hrs.punch }] }]}>{hrs.value}</Animated.Text>
      </Reveal>
      <Reveal delay={220}><Text style={[styles.h2, { color: s.accent }]}>HOURS</Text></Reveal>
      {d.hours >= 24 && (
        <Reveal delay={420}>
          <Text style={[styles.sub, { color: s.dim }]}>That's {Math.round(d.hours / 24)} full days of nothing but story.</Text>
        </Reveal>
      )}
      {d.peakWindow && (
        <Reveal delay={620}>
          <View style={[styles.pill, { borderColor: s.accent, backgroundColor: s.light ? 'rgba(255,255,255,0.6)' : rgba(s.ink, 0.08) }]}>
            <Ionicons name={night ? 'moon' : 'sunny'} size={16} color={s.accent} />
            <View>
              <Text style={[styles.pillLabel, { color: s.dim }]}>PEAK READING TIME</Text>
              <Text style={[styles.pillValue, { color: s.ink }]}>{d.peakWindow.label}</Text>
            </View>
            <Text style={[styles.pillPct, { color: s.accent }]}>{d.peakWindow.pct}%</Text>
          </View>
        </Reveal>
      )}
      {!d.peakWindow && d.weekday.bestName && (
        <Reveal delay={620}><Text style={[styles.sub, { color: s.dim }]}>{d.weekday.bestName}s were your heaviest days.</Text></Reveal>
      )}
    </View>
  );
}

// The hero page — big covers, animated ranking, Spotify "Top Songs" energy.
function S5TopSeries({ d, s }) {
  if (!d.topSeries.length) {
    return (
      <View style={styles.body}>
        <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOUR TOP SERIES</Text></Reveal>
        <Reveal delay={160}><Text style={[styles.h1, { color: s.ink }]}>Still writing{'\n'}this chapter</Text></Reveal>
        <Reveal delay={340}><Text style={[styles.sub, { color: s.dim }]}>Start a series and it'll headline your next recap.</Text></Reveal>
      </View>
    );
  }
  const [lead, ...rest] = d.topSeries;
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOUR TOP SERIES</Text></Reveal>
      <Reveal delay={140} from="left" style={styles.leadRow}>
        <View style={[styles.leadCover, { borderColor: s.accent }]}>
          {!!lead.cover && <Image source={{ uri: lead.cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={300} />}
          <View style={[styles.leadRank, { backgroundColor: s.accent }]}>
            <Text style={styles.leadRankText}>1</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.leadTitle, { color: s.ink }]} numberOfLines={3}>{lead.title}</Text>
          <Text style={[styles.leadMeta, { color: s.accent }]}>{lead.chapters} chapters</Text>
        </View>
      </Reveal>
      <View style={{ marginTop: 16, width: '100%' }}>
        {rest.slice(0, 4).map((x, i) => (
          <Reveal key={x.title + i} delay={420 + i * 120} from="right" style={styles.rankRow}>
            <Text style={[styles.rankNum, { color: s.accent }]}>{i + 2}</Text>
            <View style={[styles.rankCover, { borderColor: rgba(s.ink, 0.25) }]}>
              {!!x.cover && <Image source={{ uri: x.cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={240} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rankTitle, { color: s.ink }]} numberOfLines={1}>{x.title}</Text>
              <Text style={[styles.rankMeta, { color: s.dim }]}>{x.chapters} chapters</Text>
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

function S6Genres({ d, s }) {
  const rows = d.genres;
  const anims = useRef(rows.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(110, anims.map((a, i) =>
      Animated.timing(a, { toValue: 1, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    )).start();
  }, [anims]);
  if (!rows.length) {
    return (
      <View style={styles.body}>
        <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>GENRES YOU EXPLORED</Text></Reveal>
        <Reveal delay={160}><Text style={[styles.h1, { color: s.ink }]}>Uncharted</Text></Reveal>
        <Reveal delay={320}><Text style={[styles.sub, { color: s.dim }]}>Your map is still blank — that's the fun part.</Text></Reveal>
      </View>
    );
  }
  const ICONS = {
    Action: 'flash', Adventure: 'compass', Comedy: 'happy', Drama: 'rainy', Fantasy: 'sparkles',
    Horror: 'skull', Mystery: 'search', Romance: 'heart', 'Sci-Fi': 'planet', 'Slice of Life': 'cafe',
    Sports: 'football', Supernatural: 'flame', Thriller: 'alert-circle', Psychological: 'eye',
    Mecha: 'hardware-chip', Music: 'musical-notes', Ecchi: 'flame',
  };
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>GENRES YOU EXPLORED</Text></Reveal>
      <View style={{ marginTop: 14, width: '100%' }}>
        {rows.map((r, i) => {
          const w = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(6, r.pct)}%`] });
          const c = d.identity.palette[i % d.identity.palette.length];
          return (
            <Reveal key={r.label} delay={180 + i * 90} from="left" style={styles.genreRow}>
              <View style={styles.genreHead}>
                <View style={[styles.genreIcon, { borderColor: c, backgroundColor: s.light ? 'rgba(255,255,255,0.65)' : rgba(s.ink, 0.08) }]}>
                  <Ionicons name={ICONS[r.label] || 'ellipse'} size={15} color={c} />
                </View>
                <Text style={[styles.genreName, { color: s.ink }]}>{r.label}</Text>
                <Text style={[styles.genrePct, { color: c }]}>{r.pct}%</Text>
              </View>
              <View style={[styles.genreTrack, { backgroundColor: s.light ? rgba(s.ink, 0.12) : rgba(s.ink, 0.13) }]}>
                <Animated.View style={[styles.genreFill, { width: w, backgroundColor: c }]} />
              </View>
            </Reveal>
          );
        })}
      </View>
    </View>
  );
}

function S7Personality({ d, s }) {
  const p = d.personality;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const ringO = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.05] });
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOUR READING PERSONALITY</Text></Reveal>
      <View style={{ alignItems: 'center', alignSelf: 'center', marginVertical: 18 }}>
        <Animated.View style={[styles.persoRing, { borderColor: s.accent, opacity: ringO, transform: [{ scale: ring }] }]} />
        <Reveal delay={180}>
          <View style={[styles.persoBadge, { borderColor: s.accent, backgroundColor: rgba(s.accent, 0.14) }]}>
            <Ionicons name={p.icon} size={44} color={s.accent} />
          </View>
        </Reveal>
      </View>
      <Kinetic text={p.title} style={[styles.h1, { color: s.ink }]} delay={420} stagger={38} />
      <Reveal delay={1000}><Text style={[styles.sub, { color: s.dim }]}>{p.desc}</Text></Reveal>
    </View>
  );
}

function S8Achievements({ d, s }) {
  const n = useCountUp(d.badgesEarned);
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>ACHIEVEMENTS & MILESTONES</Text></Reveal>
      <Reveal delay={140}>
        <Animated.Text style={[styles.mega, { color: s.ink, transform: [{ scale: n.punch }] }]}>{n.value}</Animated.Text>
      </Reveal>
      <Reveal delay={240}><Text style={[styles.h2, { color: s.accent }]}>BADGES EARNED</Text></Reveal>
      <Reveal delay={420}><Text style={[styles.sub, { color: s.dim }]}>out of {d.badgesTotal} in MangaRecs</Text></Reveal>
      {!!d.tierLabel && (
        <Reveal delay={620}>
          <View style={[styles.tier, { borderColor: d.tierColor, backgroundColor: rgba(d.tierColor, 0.16) }]}>
            <Ionicons name="shield" size={16} color={d.tierColor} />
            <Text style={[styles.tierText, { color: d.tierColor }]}>{d.tierLabel} Tier</Text>
          </View>
        </Reveal>
      )}
    </View>
  );
}

function S9Streak({ d, s }) {
  const n = useCountUp(d.longest);
  const cells = useMemo(() => Array.from({ length: 28 }, (_, i) => i < d.longest), [d.longest]);
  const anims = useRef(cells.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(26, anims.map((a) =>
      Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 200 })
    )).start();
  }, [anims]);
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>YOUR LONGEST STREAK</Text></Reveal>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Animated.Text style={[styles.mega, { color: s.ink, transform: [{ scale: n.punch }] }]}>{n.value}</Animated.Text>
        <Text style={[styles.h2, { color: s.accent, marginBottom: 14, marginLeft: 10 }]}>DAYS</Text>
      </View>
      <Reveal delay={300} style={styles.calendar}>
        {cells.map((on, i) => (
          <Animated.View
            key={i}
            style={[
              styles.calCell,
              {
                backgroundColor: on ? s.accent : rgba(s.ink, 0.14),
                opacity: anims[i],
                transform: [{ scale: anims[i] }],
              },
            ]}
          />
        ))}
      </Reveal>
      <Reveal delay={700}>
        <Text style={[styles.sub, { color: s.dim }]}>
          {d.longest >= 7 ? 'Consistency is its own superpower.' : 'Every streak starts with day one.'}
        </Text>
      </Reveal>
    </View>
  );
}

function S10Finale({ d, s, onShare, onDone }) {
  const stats = [
    { v: d.chapters, l: 'Chapters' },
    { v: d.series, l: 'Series' },
    { v: Math.round(d.hours), l: 'Hours' },
    { v: d.longest, l: 'Day streak' },
  ];
  return (
    <View style={styles.body}>
      <Reveal delay={0}><Text style={[styles.kicker, { color: s.accent }]}>{d.period.short.toUpperCase()}</Text></Reveal>
      <Kinetic text="WHAT A HALF!" style={[styles.hero2, { color: s.ink }]} delay={180} stagger={40} />
      <Reveal delay={780}>
        <View style={[styles.card, { borderColor: rgba(s.ink, 0.22), backgroundColor: rgba(s.light ? '#ffffff' : '#000000', s.light ? 0.5 : 0.34) }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardName, { color: s.ink }]}>@{d.username}</Text>
            <Text style={[styles.cardPerso, { color: s.accent }]}>{d.personality.title}</Text>
          </View>
          <View style={styles.cardGrid}>
            {stats.map((x) => (
              <View key={x.l} style={styles.cardCell}>
                <Text style={[styles.cardVal, { color: s.ink }]}>{x.v}</Text>
                <Text style={[styles.cardLbl, { color: s.dim }]}>{x.l}</Text>
              </View>
            ))}
          </View>
          {!!d.topSeries.length && (
            <View style={styles.cardCovers}>
              {d.topSeries.slice(0, 5).map((x, i) => (
                <View key={i} style={[styles.cardCover, { borderColor: rgba(s.ink, 0.3), marginLeft: i ? -14 : 0, zIndex: 5 - i }]}>
                  {!!x.cover && <Image source={{ uri: x.cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />}
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.cardFoot, { color: s.dim }]}>MangaRecs · MangaRecap</Text>
        </View>
      </Reveal>
      <Reveal delay={1000} style={styles.actions}>
        <TouchableOpacity style={[styles.btnMain, { backgroundColor: s.accent }]} onPress={onShare} activeOpacity={0.86}>
          <Ionicons name="share-social" size={17} color="#12080C" />
          <Text style={styles.btnMainText}>Share your recap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGhost, { borderColor: rgba(s.ink, 0.34) }]} onPress={onDone} activeOpacity={0.86}>
          <Text style={[styles.btnGhostText, { color: s.ink }]}>Continue reading</Text>
        </TouchableOpacity>
      </Reveal>
    </View>
  );
}

// ── slide manifest ───────────────────────────────────────────────────────
// Ten slides, always. Each names its own surface variant, background system
// and footer. Nothing here is conditional — a sparse reader still gets the
// full ten-beat story, with each slide handling thin data gracefully.
const SLIDES = [
  { key: 'welcome', variant: 'deep0',  Bg: BgCollage,      Comp: S1Welcome,      foot: 'Every chapter is a new adventure' },
  { key: 'journey', variant: 'paper0', Bg: BgFloatingCards, Comp: S2Journey,     foot: 'It all started somewhere' },
  { key: 'chapters', variant: 'deep1', Bg: BgBurst,        Comp: S3Chapters,     foot: 'Page after page after page' },
  { key: 'time',    variant: 'night',  Bg: BgLightSweep,   Comp: S4Time,         foot: 'Those late nights hit different' },
  { key: 'top',     variant: 'deep2',  Bg: BgCarousel,     Comp: S5TopSeries,    foot: 'These stories made the biggest impact' },
  { key: 'genres',  variant: 'paper1', Bg: BgRadial,       Comp: S6Genres,       foot: 'Every genre took you somewhere new' },
  { key: 'perso',   variant: 'deep3',  Bg: BgPanels,       Comp: S7Personality,  foot: 'This half was uniquely yours' },
  { key: 'badges',  variant: 'deep0',  Bg: BgConfetti,     Comp: S8Achievements, foot: 'Earned, never given' },
  { key: 'streak',  variant: 'fire',   Bg: BgEmbers,       Comp: S9Streak,       foot: 'Consistency is power' },
  { key: 'finale',  variant: 'deep1',  Bg: BgMosaic,       Comp: S10Finale,      foot: 'Never stop turning pages', isFinale: true },
];

// ── screen ───────────────────────────────────────────────────────────────

export default function RecapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile, userId, loading: profileLoading } = useProfile();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!userId) { setStatus('signedout'); return; }
    let dead = false;
    setStatus('loading');

    (async () => {
      try {
        const period = getPeriod();
        const sIso = period.start.toISOString(), eIso = period.end.toISOString();

        const [progRes, cmtRes, ratRes, dailyLog, hourLog] = await Promise.all([
          supabase.from('reading_progress').select('series_title,status,current_chapter,updated_at').eq('user_id', userId).gte('updated_at', sIso).lte('updated_at', eIso),
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sIso).lte('created_at', eIso),
          supabase.from('series_ratings').select('series_title', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sIso).lte('created_at', eIso),
          getMergedDailyLog(profile?.daily_log),
          getMergedHourLog(profile?.hour_log),
        ]);
        if (dead) return;

        const rows = progRes.data || [];
        const inRange = keysInRange(dailyLog, period.start, period.end);
        const hours = inRange.reduce((a, k) => a + (dailyLog[k] || 0), 0);
        const badgeStats = profileToBadgeStats(profile);
        const earned = computeEarnedBadgeIds(badgeStats);
        const grade = highestGradeEarned(earned);

        const ranked = [...rows].sort((a, b) => (b.current_chapter || 0) - (a.current_chapter || 0)).slice(0, 10);
        const art = await withTimeout(fetchArtBatch(ranked.map((r) => r.series_title)), 7000, {});
        if (dead) return;

        let topSeries = ranked.map((r) => {
          const m = art[r.series_title];
          return {
            title: r.series_title,
            chapters: r.current_chapter || 0,
            cover: m?.coverImage?.extraLarge || m?.coverImage?.large || null,
            color: m?.coverImage?.color || null,
            genres: m?.genres || [],
          };
        });

        // Backfill any title AniList couldn't resolve using the app's own
        // 5-source cover pipeline, so collages stay full.
        const missing = topSeries.filter((x) => !x.cover).slice(0, 4);
        if (missing.length) {
          await Promise.all(missing.map(async (x) => {
            const info = await withTimeout(fetchMangaInfo(x.title).catch(() => null), 5000, null);
            if (info?.coverUrl) x.cover = info.coverUrl;
          }));
        }
        if (dead) return;

        let covers = topSeries.map((x) => x.cover).filter(Boolean);
        let paletteSeeds = topSeries.filter((x) => x.color);

        // Only when a reader has literally no resolvable art of their own.
        if (!covers.length) {
          const trend = await withTimeout(fetchTrendingArt(), 6000, []);
          covers = trend.map((t) => t.cover);
          if (!paletteSeeds.length) paletteSeeds = trend;
        }
        if (dead) return;

        const genres = genreBreakdown(topSeries);
        const dominantGenre = genres[0]?.label || profile?.favorite_genre || null;
        const identity = buildIdentity(paletteSeeds, dominantGenre);

        const sortedKeys = inRange.slice().sort();
        const firstDay = sortedKeys.length ? new Date(`${sortedKeys[0]}T00:00:00`) : null;
        const chapters = rows.reduce((a, r) => a + (r.current_chapter || 0), 0);
        const peak = peakReadingWindow(hourLog);

        const base = {
          username: profile?.username || 'reader',
          period,
          identity,
          covers,
          topSeries,
          genres,
          chapters,
          series: rows.length,
          completed: rows.filter((r) => r.status === 'completed').length,
          hours,
          readingDays: inRange.length,
          longest: longestStreak(dailyLog, period.start, period.end),
          weekday: weekdayBreakdown(dailyLog, period.start, period.end),
          peakWindow: peak,
          firstDayLabel: firstDay ? firstDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null,
          badgesEarned: earned.size,
          badgesTotal: ALL_BADGES.length,
          tierLabel: grade ? BADGE_GRADES[grade].label : null,
          tierColor: grade ? BADGE_GRADES[grade].color : identity.accent,
          comments: cmtRes.count || 0,
          ratings: ratRes.count || 0,
        };
        base.chaptersPerHour = base.hours > 0 ? base.chapters / base.hours : 0;
        base.personality = personality({
          peakWindow: peak, completed: base.completed, longest: base.longest,
          chaptersPerHour: base.chaptersPerHour, genres: genres.length,
          series: base.series, chapters: base.chapters, hours: base.hours,
        });

        setData(base);
        setStatus('ready');
      } catch (e) {
        if (!dead) setStatus('error');
      }
    })();

    return () => { dead = true; };
  }, [profileLoading, userId, profile]);

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

  const go = useCallback((next) => {
    if (next < 0 || next >= SLIDES.length) return;
    if (running.current) running.current.stop();
    bars.forEach((v, i) => v.setValue(i < next ? 1 : 0));
    setIdx(next);
    setPaused(false);
    if (SLIDES[next].isFinale) return;
    const a = Animated.timing(bars[next], { toValue: 1, duration: AUTO_MS, easing: Easing.linear, useNativeDriver: false });
    running.current = a;
    a.start(({ finished }) => { if (finished) go(next + 1); });
  }, [bars]);

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
    const remain = Math.max(60, AUTO_MS * (1 - progressAt.current));
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
      // Vertical swipe drives the story; horizontal taps do too, Stories-style.
      if (g.dy < -60) { advance(1); return; }
      if (g.dy > 60) { advance(-1); return; }
      const x = e.nativeEvent.locationX;
      advance(x < SW * 0.3 ? -1 : 1);
    },
    onPanResponderTerminate: () => { clearTimeout(holdTimer.current); if (didHold.current) resume(); },
  }), [advance, pause, resume]);

  const close = useCallback(() => {
    if (running.current) running.current.stop();
    navigation.goBack();
  }, [navigation]);

  const onShare = useCallback(() => {
    if (!data) return;
    const lines = [
      `My MangaRecap — ${data.period.short}`,
      `${data.chapters} chapters · ${data.series} series · ${Math.round(data.hours)} hours`,
      `${data.longest}-day streak · ${data.personality.title}`,
      data.topSeries[0] ? `Top series: ${data.topSeries[0].title}` : null,
      'Get yours on MangaRecs.',
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  }, [data]);

  // ── states ─────────────────────────────────────────────────────────────
  if (profileLoading || status === 'loading') {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color="#fff" /></View>;
  }
  if (status === 'signedout' || status === 'error' || !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.fallbackText}>
          {status === 'signedout' ? 'Sign in to see your MangaRecap.' : "Couldn't build your MangaRecap. Try again in a moment."}
        </Text>
        <TouchableOpacity style={[styles.btnGhost, { borderColor: 'rgba(255,255,255,0.34)' }]} onPress={close}>
          <Text style={[styles.btnGhostText, { color: '#fff' }]}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const slide = SLIDES[idx];
  const s = slideSurface(data.identity, slide.variant);
  const Bg = slide.Bg;
  const Comp = slide.Comp;
  const night = slide.key === 'time' && data.peakWindow && (data.peakWindow.startHour >= 20 || data.peakWindow.startHour < 5);

  return (
    <View style={styles.root}>
      {/* colour field → living cover background → texture → scrim → content */}
      <LinearGradient colors={[s.from, s.to]} style={StyleSheet.absoluteFill} />
      <View key={`bg-${slide.key}`} style={StyleSheet.absoluteFill}>
        <Bg covers={data.covers} surface={s} palette={data.identity.palette} night={night} />
      </View>

      {data.identity.texture === 'speed' && <SpeedLines color={s.ink} opacity={s.light ? 0.07 : 0.1} spin={120000} />}
      {data.identity.texture === 'ink' && <InkSplatter color={s.light ? s.ink : '#000'} opacity={s.light ? 0.06 : 0.22} seed={idx + 2} />}
      <Halftone color={s.light ? s.ink : '#fff'} opacity={s.light ? 0.07 : 0.08} />
      <Grain opacity={s.light ? 0.03 : 0.05} />

      <LinearGradient
        colors={[rgba(s.from, s.light ? 0.5 : 0.42), rgba(s.to, s.light ? 0.75 : 0.72), rgba(s.to, s.light ? 0.97 : 0.96)]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* gesture surface — tap zones, vertical swipe, hold-to-pause */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* chrome */}
      <View style={[styles.chrome, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {SLIDES.map((x, i) => (
            <View key={x.key} style={[styles.barTrack, { backgroundColor: rgba(s.ink, 0.28) }]}>
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
            {!slide.isFinale && (
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: rgba(s.ink, 0.16) }]} onPress={() => (paused ? resume() : pause())} hitSlop={10}>
                <Ionicons name={paused ? 'play' : 'pause'} size={15} color={s.ink} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: rgba(s.ink, 0.16) }]} onPress={() => go(0)} hitSlop={10}>
              <Ionicons name="refresh" size={15} color={s.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: rgba(s.ink, 0.16) }]} onPress={close} hitSlop={10}>
              <Ionicons name="close" size={18} color={s.ink} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* content */}
      <View key={`c-${slide.key}`} style={[styles.content, { paddingBottom: insets.bottom + 54 }]} pointerEvents="box-none">
        <Comp d={data} s={s} onShare={onShare} onDone={close} />
      </View>

      <View style={[styles.footWrap, { bottom: insets.bottom + 18 }]} pointerEvents="none">
        <Reveal delay={900}><Text style={[styles.foot, { color: s.dim }]}>{slide.foot}</Text></Reveal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08050C' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 34 },
  fallbackText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', lineHeight: 21 },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 30 },
  bars: { flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 2.5, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  brand: { fontFamily: DISPLAY, fontSize: 15, letterSpacing: 0.4 },
  topBtns: { flexDirection: 'row', gap: 7 },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 26, zIndex: 20 },
  body: { width: '100%' },

  kicker: { fontSize: 11.5, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  hero: { fontFamily: DISPLAY, fontSize: 62, lineHeight: 64, letterSpacing: -1 },
  hero2: { fontFamily: DISPLAY, fontSize: 46, lineHeight: 50, letterSpacing: -0.5 },
  h1: { fontFamily: DISPLAY, fontSize: 40, lineHeight: 44 },
  h2: { fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.5 },
  mega: { fontFamily: DISPLAY, fontSize: 96, lineHeight: 100, letterSpacing: -3 },
  lede: { fontFamily: DISPLAY, fontSize: 19, letterSpacing: 1.4, marginTop: 10 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 10, fontWeight: '600' },
  rule: { width: 62, height: 4, borderRadius: 2, marginTop: 18 },

  bubble: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, alignSelf: 'flex-start', maxWidth: '96%' },
  bubbleText: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  bubbleTail: {
    position: 'absolute', bottom: -11, left: 26, width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 11, alignSelf: 'flex-start', marginTop: 20, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 15, borderWidth: 1.5 },
  pillLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  pillValue: { fontFamily: DISPLAY, fontSize: 17, marginTop: 2 },
  pillPct: { fontFamily: DISPLAY, fontSize: 16, marginLeft: 6 },

  leadRow: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 8 },
  leadCover: { width: 118, height: 172, borderRadius: 12, borderWidth: 2.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  leadRank: { position: 'absolute', top: -1, left: -1, width: 34, height: 34, borderBottomRightRadius: 12, alignItems: 'center', justifyContent: 'center' },
  leadRankText: { fontFamily: DISPLAY, fontSize: 20, color: '#12080C' },
  leadTitle: { fontFamily: DISPLAY, fontSize: 25, lineHeight: 28 },
  leadMeta: { fontSize: 13.5, fontWeight: '800', marginTop: 7 },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 },
  rankNum: { fontFamily: DISPLAY, fontSize: 20, width: 20, textAlign: 'center' },
  rankCover: { width: 36, height: 52, borderRadius: 5, borderWidth: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  rankTitle: { fontSize: 14.5, fontWeight: '800' },
  rankMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  genreRow: { marginBottom: 13 },
  genreHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  genreIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  genreName: { flex: 1, fontSize: 14.5, fontWeight: '800' },
  genrePct: { fontFamily: DISPLAY, fontSize: 16 },
  genreTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  genreFill: { height: '100%', borderRadius: 4 },

  persoRing: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 2, top: -2 },
  persoBadge: { width: 100, height: 100, borderRadius: 50, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },

  tier: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 18, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5 },
  tierText: { fontFamily: DISPLAY, fontSize: 15 },

  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 20, maxWidth: 300 },
  calCell: { width: 26, height: 26, borderRadius: 6 },

  card: { borderWidth: 1.5, borderRadius: 20, padding: 18, marginTop: 20, width: '100%' },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardName: { fontFamily: DISPLAY, fontSize: 19 },
  cardPerso: { fontSize: 12.5, fontWeight: '900' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  cardCell: { width: '50%', marginBottom: 12 },
  cardVal: { fontFamily: DISPLAY, fontSize: 27 },
  cardLbl: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 1 },
  cardCovers: { flexDirection: 'row', marginTop: 2, marginBottom: 12 },
  cardCover: { width: 40, height: 58, borderRadius: 6, borderWidth: 1.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  cardFoot: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  btnMain: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 999 },
  btnMainText: { color: '#12080C', fontWeight: '900', fontSize: 14.5 },
  btnGhost: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5 },
  btnGhostText: { fontWeight: '900', fontSize: 14.5 },

  footWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  foot: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
