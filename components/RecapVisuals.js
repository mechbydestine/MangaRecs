// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — living backgrounds + manga print textures
//
// Every slide gets its OWN background system built from the reader's real
// cover art; no two slides reuse the same treatment. Nothing here generates
// artwork — covers are treated the way Spotify treats album art: real images,
// beautiful motion design around them.
//
// All motion runs on the native driver (transform/opacity only) so ten
// simultaneously animating cover cards stay at 60fps on mid-range Android.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Pattern, Circle, Rect, Line, G, Path, Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { rgba } from '../utils/recapTheme';

const { width: SW, height: SH } = Dimensions.get('window');

// ── deterministic pseudo-random ──────────────────────────────────────────
// Seeded so a given reader's layout is stable across re-renders (a cover
// doesn't teleport when the slide re-paints) while still looking scattered.
function rnd(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ── loops ────────────────────────────────────────────────────────────────
function useLoop(duration, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}
function useSpin(duration) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [v, duration]);
  return v;
}
// One-shot entrance, for backgrounds that assemble/explode on arrival.
function useEnter(duration = 1400, easing = Easing.out(Easing.cubic)) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, duration, easing]);
  return v;
}

// ── manga print textures ─────────────────────────────────────────────────

export function Halftone({ color = '#fff', opacity = 0.09, size = 7, dot = 1 }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="mrht" width={size} height={size} patternUnits="userSpaceOnUse">
          <Circle cx={size / 2} cy={size / 2} r={dot} fill={color} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#mrht)" opacity={opacity} />
    </Svg>
  );
}

export function SpeedLines({ color = '#fff', opacity = 0.22, count = 44, spin = 0 }) {
  const lines = useMemo(() => {
    const r = rnd(7);
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const jit = 0.5 + r() * 0.6;
      out.push({
        x1: 50 + Math.cos(a) * 22, y1: 50 + Math.sin(a) * 22,
        x2: 50 + Math.cos(a) * (60 * jit + 40), y2: 50 + Math.sin(a) * (60 * jit + 40),
        w: 0.4 + r() * 1.5,
      });
    }
    return out;
  }, [count]);
  const body = (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <G opacity={opacity}>
        {lines.map((l, i) => (
          <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.w} strokeLinecap="round" />
        ))}
      </G>
    </Svg>
  );
  const rot = useSpin(spin || 90000);
  if (!spin) return body;
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]} pointerEvents="none">{body}</Animated.View>;
}

// Brush/ink blots — the wet-ink edge of a manga splash page.
export function InkSplatter({ color = '#000', opacity = 0.5, seed = 3 }) {
  const blobs = useMemo(() => {
    const r = rnd(seed);
    return Array.from({ length: 7 }, () => ({
      cx: r() * 100, cy: r() * 100, rx: 4 + r() * 22, ry: 3 + r() * 16, rot: r() * 180,
    }));
  }, [seed]);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
      <G opacity={opacity}>
        {blobs.map((b, i) => (
          <Ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={color} transform={`rotate(${b.rot} ${b.cx} ${b.cy})`} />
        ))}
      </G>
    </Svg>
  );
}

// Torn-paper / panel gutter edge.
export function PanelEdge({ color = '#000', opacity = 0.9, flip = false }) {
  return (
    <Svg style={[StyleSheet.absoluteFill, flip && { transform: [{ scaleY: -1 }] }]} viewBox="0 0 100 12" preserveAspectRatio="none" pointerEvents="none">
      <Path d="M0 0 L100 0 L100 5 L86 8 L72 4 L58 9 L44 5 L30 10 L16 6 L0 9 Z" fill={color} opacity={opacity} />
    </Svg>
  );
}

export function Grain({ opacity = 0.05 }) {
  const dots = useMemo(() => {
    const r = rnd(11);
    return Array.from({ length: 140 }, () => ({ x: r() * 100, y: r() * 100, r: r() * 0.6 + 0.15 }));
  }, []);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
      <G opacity={opacity} fill="#fff">
        {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} />)}
      </G>
    </Svg>
  );
}

// ── cover primitives ─────────────────────────────────────────────────────

function Cover({ uri, style, radius = 8, border }) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)' }, border && { borderWidth: 1.5, borderColor: border }, style]}>
      {!!uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={260} />}
    </View>
  );
}

function pick(covers, i) {
  const list = (covers || []).filter(Boolean);
  if (!list.length) return null;
  return list[i % list.length];
}

// ═════════════════════════════════════════════════════════════════════════
// 1. DRIFTING COLLAGE — a wall of every cover, blurred back, slow camera pan
// ═════════════════════════════════════════════════════════════════════════
export function BgCollage({ covers, surface }) {
  const pan = useLoop(14000);
  const drift = useLoop(19000);
  const cols = 4, rows = 6;
  const cw = SW / cols * 1.16, ch = cw * 1.45;
  const tiles = useMemo(() => {
    const r = rnd(21);
    const out = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ x, y, o: 0.5 + r() * 0.5 });
    return out;
  }, []);
  const tx = pan.interpolate({ inputRange: [0, 1], outputRange: [-26, 26] });
  const ty = drift.interpolate({ inputRange: [0, 1], outputRange: [-40, 20] });
  const sc = pan.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1.22] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: -ch, left: -cw / 2, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }}>
        {tiles.map((t, i) => (
          <Cover
            key={i}
            uri={pick(covers, i)}
            radius={4}
            style={{ position: 'absolute', left: t.x * cw, top: t.y * ch, width: cw - 5, height: ch - 5, opacity: t.o }}
          />
        ))}
      </Animated.View>
      {/* Push the wall back so it reads as depth, not as content. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(surface.to, 0.72) }]} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 2. FLOATING CARDS — covers separate out and drift at different depths
// ═════════════════════════════════════════════════════════════════════════
export function BgFloatingCards({ covers, surface }) {
  const cards = useMemo(() => {
    const r = rnd(33);
    return Array.from({ length: 7 }, (_, i) => ({
      x: r() * (SW - 120), y: r() * (SH - 220), w: 74 + r() * 54,
      rot: (r() - 0.5) * 26, dur: 4200 + r() * 3600, depth: 0.24 + r() * 0.4, i,
    }));
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cards.map((c) => <FloatCard key={c.i} c={c} uri={pick(covers, c.i)} accent={surface.accent} />)}
    </View>
  );
}
function FloatCard({ c, uri, accent }) {
  const f = useLoop(c.dur, c.i * 180);
  const ty = f.interpolate({ inputRange: [0, 1], outputRange: [0, -26 - c.depth * 30] });
  const rot = f.interpolate({ inputRange: [0, 1], outputRange: [`${c.rot}deg`, `${c.rot + 5}deg`] });
  return (
    <Animated.View style={{ position: 'absolute', left: c.x, top: c.y, opacity: c.depth + 0.16, transform: [{ translateY: ty }, { rotate: rot }] }}>
      <Cover uri={uri} border={rgba(accent, 0.5)} style={{ width: c.w, height: c.w * 1.45 }} />
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 3. PARTICLE BURST — covers shrink to shards and blast outward
// ═════════════════════════════════════════════════════════════════════════
export function BgBurst({ covers, surface }) {
  const e = useEnter(2200, Easing.out(Easing.quad));
  const shards = useMemo(() => {
    const r = rnd(45);
    return Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2 + r() * 0.3;
      return { a, dist: 130 + r() * 230, size: 26 + r() * 42, rot: (r() - 0.5) * 120, i };
    });
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SpeedLines color={surface.accent} opacity={0.26} spin={70000} />
      {shards.map((s) => {
        const tx = e.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(s.a) * s.dist] });
        const ty = e.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(s.a) * s.dist] });
        const rot = e.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${s.rot}deg`] });
        const op = e.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.85, 0.3] });
        return (
          <Animated.View
            key={s.i}
            style={{
              position: 'absolute', left: SW / 2 - s.size / 2, top: SH / 2 - s.size / 2,
              opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
            }}
          >
            <Cover uri={pick(covers, s.i)} radius={3} style={{ width: s.size, height: s.size * 1.4 }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 4. CLOCK / LIGHT SHIFT — covers as a slow horizontal parallax band, with a
//    sweeping light that moves like sun→moon across the slide
// ═════════════════════════════════════════════════════════════════════════
export function BgLightSweep({ covers, surface, night }) {
  const sweep = useLoop(11000);
  const band = useLoop(17000);
  const tx = band.interpolate({ inputRange: [0, 1], outputRange: [-70, 30] });
  const lx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-SW * 0.4, SW * 0.5] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: SH * 0.16, flexDirection: 'row', transform: [{ translateX: tx }] }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Cover key={i} uri={pick(covers, i)} radius={5} style={{ width: 92, height: 132, marginRight: 12, opacity: 0.3 }} />
        ))}
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: SH * 0.42, flexDirection: 'row', transform: [{ translateX: Animated.multiply(tx, -1.4) }] }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Cover key={i} uri={pick(covers, i + 3)} radius={5} style={{ width: 68, height: 98, marginRight: 10, opacity: 0.2 }} />
        ))}
      </Animated.View>
      {/* the moving light — warm low sun, or cold moonlight */}
      <Animated.View style={{ position: 'absolute', top: -SH * 0.18, left: 0, width: SW * 0.9, height: SH * 0.7, transform: [{ translateX: lx }] }}>
        <LinearGradient
          colors={[rgba(night ? '#9FC4FF' : surface.accent, night ? 0.3 : 0.42), 'transparent']}
          style={{ flex: 1, borderRadius: SW }}
        />
      </Animated.View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 5. 3D CAROUSEL — the hero page. Covers on a rotating ring in perspective.
// ═════════════════════════════════════════════════════════════════════════
export function BgCarousel({ covers, surface }) {
  const spin = useSpin(26000);
  const n = 9;
  const items = useMemo(() => Array.from({ length: n }, (_, i) => i), []);
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      {items.map((i) => {
        const base = (i / n) * 2 * Math.PI;
        const tx = spin.interpolate({
          inputRange: [0, 1],
          outputRange: [Math.cos(base) * 150, Math.cos(base + 2 * Math.PI) * 150],
        });
        const sc = spin.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.62 + 0.38 * ((Math.sin(base) + 1) / 2), 0.62 + 0.38 * ((Math.sin(base + Math.PI) + 1) / 2), 0.62 + 0.38 * ((Math.sin(base) + 1) / 2)],
        });
        const rotY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              opacity: 0.4,
              transform: [{ perspective: 700 }, { translateX: tx }, { scale: sc }, { rotateY: rotY }],
            }}
          >
            <Cover uri={pick(covers, i)} border={rgba(surface.accent, 0.4)} style={{ width: 108, height: 156 }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 6. RADIAL MORPH — covers arranged in a slowly breathing ring behind a
//    genre wheel; reads as an abstract graphic, not a photo wall
// ═════════════════════════════════════════════════════════════════════════
export function BgRadial({ covers, surface }) {
  const breathe = useLoop(6500);
  const spin = useSpin(60000);
  const n = 12;
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const sc = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      <Animated.View style={{ width: SW, height: SW, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: rot }, { scale: sc }] }}>
        {Array.from({ length: n }).map((_, i) => {
          const a = (i / n) * 2 * Math.PI;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: SW / 2 + Math.cos(a) * SW * 0.36 - 26,
                top: SW / 2 + Math.sin(a) * SW * 0.36 - 38,
                opacity: 0.34,
                transform: [{ rotate: `${(a * 180) / Math.PI + 90}deg` }],
              }}
            >
              <Cover uri={pick(covers, i)} radius={3} style={{ width: 52, height: 76 }} />
            </View>
          );
        })}
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(surface.to, 0.45) }]} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 7. GEOMETRIC — covers masked into hard-edged manga panel blocks
// ═════════════════════════════════════════════════════════════════════════
export function BgPanels({ covers, surface }) {
  const e = useEnter(1500);
  const blocks = useMemo(() => ([
    { x: 0.02, y: 0.06, w: 0.44, h: 0.3, r: -3 },
    { x: 0.5, y: 0.02, w: 0.46, h: 0.22, r: 2 },
    { x: 0.54, y: 0.27, w: 0.42, h: 0.3, r: -2 },
    { x: 0.04, y: 0.4, w: 0.4, h: 0.26, r: 3 },
    { x: 0.3, y: 0.68, w: 0.5, h: 0.24, r: -2 },
  ]), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blocks.map((b, i) => {
        const op = e.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });
        const tx = e.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? 40 : -40, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: b.x * SW, top: b.y * SH, width: b.w * SW, height: b.h * SH,
              opacity: op, transform: [{ translateX: tx }, { rotate: `${b.r}deg` }],
            }}
          >
            <Cover uri={pick(covers, i)} radius={2} border={rgba(surface.ink, 0.5)} style={{ width: '100%', height: '100%' }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 8. EMBER FIELD — covers dissolve into rising sparks (streak slide)
// ═════════════════════════════════════════════════════════════════════════
export function BgEmbers({ covers, surface }) {
  const embers = useMemo(() => {
    const r = rnd(57);
    return Array.from({ length: 22 }, (_, i) => ({
      x: r() * SW, size: 5 + r() * 13, dur: 3800 + r() * 3800, delay: r() * 2600, i,
    }));
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SpeedLines color={surface.accent} opacity={0.2} spin={80000} />
      {embers.map((em) => <Ember key={em.i} em={em} accent={surface.accent} />)}
    </View>
  );
}
function Ember({ em, accent }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: em.dur, delay: em.delay, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, em]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [SH * 0.95, -60] });
  const op = v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.9, 0.5, 0] });
  const tx = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 18, -12] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: em.x, width: em.size, height: em.size, borderRadius: em.size / 2,
        backgroundColor: accent, opacity: op, transform: [{ translateY: ty }, { translateX: tx }],
      }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 9. CONFETTI — achievement celebration, real cover shards + colour flecks
// ═════════════════════════════════════════════════════════════════════════
export function BgConfetti({ covers, surface, palette }) {
  const bits = useMemo(() => {
    const r = rnd(69);
    return Array.from({ length: 30 }, (_, i) => ({
      x: r() * SW, size: 7 + r() * 15, dur: 3000 + r() * 3200, delay: r() * 2400,
      isCover: i % 4 === 0, colour: palette[i % palette.length], rot: r() * 360, i,
    }));
  }, [palette]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((b) => <ConfettiBit key={b.i} b={b} uri={b.isCover ? pick(covers, b.i) : null} />)}
    </View>
  );
}
function ConfettiBit({ b, uri }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: b.dur, delay: b.delay, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, b]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-70, SH + 40] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.rot + 540}deg`] });
  const op = v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.9, 0.75, 0] });
  return (
    <Animated.View style={{ position: 'absolute', left: b.x, opacity: op, transform: [{ translateY: ty }, { rotate: rot }] }}>
      {uri
        ? <Cover uri={uri} radius={2} style={{ width: b.size, height: b.size * 1.4 }} />
        : <View style={{ width: b.size, height: b.size * 0.5, borderRadius: 1, backgroundColor: b.colour }} />}
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// 10. FINALE MOSAIC — every cover assembles into one celebratory wall that
//     slowly pushes in; the "everything comes together" beat
// ═════════════════════════════════════════════════════════════════════════
export function BgMosaic({ covers, surface }) {
  const e = useEnter(2600, Easing.out(Easing.cubic));
  const push = useLoop(16000);
  const cols = 5, rows = 8;
  const cw = SW / cols, ch = cw * 1.42;
  const tiles = useMemo(() => {
    const r = rnd(81);
    const out = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ x, y, d: r(), o: 0.42 + r() * 0.5 });
    return out;
  }, []);
  const zoom = push.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.16] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: -ch, left: 0, transform: [{ scale: zoom }] }}>
        {tiles.map((t, i) => {
          const op = e.interpolate({ inputRange: [Math.min(0.85, t.d * 0.8), Math.min(1, t.d * 0.8 + 0.2)], outputRange: [0, t.o], extrapolate: 'clamp' });
          const s = e.interpolate({ inputRange: [Math.min(0.85, t.d * 0.8), Math.min(1, t.d * 0.8 + 0.2)], outputRange: [0.4, 1], extrapolate: 'clamp' });
          return (
            <Animated.View key={i} style={{ position: 'absolute', left: t.x * cw, top: t.y * ch, opacity: op, transform: [{ scale: s }] }}>
              <Cover uri={pick(covers, i)} radius={3} style={{ width: cw - 4, height: ch - 4 }} />
            </Animated.View>
          );
        })}
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(surface.to, 0.6) }]} />
    </View>
  );
}
