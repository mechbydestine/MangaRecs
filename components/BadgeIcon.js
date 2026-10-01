import { useRef, useEffect } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import { useReducedMotion } from '../utils/a11y';
import Svg, {
  Path, Circle, Line, G,
  Defs, LinearGradient, RadialGradient, Stop,
} from 'react-native-svg';
import { GRADE_ORDER, PROGRESS_GRADES } from '../utils/badges';

// ── The wreath token ─────────────────────────────────────────────────────────
// One shape for every badge: a dark disc carrying a bright emblem, ringed in
// tier metal, wrapped in a laurel wreath, gem at the crown. What changes with
// tier is the material — leaf count, a second wreath row, ring ticks, orbiting
// motes, glow strength, and at Mythic an iridescent sweep instead of a flat
// metal. The emblem itself is the badge's identity and never changes colour
// between tiers, so a Bronze and a Mythic chapters badge still read as kin.
//
// Deliberately no <filter>: react-native-svg can't render them, so every glow
// here is a radial-gradient disc, which also keeps this file portable to the
// website renderer (docs/assets/badgeToken.js) with the same geometry.

const TIERS = {
  grey:   { rim:'#E0A264', mid:'#B06C33', deep:'#5A3418', disc:'#1A1310', leaves:5, rows:1, bigGem:false, ticks:false, motes:0, glow:0.00, irid:false },
  green:  { rim:'#E8EEF6', mid:'#AAB4C4', deep:'#5A6475', disc:'#131519', leaves:6, rows:1, bigGem:false, ticks:false, motes:0, glow:0.10, irid:false },
  blue:   { rim:'#FBE08A', mid:'#E8A921', deep:'#8A5A0A', disc:'#191307', leaves:7, rows:1, bigGem:true,  ticks:false, motes:0, glow:0.18, irid:false },
  indigo: { rim:'#B5F5EA', mid:'#3EC9B5', deep:'#116E60', disc:'#091715', leaves:7, rows:1, bigGem:true,  ticks:true,  motes:0, glow:0.26, irid:false },
  purple: { rim:'#CFEAFF', mid:'#5AA9F0', deep:'#1E5A9E', disc:'#0A131D', leaves:8, rows:1, bigGem:true,  ticks:true,  motes:3, glow:0.34, irid:false },
  gold:   { rim:'#D9C2FF', mid:'#8F5CF0', deep:'#4A1FA0', disc:'#0F0A1B', leaves:8, rows:2, bigGem:true,  ticks:true,  motes:5, glow:0.42, irid:false },
  mythic: { rim:'#FFD4DC', mid:'#F43F5E', deep:'#7A0F2E', disc:'#17080E', leaves:9, rows:2, bigGem:true,  ticks:true,  motes:7, glow:0.52, irid:true  },
};

const CX = 50, CY = 50, RING = 36, DISC = 30, WREATH = 40;
const ANIM_RANK = 4; // Diamond and up — nothing below this is allowed to move

const n = (v) => Number(v.toFixed(2));

export function badgeRank(badge) {
  return Math.max(0, GRADE_ORDER.indexOf(badge?.grade));
}

// ── wreath geometry ──────────────────────────────────────────────────────────

function leaf(ax, ay, len, wid, dirDeg) {
  const r = (dirDeg * Math.PI) / 180;
  const dx = Math.cos(r), dy = Math.sin(r);
  const px = -dy, py = dx;
  const tx = ax + dx * len, ty = ay + dy * len;
  const mx = ax + dx * len * 0.52, my = ay + dy * len * 0.52;
  return `M${n(ax)} ${n(ay)}Q${n(mx + px * wid)} ${n(my + py * wid)} ${n(tx)} ${n(ty)}` +
         `Q${n(mx - px * wid)} ${n(my - py * wid)} ${n(ax)} ${n(ay)}Z`;
}

// side: 1 = left arm, -1 = mirrored right arm. Mirrored numerically rather than
// with an SVG transform so the geometry stays identical across renderers.
function arm(count, radius, lenBase, side) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const deg = 100 + t * 102;
    const rad = (deg * Math.PI) / 180;
    const ax = CX + side * radius * Math.cos(rad);
    const ay = CY + radius * Math.sin(rad);
    const k = (52 * Math.PI) / 180;
    const dx = -Math.sin(rad) * Math.cos(k) + Math.cos(rad) * Math.sin(k);
    const dy = Math.cos(rad) * Math.cos(k) + Math.sin(rad) * Math.sin(k);
    // mirroring across the vertical axis maps a direction angle to 180 - angle
    let dir = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (side < 0) dir = 180 - dir;
    const len = lenBase * (1 - 0.26 * t);
    d += leaf(ax, ay, len, len * 0.42, dir);
  }
  return d;
}

function branch(radius, side) {
  const a0 = (100 * Math.PI) / 180, a1 = (202 * Math.PI) / 180;
  const x0 = CX + side * radius * Math.cos(a0), y0 = CY + radius * Math.sin(a0);
  const x1 = CX + side * radius * Math.cos(a1), y1 = CY + radius * Math.sin(a1);
  return `M${n(x0)} ${n(y0)}A${radius} ${radius} 0 0 ${side > 0 ? 0 : 1} ${n(x1)} ${n(y1)}`;
}

function star4(cx, cy, s) {
  const w = s * 0.2;
  return `M${n(cx)} ${n(cy - s)}Q${n(cx + w)} ${n(cy - w)} ${n(cx + s)} ${n(cy)}` +
         `Q${n(cx + w)} ${n(cy + w)} ${n(cx)} ${n(cy + s)}` +
         `Q${n(cx - w)} ${n(cy + w)} ${n(cx - s)} ${n(cy)}` +
         `Q${n(cx - w)} ${n(cy - w)} ${n(cx)} ${n(cy - s)}Z`;
}

function gemPath(cx, cy, s) {
  return `M${n(cx)} ${n(cy - s)}L${n(cx + s * 0.72)} ${n(cy)}L${n(cx)} ${n(cy + s)}L${n(cx - s * 0.72)} ${n(cy)}Z`;
}

function burst(cx, cy, outer, inner, points) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

// ── emblem library ───────────────────────────────────────────────────────────
// Keyed by requirement.type, overridable per-badge via `badge.emblem`. Each is
// a function of (E, D, W): E = emblem colour, D = disc colour for knocked-out
// detail, W = white highlight. Authored in the 100x100 token space.

const EMBLEMS = {
  // reading ------------------------------------------------------------------
  chapters: (E, D) => (<>
    <Path d="M50 42C46 38.5 40 37 34 37.5L34 58.5C40 58 46 59.5 50 62Z" fill={E} />
    <Path d="M50 42C54 38.5 60 37 66 37.5L66 58.5C60 58 54 59.5 50 62Z" fill={E} />
    <Path d="M38 43.5h8M38 48h9M38 52.5h7M54 43.5h8M53 48h9M55 52.5h7" stroke={D} strokeWidth={1.3} strokeLinecap="round" />
  </>),
  hours: (E, D, W) => (<>
    <Path d="M37 33h26v2.6H37Zm0 31.4h26V67H37Z" fill={E} />
    <Path d="M39.5 35.6h21c0 7-6.2 10.6-10.5 14.4-4.3-3.8-10.5-7.4-10.5-14.4Z" fill={E} />
    <Path d="M39.5 64.4h21c0-7-6.2-10.6-10.5-14.4-4.3 3.8-10.5 7.4-10.5 14.4Z" fill={E} />
    <Path d={star4(50, 50, 3.8)} fill={W} />
  </>),
  streak: (E, D) => (<>
    <Path d="M50 32c2.5 7.5 8 10 9.5 16.5 1.6 7-2.5 14.5-9.5 14.5s-11-6-9.4-13c1.1-4.8 3.9-7 5-10.8 1.6 2.7 2.1 5.3 2.6 7 1.1-4.3 1.6-9.3 1.8-14.2Z" fill={E} />
    <Path d="M50 47.5c1.7 3 3.2 5 3.2 8 0 3.6-1.6 5.6-3.2 5.6s-3.2-2-3.2-5.3c0-3 1.6-5.2 3.2-8.3Z" fill={D} />
  </>),
  series: (E) => (<>
    <Path d="M34 35h8v24l-4-5-4 5Z" fill={E} opacity={0.75} />
    <Path d="M58 35h8v24l-4-5-4 5Z" fill={E} opacity={0.75} />
    <Path d="M45.5 30h9v32l-4.5-5.5-4.5 5.5Z" fill={E} />
  </>),
  manga: (E, D) => (<>
    <Path d="M28 55h44v9H28Z" fill={E} /><Path d="M35 55h37v9H35Z" fill={D} opacity={0.28} />
    <Path d="M31 44.5h38v9H31Z" fill={E} /><Path d="M37.5 44.5h31.5v9H37.5Z" fill={D} opacity={0.28} />
    <Path d="M34 34h32v9H34Z" fill={E} /><Path d="M40 34h26v9H40Z" fill={D} opacity={0.28} />
    <Path d="M31.5 57.5v4M34.5 47v4M37.5 36.5v4" stroke={D} strokeWidth={1.6} strokeLinecap="round" />
  </>),
  completed: (E, D) => (<>
    <Path d="M34 33h28a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H34Z" fill={E} />
    <Path d="M34 33h5v34h-5Z" fill={D} opacity={0.35} />
    <Circle cx={53} cy={50} r={7.5} fill={D} opacity={0.5} />
    <Path d={burst(53, 50, 6, 2.6, 5)} fill={E} />
  </>),
  midnight: (E) => (<>
    <Path d="M58 36c-7.6 1.3-13.4 7.6-13.4 15.2S50.4 65 58 66.3c-5.7-3.4-9-9-9-15.1S52.3 39.4 58 36Z" fill={E} />
    <Path d={star4(63, 39, 4)} fill={E} opacity={0.9} />
    <Path d={star4(66, 48.5, 2.4)} fill={E} opacity={0.6} />
  </>),
  // social -------------------------------------------------------------------
  comments: (E, D) => (<>
    <Path d="M38 36h24a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H48l-9.5 7.5 2-7.5H38a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6Z" fill={E} />
    <Circle cx={43} cy={47} r={2.1} fill={D} /><Circle cx={50} cy={47} r={2.1} fill={D} /><Circle cx={57} cy={47} r={2.1} fill={D} />
  </>),
  likes: (E, D, W) => (<>
    <Path d="M50 64C37 55 31.5 48 31.5 41.4 31.5 36 35.8 32.2 40.6 32.2c3.9 0 7.3 2.3 9.4 6 2.1-3.7 5.5-6 9.4-6 4.8 0 9.1 3.8 9.1 9.2 0 6.6-5.5 13.6-18.5 22.6Z" fill={E} />
    <Path d="M40 36.5c2.3-.3 4.4.5 6 2.3" stroke={W} strokeWidth={1.7} fill="none" strokeLinecap="round" opacity={0.45} />
  </>),
  friends: (E, D) => (<>
    <Circle cx={59} cy={42} r={6.5} fill={E} opacity={0.72} />
    <Path d="M47 64c0-7.5 5-12 12-12s12 4.5 12 12Z" fill={E} opacity={0.72} />
    <Circle cx={42} cy={44} r={7.5} fill={E} />
    <Path d="M28 65c0-8.5 6-13.5 14-13.5S56 56.5 56 65Z" fill={E} />
    <Path d="M52 51.5a13 13 0 0 1 4 6" stroke={D} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.6} />
  </>),
  shares: (E) => (<>
    <Path d="M70 31 32 46.5 46.5 52Z" fill={E} />
    <Path d="M70 31 46.5 52 49.5 67Z" fill={E} opacity={0.75} />
    <Path d="M26 54h9M24 60h11" stroke={E} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
  </>),
  // taste --------------------------------------------------------------------
  ratings: (E, D) => (<>
    <Path d="M36 35h28a3.5 3.5 0 0 1 3.5 3.5v23A3.5 3.5 0 0 1 64 65H36a3.5 3.5 0 0 1-3.5-3.5v-23A3.5 3.5 0 0 1 36 35Z" fill={E} />
    <Path d={burst(50, 50, 10.5, 4.4, 5)} fill={D} />
    <Path d="M33 31.5c6-2 28-2 34 0" stroke={E} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />
  </>),
  genres: (E, D) => (<>
    <Path d="M50 30 67 43 59.5 66h-19L33 43Z" fill={E} />
    <Path d="M50 30v36M33 43h34M50 66 33 43M50 66 67 43" stroke={D} strokeWidth={1.3} opacity={0.75} />
  </>),
  // identity / time ----------------------------------------------------------
  // the portal you stepped through — days since you arrived
  account: (E, D, W) => (<>
    <Path d="M34 66V46a16 16 0 0 1 32 0v20Z" fill={E} />
    <Path d="M40.5 66V46a9.5 9.5 0 0 1 19 0v20Z" fill={D} />
    <Path d="M44.5 66V46.5a5.5 5.5 0 0 1 11 0V66Z" fill={E} opacity={0.3} />
    <Path d={star4(50, 52, 5.5)} fill={W} />
    <Path d="M30 67.5h40" stroke={E} strokeWidth={2.6} strokeLinecap="round" />
  </>),
  profile: (E, D) => (<>
    <Path d="M50 30c10 0 16.5 7 16.5 16.5 0 11.5-7 22.5-16.5 24.5-9.5-2-16.5-13-16.5-24.5C33.5 37 40 30 50 30Z" fill={E} />
    <Path d="M39 46c2-3.2 6.5-3.2 8.5 0-2 3.2-6.5 3.2-8.5 0ZM52.5 46c2-3.2 6.5-3.2 8.5 0-2 3.2-6.5 3.2-8.5 0Z" fill={D} />
    <Path d="M46 58c2.5 1.6 5.5 1.6 8 0" stroke={D} strokeWidth={1.8} fill="none" strokeLinecap="round" />
  </>),
  // bursts -------------------------------------------------------------------
  special: (E, D, W) => (<>
    <Path d={star4(50, 49, 19)} fill={E} />
    <Path d={star4(50, 49, 9)} fill={W} opacity={0.55} />
    <Path d={star4(34, 36, 5)} fill={E} opacity={0.7} />
    <Path d={star4(66, 60, 4)} fill={E} opacity={0.55} />
  </>),
  binge: (E, D) => (<>
    <Path d={burst(50, 49, 20, 8.5, 9)} fill={E} />
    <Path d={burst(50, 49, 9, 3.6, 9)} fill={D} opacity={0.55} />
  </>),
  speed: (E) => (
    <Path d="M55 29 35 53h11l-3 18 20-24H52Z" fill={E} />
  ),
  weekend: (E) => (<>
    <Circle cx={41} cy={49} r={9} fill={E} />
    <Path d="M41 34v4.5M41 59.5V64M26 49h4.5M51.5 49H56M30.5 38.5l3 3M51.5 56.5l-3-3M30.5 59.5l3-3M51.5 41.5l-3 3" stroke={E} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    <Path d="M68 36c-6 2-10 7.5-10 13.5S62 61 68 63c-4-3.5-6.5-8-6.5-13.5S64 39.5 68 36Z" fill={E} opacity={0.85} />
  </>),
};

export function badgeEmblemKey(badge) {
  const k = badge?.emblem || badge?.requirement?.type;
  return EMBLEMS[k] ? k : 'special';
}

// ── component ────────────────────────────────────────────────────────────────

export default function BadgeIcon({ badge, size = 64, locked = false, isNew = false }) {
  const rank = badgeRank(badge);
  const tier = TIERS[badge?.grade] || TIERS.grey;
  const S = size;
  const reduced = useReducedMotion();

  // Below Diamond nothing animates — not the unlock pulse, not the ceremony.
  const mayAnimate = rank >= ANIM_RANK && !reduced;
  // Small renders drop the ornament layers; the silhouette has to survive, the
  // filigree doesn't (a 9-leaf double wreath at 32px is just noise).
  const detail = S >= 48;

  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isNew || locked || !mayAnimate) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale,   { toValue: 1.6,  duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseScale,   { toValue: 1,    duration: 0,    useNativeDriver: true }),
          Animated.delay(500),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.75, duration: 120,  useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,    duration: 880,  useNativeDriver: true }),
          Animated.delay(500),
        ]),
      ]),
      { iterations: 3 }
    );
    loop.start();
    return () => loop.stop();
  }, [isNew, locked, mayAnimate, pulseScale, pulseOpacity]);

  const pulseRing = isNew && !locked && mayAnimate && (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: S * 0.5,
        borderWidth: S * 0.026,
        borderColor: tier.rim,
        opacity: pulseOpacity,
        transform: [{ scale: pulseScale }],
      }}
    />
  );

  // Relic badges are pre-rendered art — the render IS the badge, no frame.
  if (badge?.image) {
    return (
      <View style={{ width: S, height: S }}>
        {pulseRing}
        <Image
          source={badge.image}
          style={{ width: S, height: S, opacity: locked ? 0.35 : 1 }}
          resizeMode="contain"
        />
        {locked && (
          <Svg width={S} height={S} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Circle cx={CX} cy={CY} r={22} fill="#05060A" opacity={0.6} />
            <Path d="M44 48h12v11H44Z" fill="#9AA0AD" />
            <Path d="M46.5 48v-3.5a3.5 3.5 0 0 1 7 0V48" stroke="#9AA0AD" strokeWidth={2} fill="none" strokeLinecap="round" />
          </Svg>
        )}
      </View>
    );
  }

  // Locked has two registers: the tiers that already advertise progress stay
  // readable (you can see what you're chasing), everything Platinum and up goes
  // to near-black silhouette so it keeps its mystery until it's earned.
  const mystery = locked && !PROGRESS_GRADES.has(badge?.grade);
  const rim  = locked ? (mystery ? '#3A3F48' : '#6B727E') : tier.rim;
  const mid  = locked ? (mystery ? '#2A2E35' : '#4A515C') : tier.mid;
  const deep = locked ? '#1A1D22' : tier.deep;
  const disc = locked ? '#101216' : tier.disc;
  const emb  = locked ? (mystery ? '#272B31' : '#555C67') : tier.rim;
  const white = locked ? emb : '#FFFFFF';

  const uid = `${badge?.id || 'b'}`.replace(/[^a-zA-Z0-9]/g, '');
  const gGlow = `bg${uid}`, gDisc = `bd${uid}`, gRing = `br${uid}`, gBloom = `bb${uid}`, gIrid = `bi${uid}`;
  const iridFill = tier.irid && !locked ? `url(#${gIrid})` : null;

  const rows = detail ? tier.rows : 1;
  const leafCount = detail ? tier.leaves : Math.min(tier.leaves, 5);
  const Emblem = EMBLEMS[badgeEmblemKey(badge)];

  const wreath = [];
  for (let r = 0; r < rows; r++) {
    const rad = WREATH - r * 5;
    const col = r === 0 ? (iridFill || rim) : mid;
    const op = r === 0 ? 0.95 : 0.6;
    for (const side of [1, -1]) {
      wreath.push(
        <Path key={`b${r}${side}`} d={branch(rad, side)} stroke={r === 0 ? rim : mid}
              strokeWidth={r === 0 ? 1.6 : 1} fill="none" opacity={op * 0.85} strokeLinecap="round" />,
        <Path key={`l${r}${side}`} d={arm(leafCount - r * 2, rad, 13 - r * 3.5, side)} fill={col} opacity={op} />
      );
    }
  }

  const tieY = CY + WREATH * Math.sin((100 * Math.PI) / 180);
  const ticks = [];
  if (tier.ticks && detail && !mystery) {
    for (let a = -70; a <= 70; a += 14) {
      const rad = ((a - 90) * Math.PI) / 180;
      ticks.push(
        <Line key={a}
          x1={n(CX + Math.cos(rad) * (RING - 3))} y1={n(CY + Math.sin(rad) * (RING - 3))}
          x2={n(CX + Math.cos(rad) * (RING + 1.5))} y2={n(CY + Math.sin(rad) * (RING + 1.5))}
          stroke={rim} strokeWidth={1} opacity={0.55} />
      );
    }
  }

  const motes = [];
  if (!locked && detail) {
    for (let i = 0; i < tier.motes; i++) {
      const a = (i / tier.motes) * Math.PI * 2 + 0.7;
      const rr = RING + 4 + (i % 2) * 3.5;
      motes.push(
        <Circle key={i} cx={n(CX + Math.cos(a) * rr)} cy={n(CY + Math.sin(a) * rr)}
                r={i % 2 ? 0.9 : 1.5} fill={rim} opacity={0.75} />
      );
    }
  }

  const gy = CY - RING;

  return (
    <View style={{ width: S, height: S }}>
      {pulseRing}
      <Svg width={S} height={S} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gGlow} cx="50%" cy="50%" r="50%">
            <Stop offset="55%" stopColor={rim} stopOpacity={locked ? 0 : tier.glow} />
            <Stop offset="100%" stopColor={rim} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={gDisc} cx="38%" cy="30%" r="80%">
            <Stop offset="0%" stopColor={deep} stopOpacity={locked ? 0.5 : 0.95} />
            <Stop offset="55%" stopColor={disc} stopOpacity={1} />
            <Stop offset="100%" stopColor="#05060A" stopOpacity={1} />
          </RadialGradient>
          <LinearGradient id={gRing} x1="20%" y1="0%" x2="80%" y2="100%">
            {tier.irid && !locked ? (<>
              <Stop offset="0%"   stopColor="#FFF3F8" />
              <Stop offset="22%"  stopColor="#FFB3C6" />
              <Stop offset="45%"  stopColor="#C77CF0" />
              <Stop offset="68%"  stopColor="#7CD9F0" />
              <Stop offset="86%"  stopColor="#F0C97C" />
              <Stop offset="100%" stopColor={deep} />
            </>) : (<>
              <Stop offset="0%"   stopColor={rim} />
              <Stop offset="50%"  stopColor={mid} />
              <Stop offset="100%" stopColor={deep} />
            </>)}
          </LinearGradient>
          <LinearGradient id={gIrid} x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%"   stopColor="#FFB3C6" />
            <Stop offset="35%"  stopColor="#C77CF0" />
            <Stop offset="70%"  stopColor="#7CD9F0" />
            <Stop offset="100%" stopColor="#FFE9A8" />
          </LinearGradient>
          <RadialGradient id={gBloom} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={rim} stopOpacity={locked ? 0 : 0.3} />
            <Stop offset="100%" stopColor={rim} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Circle cx={CX} cy={CY} r={49} fill={`url(#${gGlow})`} />
        {tier.irid && !locked && detail && (
          <Circle cx={CX} cy={CY} r={RING + 5.5} fill="none" stroke={rim}
                  strokeWidth={0.9} strokeDasharray="2.5,3.5" opacity={0.55} />
        )}
        {motes}
        {wreath}
        {detail && (<>
          <Path d={`M44 ${n(tieY - 2.6)}h12a2.6 2.6 0 0 1 0 5.2H44a2.6 2.6 0 0 1 0-5.2Z`} fill={iridFill || rim} opacity={0.95} />
          <Path d={`M47 ${n(tieY + 2.4)}l-3 5.5M53 ${n(tieY + 2.4)}l3 5.5`} stroke={rim} strokeWidth={1.7} strokeLinecap="round" opacity={0.8} />
        </>)}

        <Circle cx={CX} cy={CY} r={RING} fill="none" stroke={`url(#${gRing})`} strokeWidth={3.4} />
        {ticks}
        <Circle cx={CX} cy={CY} r={DISC} fill={`url(#${gDisc})`} />
        <Circle cx={CX} cy={CY} r={DISC} fill="none" stroke={mid} strokeWidth={0.8} opacity={0.5} />
        <Circle cx={CX} cy={CY} r={23} fill={`url(#${gBloom})`} />

        <G transform="translate(50,50) scale(0.84) translate(-50,-50)">
          {Emblem(emb, disc, white)}
        </G>

        <Path d="M34 31C40 25 60 25 66 31 57 27.5 43 27.5 34 31Z" fill="#fff" opacity={locked ? 0.04 : 0.1} />

        {tier.bigGem ? (<>
          <Path d={gemPath(CX, gy, 7)} fill={iridFill || rim} />
          <Path d={`M${CX} ${n(gy - 7)}L${n(CX + 5)} ${gy}L${CX} ${n(gy + 7)}Z`} fill={mid} opacity={0.55} />
          <Path d={`M${n(CX - 5)} ${gy}L${CX} ${n(gy - 2.4)}L${n(CX + 5)} ${gy}L${CX} ${n(gy + 2.4)}Z`} fill={deep} opacity={0.45} />
        </>) : (<>
          <Path d={gemPath(CX, gy, 5)} fill={mid} />
          <Path d={gemPath(CX, gy, 2.2)} fill={deep} opacity={0.5} />
        </>)}

        {locked && (<>
          <Path d="M45 55h10v9H45Z" fill={mystery ? '#4A515C' : '#9AA0AD'} />
          <Path d="M47 55v-3a3 3 0 0 1 6 0v3" stroke={mystery ? '#4A515C' : '#9AA0AD'} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>)}
      </Svg>
    </View>
  );
}
