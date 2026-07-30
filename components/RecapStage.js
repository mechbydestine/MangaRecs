// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — stages, print textures and the manga foreground kit
//
// Two halves:
//
//   STAGES   Ten background systems, one per slide, none reused. Each is built
//            entirely from the reader's real cover art — treated the way
//            Spotify treats album artwork: never generated, always moved.
//            Every stage runs in true depth layers (far art is blurred, dimmed
//            and drifts slowly; near art is sharp, bright and drifts fast) and
//            is closed with a shaped vignette rather than a flat scrim, so the
//            covers stay visible instead of dissolving into a gradient.
//
//   KIT      The manga design language the foreground is drawn in: screentone
//            ramps, converging speed lines, ink brushwork, hard panel gutters,
//            torn paper, misregistered print type, speech bubbles, vertical
//            page rails and seal stamps.
//
// Every motion here runs on the native driver (transform + opacity only), so a
// stage carrying thirty animated cover cards still holds 60fps on mid Android.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import Svg, {
  Defs, Pattern, Circle, Rect, Line, G, Path, Ellipse,
  Mask, LinearGradient as SvgGrad, RadialGradient, Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { rgba, mix } from '../utils/recapIdentity';

// react-native-svg keeps <Defs> ids in one namespace per platform view, so two
// mounted textures sharing an id would silently paint each other's gradient.
let UID = 0;
function useUid(prefix) {
  return useMemo(() => `${prefix}${++UID}`, [prefix]);
}

// Seeded scatter — a reader's layout must not reshuffle on every repaint.
function rnd(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ── motion primitives ────────────────────────────────────────────────────

function useLoop(duration, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

function useSpin(duration, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

function useEnter(duration = 1400, easing = Easing.out(Easing.cubic), delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, duration, easing, delay]);
  return v;
}

// ═════════════════════════════════════════════════════════════════════════
// PRINT TEXTURES
// ═════════════════════════════════════════════════════════════════════════

/**
 * Screentone — benday dots with a real density ramp, the way tone sheets were
 * actually laid down. `dir` swings the ramp so consecutive slides never show
 * the same falloff.
 */
export function Screentone({ color = '#000', opacity = 0.22, size = 6, dot = 1.5, dir = 'tl' }) {
  const id = useUid('st');
  const D = {
    tl: { x1: '0', y1: '0', x2: '1', y2: '1' },
    tr: { x1: '1', y1: '0', x2: '0', y2: '1' },
    b:  { x1: '0', y1: '1', x2: '0', y2: '0' },
    t:  { x1: '0', y1: '0', x2: '0', y2: '1' },
  }[dir] || { x1: '0', y1: '0', x2: '1', y2: '1' };
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={`${id}p`} width={size} height={size} patternUnits="userSpaceOnUse">
          <Circle cx={size / 2} cy={size / 2} r={dot} fill={color} />
        </Pattern>
        <SvgGrad id={`${id}g`} {...D}>
          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
          <Stop offset="0.62" stopColor="#fff" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </SvgGrad>
        <Mask id={`${id}m`}>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}g)`} />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}p)`} mask={`url(#${id}m)`} opacity={opacity} />
    </Svg>
  );
}

/** Action lines converging on a focal point — the manga "this matters" mark. */
export function SpeedLines({ color = '#fff', opacity = 0.2, count = 56, cx = 50, cy = 50, hole = 16, spin = 0 }) {
  const lines = useMemo(() => {
    const r = rnd(7 + count);
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.06;
      const jit = 0.55 + r() * 0.75;
      return {
        x1: cx + Math.cos(a) * hole * jit, y1: cy + Math.sin(a) * hole * jit,
        x2: cx + Math.cos(a) * 170, y2: cy + Math.sin(a) * 170,
        w: 0.25 + r() * 1.9,
      };
    });
  }, [count, cx, cy, hole]);
  const body = (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <G opacity={opacity}>
        {lines.map((l, i) => (
          <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={l.w} strokeLinecap="round" />
        ))}
      </G>
    </Svg>
  );
  const rot = useSpin(spin || 120000);
  if (!spin) return body;
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]} pointerEvents="none">{body}</Animated.View>;
}

/** Broad focus rays — softer than speed lines, for wonder rather than impact. */
export function Rays({ color = '#fff', opacity = 0.16, count = 15, cx = 50, cy = 24 }) {
  const rot = useSpin(150000);
  const wedges = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2 / count) * 0.42;
    return `M${cx} ${cy} L${cx + Math.cos(a0) * 180} ${cy + Math.sin(a0) * 180} L${cx + Math.cos(a1) * 180} ${cy + Math.sin(a1) * 180} Z`;
  }), [count, cx, cy]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <G opacity={opacity}>{wedges.map((d, i) => <Path key={i} d={d} fill={color} />)}</G>
      </Svg>
    </Animated.View>
  );
}

/** Sumi brush strokes + blots — wet ink on the page edge. */
export function InkBrush({ color = '#000', opacity = 0.28, seed = 3 }) {
  const shapes = useMemo(() => {
    const r = rnd(seed);
    const strokes = Array.from({ length: 4 }, () => {
      const y = r() * 100, x = r() * 40;
      const len = 40 + r() * 70;
      const bow = (r() - 0.5) * 26;
      return `M${x} ${y} C${x + len * 0.3} ${y + bow}, ${x + len * 0.7} ${y - bow}, ${x + len} ${y + bow * 0.4}`;
    });
    const blots = Array.from({ length: 6 }, () => ({
      cx: r() * 100, cy: r() * 100, rx: 3 + r() * 18, ry: 2 + r() * 13, rot: r() * 180,
    }));
    return { strokes, blots };
  }, [seed]);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
      <G opacity={opacity}>
        {shapes.strokes.map((d, i) => (
          <Path key={`s${i}`} d={d} stroke={color} strokeWidth={2 + i} fill="none" strokeLinecap="round" opacity={0.5} />
        ))}
        {shapes.blots.map((b, i) => (
          <Ellipse key={`b${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={color} transform={`rotate(${b.rot} ${b.cx} ${b.cy})`} />
        ))}
      </G>
    </Svg>
  );
}

/** Blueprint grid — the sci-fi lane's texture. */
export function GridLines({ color = '#fff', opacity = 0.12, step = 26 }) {
  const id = useUid('gd');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={`${id}p`} width={step} height={step} patternUnits="userSpaceOnUse">
          <Path d={`M${step} 0 L0 0 0 ${step}`} fill="none" stroke={color} strokeWidth="1" />
        </Pattern>
        <SvgGrad id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </SvgGrad>
        <Mask id={`${id}m`}><Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}g)`} /></Mask>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}p)`} mask={`url(#${id}m)`} opacity={opacity} />
    </Svg>
  );
}

/** Soft out-of-focus lights — the romance/slice-of-life lane. */
export function Bokeh({ colors = ['#fff'], opacity = 0.2, count = 12, w = 400, h = 800 }) {
  const bits = useMemo(() => {
    const r = rnd(29);
    return Array.from({ length: count }, (_, i) => ({
      x: r() * w, y: r() * h, size: 30 + r() * 110, c: colors[i % colors.length], dur: 5200 + r() * 5200, i,
    }));
  }, [count, w, h, colors]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((b) => <BokehBit key={b.i} b={b} opacity={opacity} />)}
    </View>
  );
}
function BokehBit({ b, opacity }) {
  const f = useLoop(b.dur, b.i * 140);
  const ty = f.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const sc = f.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: b.x, top: b.y, width: b.size, height: b.size,
        borderRadius: b.size / 2, backgroundColor: b.c, opacity,
        transform: [{ translateY: ty }, { scale: sc }],
      }}
    />
  );
}

export function Grain({ opacity = 0.05 }) {
  const dots = useMemo(() => {
    const r = rnd(11);
    return Array.from({ length: 190 }, () => ({ x: r() * 100, y: r() * 100, r: r() * 0.55 + 0.12 }));
  }, []);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
      <G opacity={opacity} fill="#fff">
        {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} />)}
      </G>
    </Svg>
  );
}

/**
 * Shaped vignette. This replaces the old flat full-screen scrim: art stays
 * legible in the middle and only falls away at the edges and under the type,
 * which is the entire difference between "cover collage" and "grey gradient".
 */
export function Vignette({ color = '#000', strength = 0.7, focus = 'bottom' }) {
  const id = useUid('vg');
  const stops = focus === 'center'
    ? [['0.25', 0], ['0.72', strength * 0.55], ['1', strength]]
    : [['0.3', 0], ['0.78', strength * 0.5], ['1', strength * 0.9]];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}r`} cx="50%" cy={focus === 'center' ? '50%' : '38%'} rx="76%" ry="66%">
            {stops.map(([o, a], i) => <Stop key={i} offset={o} stopColor={color} stopOpacity={a} />)}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}r)`} />
      </Svg>
      {focus !== 'center' && (
        <LinearGradient
          colors={['transparent', rgba(color, strength * 0.55), rgba(color, Math.min(0.98, strength + 0.24))]}
          locations={[0.34, 0.68, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

/**
 * The reader's texture stack. Genre lane picks the effect, print mode picks
 * how hard it is applied — screentone is heavy on newsprint and absent on a
 * webtoon, where the same slot becomes a rim glow instead.
 */
export function TextureStack({ id, s, w, h, focal = { x: 50, y: 46 }, seed = 1 }) {
  const m = id.mode;
  const inkC = s.light ? id.paperInk : s.ink;
  const strength = s.light ? 0.55 : 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {id.texture === 'speed' && (
        <SpeedLines color={inkC} opacity={0.12 * strength} count={62} cx={focal.x} cy={focal.y} spin={m.key === 'webtoon' ? 0 : 200000} />
      )}
      {id.texture === 'rays' && <Rays color={s.light ? id.primary : s.accent} opacity={0.13 * strength} cx={focal.x} cy={focal.y - 16} />}
      {id.texture === 'ink' && <InkBrush color={s.light ? id.paperInk : '#000'} opacity={s.light ? 0.09 : 0.3} seed={seed + 2} />}
      {id.texture === 'grid' && <GridLines color={inkC} opacity={0.11 * strength} />}
      {id.texture === 'bokeh' && <Bokeh colors={id.ramp} opacity={s.light ? 0.14 : 0.2} w={w} h={h} count={10} />}

      {m.tone === 'screentone' && <Screentone color={inkC} opacity={s.light ? 0.16 : 0.13} size={6} dot={1.5} dir={seed % 2 ? 'tl' : 'tr'} />}
      {m.tone === 'wash' && <Screentone color={inkC} opacity={s.light ? 0.1 : 0.08} size={11} dot={2.6} dir="b" />}
      {m.tone === 'block' && <Screentone color={inkC} opacity={0.07} size={4} dot={1} dir="t" />}
      {m.tone === 'glow' && (
        <LinearGradient
          colors={[rgba(id.accent, s.light ? 0.12 : 0.3), 'transparent', rgba(id.primary, s.light ? 0.1 : 0.26)]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Grain opacity={m.grain * (s.light ? 0.7 : 1)} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// COVER PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════

function Cover({ uri, style, radius = 8, border, blur = 0, tint }) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
      border && { borderWidth: 1.5, borderColor: border }, style]}
    >
      {!!uri && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          transition={260}
          blurRadius={blur}
          recyclingKey={uri}
        />
      )}
      {!!tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />}
    </View>
  );
}

function pick(covers, i) {
  const list = (covers || []).filter(Boolean);
  if (!list.length) return null;
  return list[i % list.length];
}

/**
 * The reduce-motion fallback for every stage below: one softly blurred cover,
 * a gentle one-shot fade, and the same vignette the full stage would use — no
 * loops, no parallax. Every Stage* export below calls its usual hooks first
 * (so hook order never changes across renders) and only branches to this
 * AFTER that, when `reduced` is true.
 */
function ReducedStage({ covers, s, w, h }) {
  const e = useEnter(900, Easing.out(Easing.quad));
  const scale = e.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: e, transform: [{ scale }] }]} pointerEvents="none">
      <Cover uri={pick(covers, 0)} radius={0} blur={10} style={{ width: w, height: h, opacity: 0.55 }} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(s.to, 0.55) }]} />
      <Vignette color={s.to} strength={s.veil + 0.1} />
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 1 — THE WALL
// Every cover the reader touched, built in three true depth planes: a blurred
// far wall, a mid wall, and sharp near cards that drift past the camera.
// ═════════════════════════════════════════════════════════════════════════
export function StageWall({ covers, s, id, w, h, reduced }) {
  const far = useLoop(21000);
  const mid = useLoop(15000);
  const near = useLoop(9500);

  const layer = (cols, scale, seed) => {
    const cw = (w / cols) * 1.08, ch = cw * 1.45;
    const rows = Math.ceil(h / ch) + 2;
    const r = rnd(seed);
    const tiles = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) tiles.push({ x, y, o: 0.55 + r() * 0.45 });
    return { cw, ch, tiles, scale };
  };
  const L = useMemo(() => ({
    far: layer(5, 1.05, 21),
    mid: layer(3, 1.14, 37),
  }), [w, h]);

  const nearCards = useMemo(() => {
    const r = rnd(53);
    return Array.from({ length: 4 }, (_, i) => ({
      x: r() * (w - 130), y: r() * (h - 260), size: 96 + r() * 46, rot: (r() - 0.5) * 18, i,
    }));
  }, [w, h]);

  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;

  const fx = far.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });
  const fy = far.interpolate({ inputRange: [0, 1], outputRange: [-18, 10] });
  const mx = mid.interpolate({ inputRange: [0, 1], outputRange: [26, -26] });
  const my = mid.interpolate({ inputRange: [0, 1], outputRange: [22, -30] });
  const ms = mid.interpolate({ inputRange: [0, 1], outputRange: [1.14, 1.22] });
  const ny = near.interpolate({ inputRange: [0, 1], outputRange: [24, -24] });
  const nx = near.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* far plane — blurred, dim, barely moving */}
      <Animated.View style={{ position: 'absolute', top: -L.far.ch, left: -L.far.cw / 2, transform: [{ translateX: fx }, { translateY: fy }, { scale: 1.06 }] }}>
        {L.far.tiles.map((t, i) => (
          <Cover key={i} uri={pick(covers, i * 3 + 1)} radius={2} blur={14}
            style={{ position: 'absolute', left: t.x * L.far.cw, top: t.y * L.far.ch, width: L.far.cw - 3, height: L.far.ch - 3, opacity: t.o * 0.5 }} />
        ))}
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(s.to, 0.4) }]} />

      {/* mid plane — the readable wall */}
      <Animated.View style={{ position: 'absolute', top: -L.mid.ch, left: -L.mid.cw / 2, transform: [{ translateX: mx }, { translateY: my }, { scale: ms }] }}>
        {L.mid.tiles.map((t, i) => (
          <Cover key={i} uri={pick(covers, i)} radius={3} blur={2}
            style={{ position: 'absolute', left: t.x * L.mid.cw, top: t.y * L.mid.ch, width: L.mid.cw - 6, height: L.mid.ch - 6, opacity: t.o * 0.78 }} />
        ))}
      </Animated.View>

      {/* near plane — sharp cards sliding past the lens */}
      {nearCards.map((c) => (
        <Animated.View key={c.i}
          style={{
            position: 'absolute', left: c.x, top: c.y, opacity: 0.9,
            transform: [{ translateY: ny }, { translateX: nx }, { rotate: `${c.rot}deg` }, { scale: 1 }],
          }}
        >
          <Cover uri={pick(covers, c.i * 2 + 3)} radius={6} border={rgba(s.ink, 0.35)} style={{ width: c.size, height: c.size * 1.45 }} />
        </Animated.View>
      ))}

      <Vignette color={s.to} strength={s.veil + 0.16} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE SEPARATION
// The wall breaks apart: covers lift off the page as individual cards at
// different depths, each on its own float, with a soft horizon behind them.
// ═════════════════════════════════════════════════════════════════════════
export function StageDrift({ covers, s, id, w, h, reduced }) {
  const cards = useMemo(() => {
    const r = rnd(33);
    return Array.from({ length: 9 }, (_, i) => ({
      x: r() * (w - 110) , y: r() * (h - 200), size: 56 + r() * 76,
      rot: (r() - 0.5) * 26, dur: 4200 + r() * 4200, depth: r(), i,
    }));
  }, [w, h]);
  const horizon = useLoop(13000);
  const hy = horizon.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] });
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', left: -w * 0.2, top: h * 0.3, width: w * 1.4, height: h * 0.5, transform: [{ translateY: hy }] }}>
        <LinearGradient colors={[rgba(s.accent, 0.28), 'transparent']} style={{ flex: 1, borderRadius: w }} />
      </Animated.View>
      {cards.map((c) => <DriftCard key={c.i} c={c} uri={pick(covers, c.i)} s={s} />)}
      <Vignette color={s.to} strength={s.veil} />
    </View>
  );
}
function DriftCard({ c, uri, s }) {
  const f = useLoop(c.dur, c.i * 190);
  const ty = f.interpolate({ inputRange: [0, 1], outputRange: [0, -22 - c.depth * 34] });
  const tx = f.interpolate({ inputRange: [0, 1], outputRange: [0, (c.i % 2 ? 12 : -12) * (0.4 + c.depth)] });
  const rot = f.interpolate({ inputRange: [0, 1], outputRange: [`${c.rot}deg`, `${c.rot + 4.5}deg`] });
  // Far cards are small, blurred and faint; near cards are big and sharp.
  const blur = c.depth < 0.4 ? 6 : 0;
  return (
    <Animated.View style={{ position: 'absolute', left: c.x, top: c.y, opacity: 0.34 + c.depth * 0.5, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }] }}>
      <Cover uri={uri} blur={blur} border={c.depth > 0.6 ? rgba(s.accent, 0.55) : null} radius={s.radius > 8 ? 12 : 4}
        style={{ width: c.size, height: c.size * 1.45 }} />
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 3 — IMPACT
// Covers implode to a point and blast outward as shards, behind concentric
// shockwave rings and lines converging on the number.
// ═════════════════════════════════════════════════════════════════════════
export function StageImpact({ covers, s, id, w, h, reduced }) {
  const e = useEnter(2300, Easing.out(Easing.quad));
  const pulse = useLoop(2600);
  const shards = useMemo(() => {
    const r = rnd(45);
    return Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + r() * 0.4;
      return { a, dist: 120 + r() * Math.max(w, h) * 0.55, size: 22 + r() * 52, rot: (r() - 0.5) * 160, i };
    });
  }, [w, h]);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] });
  const ringOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SpeedLines color={s.accent} opacity={0.3} count={70} cx={50} cy={44} hole={8} spin={90000} />
      {[0, 1, 2].map((k) => (
        <Animated.View key={k}
          style={{
            position: 'absolute', left: w / 2 - w * 0.45, top: h * 0.44 - w * 0.45,
            width: w * 0.9, height: w * 0.9, borderRadius: w * 0.45,
            borderWidth: 2, borderColor: s.accent, opacity: ringOp,
            transform: [{ scale: Animated.multiply(ringScale, 0.55 + k * 0.3) }],
          }}
        />
      ))}
      {shards.map((sh) => {
        const tx = e.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(sh.a) * sh.dist] });
        const ty = e.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(sh.a) * sh.dist] });
        const rot = e.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${sh.rot}deg`] });
        const op = e.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 0.95, 0.34] });
        const sc = e.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
        return (
          <Animated.View key={sh.i}
            style={{
              position: 'absolute', left: w / 2 - sh.size / 2, top: h * 0.44 - sh.size / 2,
              opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }, { scale: sc }],
            }}
          >
            <Cover uri={pick(covers, sh.i)} radius={2} style={{ width: sh.size, height: sh.size * 1.42 }} />
          </Animated.View>
        );
      })}
      <Vignette color={s.to} strength={s.veil} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 4 — HORIZON
// Day above, night below, with the reader's real peak hour deciding where the
// sun/moon sits on its arc. Covers form a skyline silhouette at the horizon.
// ═════════════════════════════════════════════════════════════════════════
export function StageHorizon({ covers, s, id, w, h, night, reduced }) {
  const travel = useLoop(15000);
  const band = useLoop(20000);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const HY = h * 0.52;
  const bodyX = travel.interpolate({ inputRange: [0, 1], outputRange: [w * 0.12, w * 0.82] });
  const bodyY = travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [HY * 0.72, HY * 0.24, HY * 0.72] });
  const bx = band.interpolate({ inputRange: [0, 1], outputRange: [-60, 20] });
  const glow = night ? mix(s.accent, '#9FC4FF', 0.6) : mix(s.accent, '#FFCE7A', 0.45);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* sky wash */}
      <LinearGradient
        colors={[rgba(glow, night ? 0.26 : 0.4), 'transparent']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HY + 40 }}
      />
      {/* the travelling body */}
      <Animated.View style={{ position: 'absolute', transform: [{ translateX: bodyX }, { translateY: bodyY }] }}>
        <View style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: glow, opacity: 0.9 }} />
        <View style={{ position: 'absolute', left: -46, top: -46, width: 166, height: 166, borderRadius: 83, backgroundColor: glow, opacity: 0.16 }} />
        {night && (
          // crescent bite, so the moon reads as a moon
          <View style={{ position: 'absolute', left: 20, top: -6, width: 66, height: 66, borderRadius: 33, backgroundColor: s.to, opacity: 0.95 }} />
        )}
      </Animated.View>

      {/* horizon rule */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: HY, height: 1.5, backgroundColor: rgba(s.ink, 0.35) }} />

      {/* cover skyline — a city of spines standing on the horizon */}
      <Animated.View style={{ position: 'absolute', top: HY, left: 0, flexDirection: 'row', alignItems: 'flex-start', transform: [{ translateX: bx }] }}>
        {Array.from({ length: 14 }).map((_, i) => {
          const tall = 70 + ((i * 37) % 90);
          return (
            <View key={i} style={{ width: 46, height: tall, marginRight: 5, overflow: 'hidden', opacity: 0.42 }}>
              <Cover uri={pick(covers, i)} radius={0} style={{ width: 46, height: tall }} tint={rgba(s.to, 0.45)} />
            </View>
          );
        })}
      </Animated.View>

      {/* night half */}
      <LinearGradient
        colors={['transparent', rgba(s.to, 0.86)]}
        style={{ position: 'absolute', left: 0, right: 0, top: HY - 20, bottom: 0 }}
      />
      <Vignette color={s.to} strength={s.veil * 0.7} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 5 — THE RUNWAY  (hero slide)
// A perspective corridor of covers receding to a vanishing point, plus a
// counter-rotating ring, so the top-series page has genuine 3D depth behind it.
// ═════════════════════════════════════════════════════════════════════════
export function StageRunway({ covers, s, id, w, h, reduced }) {
  const spin = useSpin(30000);
  const flow = useSpin(11000);
  const N = 10;
  const items = useMemo(() => Array.from({ length: N }, (_, i) => i), []);
  const lanes = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* corridor — covers rushing toward the viewer from the vanishing point */}
      {lanes.map((i) => {
        const p = flow.interpolate({ inputRange: [0, 1], outputRange: [i / 6, i / 6 + 1] });
        const sc = p.interpolate({ inputRange: [0, 1], outputRange: [0.16, 2.4], extrapolate: 'extend' });
        const op = p.interpolate({ inputRange: [0, 0.12, 0.72, 1], outputRange: [0, 0.42, 0.3, 0] });
        const ty = p.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.22] });
        return (
          <Animated.View key={`l${i}`}
            style={{
              position: 'absolute', left: w / 2 - 60, top: h * 0.4 - 88,
              opacity: op, transform: [{ translateY: ty }, { scale: sc }],
            }}
          >
            <Cover uri={pick(covers, i + 2)} radius={4} style={{ width: 120, height: 176 }} />
          </Animated.View>
        );
      })}

      {/* slow ring of covers in perspective */}
      {items.map((i) => {
        const base = (i / N) * 2 * Math.PI;
        const tx = spin.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [0, 0.5, 1, 1.5, 2].map((k) => Math.cos(base + k * Math.PI) * (w * 0.42)),
        });
        const sc = spin.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [0, 0.5, 1, 1.5, 2].map((k) => 0.5 + 0.45 * ((Math.sin(base + k * Math.PI) + 1) / 2)),
        });
        const op = spin.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [0, 0.5, 1, 1.5, 2].map((k) => 0.16 + 0.3 * ((Math.sin(base + k * Math.PI) + 1) / 2)),
        });
        const rotY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        return (
          <Animated.View key={i}
            style={{
              position: 'absolute', left: w / 2 - 56, top: h * 0.34,
              opacity: op, transform: [{ perspective: 800 }, { translateX: tx }, { scale: sc }, { rotateY: rotY }],
            }}
          >
            <Cover uri={pick(covers, i)} border={rgba(s.accent, 0.4)} style={{ width: 112, height: 162 }} />
          </Animated.View>
        );
      })}
      <Vignette color={s.to} strength={s.veil} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 6 — ORBIT
// Covers on concentric rings turning at different speeds, dissolving into
// coloured geometry as they go outward: art → shape → dot.
// ═════════════════════════════════════════════════════════════════════════
export function StageOrbit({ covers, s, id, w, h, reduced }) {
  const r1 = useSpin(48000);
  const r2 = useSpin(72000);
  const r3 = useSpin(96000);
  const breathe = useLoop(7200);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const CX = w / 2, CY = h * 0.42;
  const sc = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.06] });

  const ring = (rot, radius, count, render, reverse) => {
    const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
    return (
      <Animated.View
        style={{
          position: 'absolute', left: CX - radius, top: CY - radius, width: radius * 2, height: radius * 2,
          transform: [{ rotate }, { scale: sc }],
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const a = (i / count) * Math.PI * 2;
          return (
            <View key={i} style={{ position: 'absolute', left: radius + Math.cos(a) * radius, top: radius + Math.sin(a) * radius }}>
              {render(i, a)}
            </View>
          );
        })}
      </Animated.View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* inner ring — real covers */}
      {ring(r1, w * 0.3, 7, (i, a) => (
        <View style={{ marginLeft: -26, marginTop: -38, opacity: 0.5, transform: [{ rotate: `${(a * 180) / Math.PI + 90}deg` }] }}>
          <Cover uri={pick(covers, i)} radius={3} style={{ width: 52, height: 76 }} />
        </View>
      ))}
      {/* middle ring — covers reduced to colour chips */}
      {ring(r2, w * 0.46, 12, (i) => (
        <View style={{
          marginLeft: -13, marginTop: -13, width: 26, height: 26,
          borderRadius: id.mode.radius > 8 ? 13 : 2,
          backgroundColor: id.ramp[i % id.ramp.length], opacity: 0.45,
        }} />
      ), true)}
      {/* outer ring — pure dots */}
      {ring(r3, w * 0.62, 22, (i) => (
        <View style={{ marginLeft: -4, marginTop: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: s.ink, opacity: 0.24 }} />
      ))}
      <Vignette color={s.to} strength={s.veil} focus="center" />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 7 — PANEL GRID
// A real manga page: hard-edged panels with gutters, each carrying a cover,
// sliding in from alternating sides as the page "prints".
// ═════════════════════════════════════════════════════════════════════════
export function StagePanelGrid({ covers, s, id, w, h, reduced }) {
  const e = useEnter(1600, Easing.out(Easing.cubic));
  const breathe = useLoop(12000);
  const blocks = useMemo(() => ([
    { x: 0.0, y: 0.0, w: 0.58, h: 0.3 },
    { x: 0.6, y: 0.0, w: 0.4, h: 0.18 },
    { x: 0.6, y: 0.2, w: 0.4, h: 0.28 },
    { x: 0.0, y: 0.32, w: 0.58, h: 0.24 },
    { x: 0.0, y: 0.58, w: 0.44, h: 0.24 },
    { x: 0.46, y: 0.5, w: 0.54, h: 0.32 },
    { x: 0.0, y: 0.84, w: 1.0, h: 0.16 },
  ]), []);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const drift = breathe.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const gut = id.mode.gutter ? 5 : 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: drift }, { scale: 1.03 }] }]}>
        {blocks.map((b, i) => {
          const op = e.interpolate({ inputRange: [i * 0.09, Math.min(1, i * 0.09 + 0.4)], outputRange: [0, 0.52], extrapolate: 'clamp' });
          const tx = e.interpolate({ inputRange: [i * 0.09, Math.min(1, i * 0.09 + 0.4)], outputRange: [i % 2 ? 70 : -70, 0], extrapolate: 'clamp' });
          return (
            <Animated.View key={i}
              style={{
                position: 'absolute', left: b.x * w + gut, top: b.y * h + gut,
                width: b.w * w - gut * 2, height: b.h * h - gut * 2,
                opacity: op, transform: [{ translateX: tx }],
              }}
            >
              <Cover uri={pick(covers, i)} radius={id.mode.radius}
                border={id.mode.gutter ? rgba(s.ink, 0.6) : null}
                style={{ width: '100%', height: '100%' }} />
            </Animated.View>
          );
        })}
      </Animated.View>
      <Vignette color={s.to} strength={s.veil + 0.1} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 8 — CELEBRATION
// Radiating light, falling cover shards and colour flecks from the reader's
// own palette. The achievement page should feel like a curtain call.
// ═════════════════════════════════════════════════════════════════════════
export function StageCelebrate({ covers, s, id, w, h, reduced }) {
  const bits = useMemo(() => {
    const r = rnd(69);
    return Array.from({ length: 34 }, (_, i) => ({
      x: r() * w, size: 7 + r() * 17, dur: 3200 + r() * 3600, delay: r() * 2800,
      isCover: i % 4 === 0, colour: id.ramp[i % id.ramp.length], rot: r() * 360, i,
    }));
  }, [w, id.ramp]);
  const pulse = useLoop(3400);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rays color={s.accent} opacity={0.14} count={18} cx={50} cy={38} />
      <Animated.View
        style={{
          position: 'absolute', left: w / 2 - w * 0.5, top: h * 0.3 - w * 0.5,
          width: w, height: w, borderRadius: w / 2, backgroundColor: s.accent, opacity: 0.14,
          transform: [{ scale: glowScale }],
        }}
      />
      {bits.map((b) => <FallBit key={b.i} b={b} uri={b.isCover ? pick(covers, b.i) : null} h={h} radius={id.mode.radius > 8 ? 4 : 1} />)}
      <Vignette color={s.to} strength={s.veil} />
    </View>
  );
}
function FallBit({ b, uri, h, radius }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: b.dur, delay: b.delay, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, b]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-80, h + 50] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.rot + 620}deg`] });
  const tx = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 22, -14] });
  const op = v.interpolate({ inputRange: [0, 0.08, 0.86, 1], outputRange: [0, 0.95, 0.8, 0] });
  return (
    <Animated.View style={{ position: 'absolute', left: b.x, opacity: op, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }] }}>
      {uri
        ? <Cover uri={uri} radius={radius} style={{ width: b.size, height: b.size * 1.4 }} />
        : <View style={{ width: b.size, height: b.size * 0.42, borderRadius: radius, backgroundColor: b.colour }} />}
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 9 — EMBER
// A rising heat column whose intensity scales with the real streak length,
// with covers charring at the base and sparks lifting off them.
// ═════════════════════════════════════════════════════════════════════════
export function StageEmber({ covers, s, id, w, h, intensity = 0.5, reduced }) {
  // Two loops at deliberately unrelated periods, summed — a single loop
  // breathes mechanically, this reads as an actual fire's uneven flicker.
  const heat = useLoop(2400);
  const heat2 = useLoop(3700, 380);
  const count = Math.round(14 + intensity * 22);
  const embers = useMemo(() => {
    const r = rnd(57);
    return Array.from({ length: count }, (_, i) => ({
      x: r() * w, size: 4 + r() * (8 + intensity * 12), dur: 3200 + r() * 3600, delay: r() * 2800, i,
    }));
  }, [w, count, intensity]);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const base = heat.interpolate({ inputRange: [0, 1], outputRange: [0.5 + intensity * 0.25, 0.78 + intensity * 0.22] });
  const wobble = heat2.interpolate({ inputRange: [0, 1], outputRange: [-0.06, 0.06] });
  const flick = Animated.add(base, wobble);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SpeedLines color={s.accent} opacity={0.12 + intensity * 0.12} count={44} cx={50} cy={92} hole={4} spin={110000} />
      {/* the base of the fire — covers reduced to embers of themselves */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h * 0.3, flexDirection: 'row', opacity: 0.3 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Cover key={i} uri={pick(covers, i)} radius={0} blur={7} style={{ flex: 1, height: '100%' }} />
        ))}
      </View>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.62, opacity: flick }}>
        <LinearGradient colors={['transparent', rgba(s.accent, 0.34), rgba(s.accent, 0.6)]} style={{ flex: 1 }} />
      </Animated.View>
      {embers.map((em) => <Ember key={em.i} em={em} accent={s.accent} h={h} />)}
      <Vignette color={s.to} strength={s.veil} />
    </View>
  );
}
function Ember({ em, accent, h }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: em.dur, delay: em.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, em]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [h * 0.96, -70] });
  const op = v.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 0.95, 0.45, 0] });
  const tx = v.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [0, 20, -16, 8] });
  const sc = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: em.x, width: em.size, height: em.size, borderRadius: em.size / 2,
        backgroundColor: accent, opacity: op,
        transform: [{ translateY: ty }, { translateX: tx }, { scale: sc }],
      }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
// STAGE 10 — FINALE
// Everything the reader read assembles into one wall that keeps pushing in,
// crossed by a slow light sweep. The last frame of the opening sequence.
// ═════════════════════════════════════════════════════════════════════════
export function StageFinale({ covers, s, id, w, h, reduced }) {
  const e = useEnter(2800, Easing.out(Easing.cubic));
  const push = useLoop(18000);
  const sweep = useSpin(7000);
  const cols = 5;
  const cw = w / cols, ch = cw * 1.42;
  const rows = Math.ceil(h / ch) + 2;
  const tiles = useMemo(() => {
    const r = rnd(81);
    const out = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ x, y, d: r(), o: 0.45 + r() * 0.5 });
    return out;
  }, [rows]);
  if (reduced) return <ReducedStage covers={covers} s={s} w={w} h={h} />;
  const zoom = push.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.18] });
  const sx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.8, w * 1.4] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: -ch, left: 0, transform: [{ scale: zoom }] }}>
        {tiles.map((t, i) => {
          const inR = [Math.min(0.8, t.d * 0.75), Math.min(1, t.d * 0.75 + 0.25)];
          const op = e.interpolate({ inputRange: inR, outputRange: [0, t.o], extrapolate: 'clamp' });
          const sc = e.interpolate({ inputRange: inR, outputRange: [0.35, 1], extrapolate: 'clamp' });
          const rt = e.interpolate({ inputRange: inR, outputRange: ['16deg', '0deg'], extrapolate: 'clamp' });
          return (
            <Animated.View key={i}
              style={{ position: 'absolute', left: t.x * cw, top: t.y * ch, opacity: op, transform: [{ scale: sc }, { rotate: rt }] }}
            >
              <Cover uri={pick(covers, i)} radius={2} style={{ width: cw - 3, height: ch - 3 }} />
            </Animated.View>
          );
        })}
      </Animated.View>
      {/* light sweep across the finished wall */}
      <Animated.View style={{ position: 'absolute', top: -h * 0.2, width: w * 0.42, height: h * 1.4, transform: [{ translateX: sx }, { rotate: '14deg' }] }}>
        <LinearGradient
          colors={['transparent', rgba(s.ink, 0.14), 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Vignette color={s.to} strength={s.veil + 0.2} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// FOREGROUND KIT — the manga design language the content is drawn in
// ═════════════════════════════════════════════════════════════════════════

/**
 * A manga panel. In print/neo modes it has a hard black gutter border and a
 * slight tilt, like a pasted-up page; in webtoon mode it becomes a soft
 * floating card with a lift shadow instead.
 */
export function Panel({ s, id, style, children, tilt = 0, tone = 'plate' }) {
  const m = id.mode;
  return (
    <View
      style={[
        {
          backgroundColor: tone === 'clear' ? 'transparent' : s.plate,
          borderRadius: m.radius,
          borderWidth: tone === 'clear' ? 0 : m.border,
          borderColor: s.line,
          padding: 16,
          transform: [{ rotate: `${tilt * (m.tilt / 2.2 || 0)}deg` }],
        },
        m.lift > 0 && {
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: m.lift, shadowOffset: { width: 0, height: 10 }, elevation: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Misregistered print type — the display word is painted three times, offset
 * in the reader's own accent and alt, the way cheap four-colour manga printing
 * slips. This is what makes the headlines read as printed rather than typed.
 */
export function PrintText({ children, style, s, id, offset = 3, mono = false }) {
  const m = id.mode;
  // Webtoon has no misregistration — it is digital-native. It gets a glow.
  if (m.key === 'webtoon') {
    return (
      <Text style={[style, { textShadowColor: rgba(id.accent, 0.75), textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } }]}>
        {children}
      </Text>
    );
  }
  if (mono || m.key === 'inkwash') {
    return <Text style={style}>{children}</Text>;
  }
  return (
    <View>
      <Text style={[style, { position: 'absolute', left: -offset, top: offset * 0.6, color: id.accent, opacity: 0.85 }]}>{children}</Text>
      <Text style={[style, { position: 'absolute', left: offset, top: -offset * 0.6, color: id.alt, opacity: 0.7 }]}>{children}</Text>
      <Text style={style}>{children}</Text>
    </View>
  );
}

/** Speech bubble with a proper tail — the reader's own callouts. */
export function Bubble({ children, s, id, style, tail = 'left' }) {
  const bg = s.light ? '#FFFFFF' : rgba(s.ink, 0.12);
  const m = id.mode;
  return (
    <View style={[{
      backgroundColor: bg,
      borderWidth: m.key === 'webtoon' ? 0 : 2.5,
      borderColor: s.light ? s.line : rgba(s.ink, 0.5),
      borderRadius: m.key === 'webtoon' ? 22 : 18,
      paddingHorizontal: 17, paddingVertical: 13,
      alignSelf: 'flex-start', maxWidth: '100%',
    }, style]}
    >
      {children}
      <View style={{
        position: 'absolute', bottom: -13, [tail]: 28,
        width: 0, height: 0,
        borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 14,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: bg,
      }} />
    </View>
  );
}

/**
 * The vertical page rail — kanji numeral + mode mark running down the edge,
 * the way a printed volume marks its pages. Uses the system font, since the
 * brand display face carries no CJK glyphs.
 */
export function VerticalRail({ s, id, numeral, label }) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }} pointerEvents="none">
      <Text style={{ fontSize: 19, color: s.ink, opacity: 0.9, lineHeight: 23 }}>{numeral}</Text>
      <View style={{ width: 1, height: 26, backgroundColor: rgba(s.ink, 0.35) }} />
      <Text style={{ fontSize: 13, color: s.ink, opacity: 0.5, lineHeight: 17, letterSpacing: 2 }}>
        {String(id.mode.rail).split('').join('\n')}
      </Text>
      {!!label && (
        <>
          <View style={{ width: 1, height: 20, backgroundColor: rgba(s.ink, 0.28) }} />
          <Text style={{ fontSize: 8.5, color: s.ink, opacity: 0.45, letterSpacing: 1.5, lineHeight: 11, textAlign: 'center' }}>
            {String(label).split('').join('\n')}
          </Text>
        </>
      )}
    </View>
  );
}

/** Oversized ghost numeral sitting behind content — editorial page furniture. */
export function GhostNumeral({ text, s, style, size = 210 }) {
  const f = useLoop(9000);
  const ty = f.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  return (
    <Animated.Text
      style={[
        {
          position: 'absolute', fontFamily: 'MangaRecsBrand', fontSize: size, lineHeight: size * 1.02,
          color: s.ink, opacity: 0.075, letterSpacing: -size * 0.05,
        },
        style,
        { transform: [{ translateY: ty }] },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

/** Hanko-style seal stamp — used to certify the reader's title and the finale. */
export function Stamp({ text, color, size = 62, rotate = -11 }) {
  return (
    <View style={{ transform: [{ rotate: `${rotate}deg` }] }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x="4" y="4" width="92" height="92" rx="10" fill="none" stroke={color} strokeWidth="7" opacity={0.9} />
        <Rect x="14" y="14" width="72" height="72" rx="4" fill="none" stroke={color} strokeWidth="2.5" opacity={0.55} />
      </Svg>
      <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color, fontSize: size * 0.3, fontWeight: '900', letterSpacing: 1, textAlign: 'center', lineHeight: size * 0.33 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** Torn newsprint edge, for the top or bottom of a paper plate. */
export function TornEdge({ color, flip = false, height = 12 }) {
  return (
    <Svg
      width="100%" height={height}
      viewBox="0 0 100 12" preserveAspectRatio="none"
      style={[{ position: 'absolute', left: 0, right: 0 }, flip ? { bottom: -1, transform: [{ scaleY: -1 }] } : { top: -1 }]}
      pointerEvents="none"
    >
      <Path d="M0 0 L100 0 L100 4 L88 8 L74 3 L60 9 L46 4 L32 10 L18 5 L6 9 L0 6 Z" fill={color} />
    </Svg>
  );
}

/** Diagonal accent band — a poster device for kickers and labels. */
export function Band({ s, id, children, color, style }) {
  return (
    <View style={[{
      backgroundColor: color || s.accent,
      paddingHorizontal: 13, paddingVertical: 6,
      alignSelf: 'flex-start',
      borderRadius: id.mode.radius > 8 ? 999 : 0,
      transform: [{ rotate: `${-id.mode.tilt * 0.55}deg` }],
    }, style]}
    >
      {children}
    </View>
  );
}

/**
 * The cut between slides — deliberately different per print mode instead of
 * one generic wipe, so the transition itself is part of the reader's
 * identity: an ink blot for print, a scroll-snap curtain for webtoon (motion
 * matches how they actually read), a brush smear for inkwash, and a hard
 * diagonal wipe + flash for neo. `wipe` is the raw 0→1 Animated.Value driving
 * one slide change; all four branches consume it directly.
 */
export function TransitionCut({ id, s, wipe, w, h }) {
  const mode = id.modeKey;

  if (mode === 'print') {
    const scale = wipe.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 2.8, 2.8] });
    const opacity = wipe.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.92, 0.92, 0] });
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: w * 0.5 - 42, top: h * 0.42 - 42, width: 84, height: 84, borderRadius: 42,
          backgroundColor: s.ink, opacity, transform: [{ scale }],
        }}
      />
    );
  }

  if (mode === 'webtoon') {
    const ty = wipe.interpolate({ inputRange: [0, 1], outputRange: [-h * 0.6, h] });
    const opacity = wipe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.9, 0] });
    return (
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, height: h * 0.5, opacity, transform: [{ translateY: ty }] }}
      >
        <LinearGradient colors={['transparent', rgba(s.accent, 0.55), 'transparent']} style={{ flex: 1 }} />
      </Animated.View>
    );
  }

  if (mode === 'inkwash') {
    const tx = wipe.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.8, w * 1.5] });
    const opacity = wipe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 0.85, 0] });
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: h * 0.28, width: w * 0.65, height: h * 0.44,
          opacity, transform: [{ translateX: tx }, { rotate: '-7deg' }],
        }}
      >
        <InkBrush color={s.ink} opacity={1} seed={5} />
      </Animated.View>
    );
  }

  // neo / default — hard diagonal wipe bar + flash
  const wipeX = wipe.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.5, w * 1.35] });
  const flashOp = wipe.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.5, 0.12, 0] });
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: s.accent, opacity: flashOp }]} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -h * 0.2, left: -w * 0.5, width: w * 0.5, height: h * 1.4,
          backgroundColor: s.ink, opacity: 0.12, transform: [{ translateX: wipeX }, { rotate: '10deg' }],
        }}
      />
    </>
  );
}

export { useLoop, useSpin, useEnter, Cover, pick };
