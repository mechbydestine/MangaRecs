import { useRef, useEffect } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import { useReducedMotion } from '../utils/a11y';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path, Circle, G, Polygon,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';

// ── Tier visual config — medal ladder ────────────────────────────────────────
// grey=Bronze, green=Silver, blue=Gold, indigo=Platinum, purple=Diamond,
// gold=Master, mythic=Mythic. Stars 1..7 by tier — the 7th is Mythic-only.
// (Relic badges — badge.image — skip the star row entirely; their glow/motes/
// halo/crown, baked into the PNG at generation time, carry the tier instead.)

const TIER_STYLES = {
  grey:   { shield: ['#E3A06B', '#B06C33', '#6E3D18'], rim: ['#F0C299', '#C07A40'], inner: '#4A2A10', glow: null,      star: '#D08A4E', stars: 1 },
  green:  { shield: ['#E8ECF2', '#AAB4C4', '#5F6B7D'], rim: ['#F5F7FA', '#B8C2D0'], inner: '#39404D', glow: null,      star: '#C4CCD8', stars: 2 },
  blue:   { shield: ['#FBE08A', '#E8A921', '#8A5A0A'], rim: ['#FDF0BD', '#F0C04A'], inner: '#4D3305', glow: '#E8A921', star: '#F2B93B', stars: 3 },
  indigo: { shield: ['#B5F5EA', '#3EC9B5', '#116E60'], rim: ['#DCFCF6', '#5ADBC8'], inner: '#0B4A41', glow: '#3EC9B5', star: '#4ECDC0', stars: 4 },
  purple: { shield: ['#CFEAFF', '#5AA9F0', '#1E5A9E'], rim: ['#EAF6FF', '#86C5FA'], inner: '#123A66', glow: '#5AA9F0', star: '#7CC6FF', stars: 5 },
  gold:   { shield: ['#D9C2FF', '#8F5CF0', '#4A1FA0'], rim: ['#EFE2FF', '#A97CF8'], inner: '#2C1166', glow: '#8F5CF0', star: '#B48CFF', stars: 6 },
  mythic: { shield: ['#FF9EB0', '#E11D48', '#7A0F2E'], rim: ['#FFD4DC', '#FB7185'], inner: '#4C0519', glow: '#F43F5E', star: '#FF5C7A', stars: 7 },
};

const GRADE_RANK = { grey: 0, green: 1, blue: 2, indigo: 3, purple: 4, gold: 5, mythic: 6 };

// ── Vector icons per requirement type — three rungs so the icon itself grows
//    with the tier (low: outline, mid: solid, high: grander concept) ─────────

const TYPE_ICON_LADDER = {
  chapters:  ['book-outline', 'book', 'library'],
  hours:     ['time-outline', 'hourglass', 'infinite'],
  streak:    ['flame-outline', 'flame', 'bonfire'],
  series:    ['bookmarks-outline', 'albums', 'file-tray-full'],
  manga:     ['map-outline', 'earth', 'planet'],
  comments:  ['chatbubble-outline', 'chatbubbles', 'megaphone'],
  friends:   ['person-add-outline', 'people', 'people-circle'],
  likes:     ['heart-outline', 'heart', 'heart-circle'],
  completed: ['flag-outline', 'checkmark-done', 'trophy'],
  midnight:  ['moon-outline', 'moon', 'cloudy-night'],
  genres:    ['color-palette-outline', 'color-palette', 'prism'],
  shares:    ['share-social-outline', 'paper-plane', 'rocket'],
  ratings:   ['star-outline', 'star', 'ribbon'],
  account:   ['calendar-outline', 'calendar', 'medal'],
  special:   ['diamond-outline', 'diamond', 'skull'],
  binge:     ['flash-outline', 'flash', 'thunderstorm'],
  speed:     ['speedometer-outline', 'speedometer', 'rocket'],
  weekend:   ['sunny-outline', 'sunny', 'partly-sunny'],
  profile:   ['sparkles-outline', 'sparkles', 'sparkles'],
};

export function badgeIoniconName(badge) {
  const ladder = TYPE_ICON_LADDER[badge?.requirement?.type];
  if (!ladder) return 'ribbon';
  const rank = GRADE_RANK[badge?.grade] ?? 0;
  return ladder[rank <= 1 ? 0 : rank <= 4 ? 1 : 2];
}

// ── 4 permanent border frames — closed path fn (cx, cy, S), assigned by type ─

const SHAPES = {
  shield: (cx, cy, S) => {
    const p = S * 0.44;
    return `
      M ${cx} ${cy - S * 0.47}
      L ${cx + p} ${cy - S * 0.28}
      L ${cx + p} ${cy + S * 0.08}
      C ${cx + p} ${cy + S * 0.32} ${cx} ${cy + S * 0.47} ${cx} ${cy + S * 0.47}
      C ${cx} ${cy + S * 0.47} ${cx - p} ${cy + S * 0.32} ${cx - p} ${cy + S * 0.08}
      L ${cx - p} ${cy - S * 0.28}
      Z`;
  },
  panel: (cx, cy, S) => `
    M ${cx - S * 0.40} ${cy - S * 0.42}
    L ${cx + S * 0.22} ${cy - S * 0.42}
    L ${cx + S * 0.40} ${cy - S * 0.24}
    L ${cx + S * 0.40} ${cy + S * 0.42}
    L ${cx - S * 0.40} ${cy + S * 0.42}
    Z`,
  scroll: (cx, cy, S) => `
    M ${cx - S * 0.36} ${cy - S * 0.34}
    C ${cx - S * 0.18} ${cy - S * 0.44} ${cx + S * 0.18} ${cy - S * 0.44} ${cx + S * 0.36} ${cy - S * 0.34}
    L ${cx + S * 0.36} ${cy + S * 0.34}
    C ${cx + S * 0.18} ${cy + S * 0.44} ${cx - S * 0.18} ${cy + S * 0.44} ${cx - S * 0.36} ${cy + S * 0.34}
    Z`,
  medallion: (cx, cy, S) => {
    const r = S * 0.45;
    return `
      M ${cx} ${cy - r}
      A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}
      Z`;
  },
};

const TYPE_SHAPE = {
  // shield — guard/defense/mystery achievements
  streak:    'shield',
  midnight:  'shield',
  account:   'shield',
  profile:   'shield',
  special:   'shield',
  binge:     'shield',
  speed:     'shield',
  // panel — reading-progress, manga-panel feel
  chapters:  'panel',
  series:    'panel',
  // scroll — collection / journey / completion record
  manga:     'scroll',
  shares:    'scroll',
  genres:    'scroll',
  completed: 'scroll',
  // medallion — round, social/time
  hours:     'medallion',
  weekend:   'medallion',
  likes:     'medallion',
  ratings:   'medallion',
  friends:   'medallion',
  comments:  'medallion',
};

export function badgeShapeName(badge) {
  return TYPE_SHAPE[badge?.requirement?.type] || 'shield';
}

const HIGH_STAR_SHAPES = new Set(['shield']);

// ── Star row ─────────────────────────────────────────────────────────────────

function StarRow({ count, color, starSize, baseCx, baseCy }) {
  const spacing = starSize * 2.5;
  const totalW  = count * spacing - (spacing - starSize * 2);
  const startX  = baseCx - totalW / 2 + starSize;
  return (
    <G>
      {Array.from({ length: count }).map((_, i) => {
        const x = startX + i * spacing;
        const y = baseCy;
        const s = starSize;
        const pts = [
          x, y - s, x + s*0.37, y - s*0.12, x + s*0.95, y - s*0.12,
          x + s*0.60, y + s*0.45, x + s*0.73, y + s*1.05, x, y + s*0.68,
          x - s*0.73, y + s*1.05, x - s*0.60, y + s*0.45, x - s*0.95, y - s*0.12,
          x - s*0.37, y - s*0.12,
        ].join(' ');
        return <Polygon key={i} points={pts} fill={color} opacity={0.95} />;
      })}
    </G>
  );
}

// ── Lock overlay ──────────────────────────────────────────────────────────────

function LockOverlay({ cx, cy, S }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={S * 0.22} fill="black" opacity={0.65} />
      <Path
        d={`M ${cx - S*0.055} ${cy - S*0.01} L ${cx - S*0.055} ${cy - S*0.07} C ${cx - S*0.055} ${cy - S*0.14} ${cx + S*0.055} ${cy - S*0.14} ${cx + S*0.055} ${cy - S*0.07} L ${cx + S*0.055} ${cy - S*0.01}`}
        fill="none" stroke="white" strokeWidth={S * 0.022} strokeLinecap="round" opacity={0.9}
      />
      <Path
        d={`M ${cx - S*0.075} ${cy - S*0.01} L ${cx - S*0.075} ${cy + S*0.055} C ${cx - S*0.075} ${cy + S*0.095} ${cx + S*0.075} ${cy + S*0.095} ${cx + S*0.075} ${cy + S*0.055} L ${cx + S*0.075} ${cy - S*0.01} Z`}
        fill="white" opacity={0.9}
      />
      <Circle cx={cx} cy={cy + S * 0.03} r={S * 0.025} fill="rgba(0,0,0,0.5)" />
    </G>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BadgeIcon({ badge, size = 64, locked = false, isNew = false }) {
  const tier = TIER_STYLES[badge.grade] || TIER_STYLES.grey;
  const S  = size;
  const cx = S / 2;
  const cy = S / 2;
  const orig = `${cx},${cy}`;
  const isRelic = !!badge.image;

  const gId = `g_${badge.id}`;
  const rId = `r_${badge.id}`;
  const iId = `i_${badge.id}`;

  // ── Pulse animation for isNew ─────────────────────────────────────────────
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const reduced      = useReducedMotion();

  useEffect(() => {
    if (!isNew || locked) return;
    // Bounded to 3 iterations already, but a ring expanding out of a badge is
    // still motion the reader asked not to see. The badge's "new" state is
    // also carried by its own styling, so nothing is lost by holding still.
    if (reduced) return;
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
  }, [isNew, locked, reduced, pulseScale, pulseOpacity]);

  const pulseRing = isNew && !locked && (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: S * 0.5,
        borderWidth: S * 0.026,
        borderColor: tier.glow || tier.rim[1],
        opacity: pulseOpacity,
        transform: [{ scale: pulseScale }],
      }}
    />
  );

  // ── Relic badges: a pre-rendered image asset — glow/motes/halo/crown are
  //    already baked in per the relic's own fixed grade (see assets/badges/
  //    relics). No frame, no vector icon — the render IS the badge. ────────
  if (isRelic) {
    return (
      <View style={{ width: S, height: S }}>
        {pulseRing}
        <Image
          source={badge.image}
          style={{ width: S, height: S, opacity: locked ? 0.35 : 1 }}
          resizeMode="contain"
        />
        {locked && (
          <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
            <LockOverlay cx={cx} cy={cy} S={S} />
          </Svg>
        )}
      </View>
    );
  }

  // ── Framed badges: metal frame + tier-varied icon inside ─────────────────
  const shapeName = badgeShapeName(badge);
  const shape = SHAPES[shapeName](cx, cy, S);
  const iconName = badgeIoniconName(badge);
  const starY = HIGH_STAR_SHAPES.has(shapeName) ? cy + S * 0.16 : cy + S * 0.32;
  const iconLift = HIGH_STAR_SHAPES.has(shapeName) ? S * 0.18 : S * 0.12;

  return (
    <View style={{ width: S, height: S }}>
      {pulseRing}
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ opacity: locked ? 0.38 : 1 }}>
        <Defs>
          <LinearGradient id={gId} x1="30%" y1="0%" x2="70%" y2="100%">
            <Stop offset="0%"   stopColor={tier.shield[0]} />
            <Stop offset="50%"  stopColor={tier.shield[1]} />
            <Stop offset="100%" stopColor={tier.shield[2]} />
          </LinearGradient>
          <LinearGradient id={rId} x1="0%" y1="0%" x2="60%" y2="100%">
            <Stop offset="0%"   stopColor={tier.rim[0]} />
            <Stop offset="100%" stopColor={tier.rim[1]} />
          </LinearGradient>
          <LinearGradient id={iId} x1="20%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0%"   stopColor={tier.inner}      stopOpacity={0.95} />
            <Stop offset="100%" stopColor={tier.shield[2]}  stopOpacity={0.70} />
          </LinearGradient>
        </Defs>
        {tier.glow && [
          { sc: 1.08, op: 0.09 },
          { sc: 1.04, op: 0.14 },
          { sc: 1.01, op: 0.19 },
        ].map(({ sc, op }, idx) => (
          <Path key={idx} d={shape} fill={tier.glow} opacity={op} scale={sc} origin={orig} />
        ))}
        <Path d={shape} fill={`url(#${rId})`} />
        <Path d={shape} fill={`url(#${gId})`} scale={0.90} origin={orig} />
        <Path d={shape} fill={`url(#${iId})`} scale={0.76} origin={orig} />
        <Path
          d={`M ${cx - S * 0.22} ${cy - S * 0.30}
              C ${cx - S * 0.06} ${cy - S * 0.38} ${cx + S * 0.14} ${cy - S * 0.36} ${cx + S * 0.24} ${cy - S * 0.26}
              C ${cx + S * 0.10} ${cy - S * 0.20} ${cx - S * 0.12} ${cy - S * 0.22} ${cx - S * 0.22} ${cy - S * 0.30} Z`}
          fill="white"
          opacity={0.16}
        />
        {tier.stars > 0 && (
          <StarRow count={Math.min(tier.stars, 7)} color={tier.star} starSize={S * 0.038} baseCx={cx} baseCy={starY} />
        )}
        {badge.grade === 'mythic' && (
          <>
            <Path d={shape} fill="none" stroke={tier.rim[0]} strokeWidth={S*0.022} opacity={0.55} scale={1.06} origin={orig} />
            <Path d={shape} fill="none" stroke="#FF9EB0"    strokeWidth={S*0.010} opacity={0.30} scale={1.14} origin={orig} />
          </>
        )}
        {locked && <LockOverlay cx={cx} cy={cy} S={S} />}
      </Svg>
      {!locked && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, width: S, height: S,
            alignItems: 'center', justifyContent: 'center',
            paddingBottom: iconLift,
          }}
        >
          <Ionicons name={iconName} size={S * 0.28} color={tier.rim[0]} />
        </View>
      )}
    </View>
  );
}
