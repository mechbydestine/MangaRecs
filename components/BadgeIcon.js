import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import Svg, {
  Path, Circle, G, Polygon,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';

// ── Tier visual config ────────────────────────────────────────────────────────

const TIER_STYLES = {
  grey: {
    shield: ['#9ca3af', '#6b7280', '#4b5563'],
    rim:    ['#d1d5db', '#9ca3af'],
    inner:  '#374151',
    glow:   null,
    stars:  0,
  },
  green: {
    shield: ['#4ade80', '#16a34a', '#14532d'],
    rim:    ['#86efac', '#22c55e'],
    inner:  '#14532d',
    glow:   '#22c55e',
    stars:  1,
  },
  blue: {
    shield: ['#60a5fa', '#2563eb', '#1e3a8a'],
    rim:    ['#93c5fd', '#3b82f6'],
    inner:  '#1e3a8a',
    glow:   '#3b82f6',
    stars:  2,
  },
  indigo: {
    shield: ['#a5b4fc', '#6366f1', '#3730a3'],
    rim:    ['#c7d2fe', '#818cf8'],
    inner:  '#312e81',
    glow:   '#6366f1',
    stars:  3,
  },
  purple: {
    shield: ['#c084fc', '#7c3aed', '#4c1d95'],
    rim:    ['#e9d5ff', '#a855f7'],
    inner:  '#3b0764',
    glow:   '#a855f7',
    stars:  4,
  },
  gold: {
    shield: ['#fde68a', '#f59e0b', '#92400e'],
    rim:    ['#fef3c7', '#fbbf24'],
    inner:  '#451a03',
    glow:   '#f59e0b',
    stars:  5,
  },
  mythic: {
    shield: ['#fda4af', '#e11d48', '#881337'],
    rim:    ['#fecdd3', '#fb7185'],
    inner:  '#4c0519',
    glow:   '#f43f5e',
    stars:  5,
  },
};

// ── Emoji per requirement type ────────────────────────────────────────────────

const TYPE_EMOJI = {
  chapters:  '📖',
  streak:    '🔥',
  hours:     '⏳',
  series:    '📚',
  manga:     '🎌',
  comments:  '💬',
  friends:   '🤝',
  likes:     '❤️',
  completed: '🏆',
  midnight:  '🌙',
  genres:    '🎨',
  shares:    '📤',
  ratings:   '⭐',
  account:   '🗓️',
  special:   '💎',
  binge:     '⚡',
  speed:     '💨',
  weekend:   '☀️',
  profile:   '✨',
};

// ── Star row beneath shield ───────────────────────────────────────────────────

function StarRow({ count, rimColor, starSize, baseCx, baseCy }) {
  const spacing = starSize * 2.8;
  const totalW  = count * spacing - (spacing - starSize * 2);
  const startX  = baseCx - totalW / 2 + starSize;

  return (
    <G>
      {Array.from({ length: count }).map((_, i) => {
        const x = startX + i * spacing;
        const y = baseCy;
        const s = starSize;
        const pts = [
          x, y - s,
          x + s*0.37, y - s*0.12,
          x + s*0.95, y - s*0.12,
          x + s*0.60, y + s*0.45,
          x + s*0.73, y + s*1.05,
          x,          y + s*0.68,
          x - s*0.73, y + s*1.05,
          x - s*0.60, y + s*0.45,
          x - s*0.95, y - s*0.12,
          x - s*0.37, y - s*0.12,
        ].join(' ');
        return <Polygon key={i} points={pts} fill={rimColor} opacity={0.95} />;
      })}
    </G>
  );
}

// ── Lock overlay ──────────────────────────────────────────────────────────────

function LockOverlay({ cx, cy, S }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={S * 0.22} fill="black" opacity={0.65} />
      {/* shackle */}
      <Path
        d={`M ${cx - S*0.055} ${cy - S*0.01} L ${cx - S*0.055} ${cy - S*0.07} C ${cx - S*0.055} ${cy - S*0.14} ${cx + S*0.055} ${cy - S*0.14} ${cx + S*0.055} ${cy - S*0.07} L ${cx + S*0.055} ${cy - S*0.01}`}
        fill="none"
        stroke="white"
        strokeWidth={S * 0.022}
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* body */}
      <Path
        d={`M ${cx - S*0.075} ${cy - S*0.01} L ${cx - S*0.075} ${cy + S*0.055} C ${cx - S*0.075} ${cy + S*0.095} ${cx + S*0.075} ${cy + S*0.095} ${cx + S*0.075} ${cy + S*0.055} L ${cx + S*0.075} ${cy - S*0.01} Z`}
        fill="white"
        opacity={0.9}
      />
      <Circle cx={cx} cy={cy + S * 0.03} r={S * 0.025} fill="rgba(0,0,0,0.5)" />
    </G>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BadgeIcon({ badge, size = 64, locked = false, isNew = false }) {
  const tier    = TIER_STYLES[badge.grade] || TIER_STYLES.grey;
  const reqType = badge.requirement?.type || 'special';
  const emoji   = TYPE_EMOJI[reqType] || '🏅';

  const S  = size;
  const cx = S / 2;
  const cy = S / 2;
  const p  = S * 0.44;

  // Shield path centred in the viewBox
  const shield = `
    M ${cx} ${cy - S*0.47}
    L ${cx + p} ${cy - S*0.28}
    L ${cx + p} ${cy + S*0.08}
    C ${cx + p} ${cy + S*0.32} ${cx} ${cy + S*0.47} ${cx} ${cy + S*0.47}
    C ${cx} ${cy + S*0.47} ${cx - p} ${cy + S*0.32} ${cx - p} ${cy + S*0.08}
    L ${cx - p} ${cy - S*0.28}
    Z
  `;
  const orig = `${cx},${cy}`;

  // IDs must be unique per badge to avoid gradient collisions
  const gId  = `g_${badge.id}`;
  const rId  = `r_${badge.id}`;
  const iId  = `i_${badge.id}`;

  // ── Pulse animation for isNew ─────────────────────────────────────────────
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isNew || locked) return;
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
  }, [isNew, locked]);

  return (
    <View style={{ width: S, height: S }}>
      {/* isNew pulse ring — lives outside the SVG so it can overflow */}
      {isNew && !locked && (
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
      )}

      {/* SVG shield */}
      <Svg
        width={S}
        height={S}
        viewBox={`0 0 ${S} ${S}`}
        style={{ opacity: locked ? 0.38 : 1 }}
      >
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

        {/* Soft glow — layered semi-transparent paths (no SVG filter needed) */}
        {tier.glow && [
          { sc: 1.08, op: 0.09 },
          { sc: 1.04, op: 0.14 },
          { sc: 1.01, op: 0.19 },
        ].map(({ sc, op }, idx) => (
          <Path key={idx} d={shield} fill={tier.glow} opacity={op} scale={sc} origin={orig} />
        ))}

        {/* Metallic rim */}
        <Path d={shield} fill={`url(#${rId})`} />

        {/* Main metallic body */}
        <Path d={shield} fill={`url(#${gId})`} scale={0.90} origin={orig} />

        {/* Inner dark panel */}
        <Path d={shield} fill={`url(#${iId})`} scale={0.76} origin={orig} />

        {/* Shine highlights */}
        <Path
          d={`M ${cx - p*0.5} ${cy - S*0.40}
              C ${cx - p*0.15} ${cy - S*0.47}
                ${cx + p*0.28} ${cy - S*0.45}
                ${cx + p*0.50} ${cy - S*0.31}
              C ${cx + p*0.28} ${cy - S*0.21}
                ${cx - p*0.28} ${cy - S*0.23}
                ${cx - p*0.50} ${cy - S*0.40} Z`}
          fill="white"
          opacity={0.18}
        />
        <Path
          d={`M ${cx + p*0.3} ${cy + S*0.18}
              C ${cx + p*0.42} ${cy + S*0.28}
                ${cx + p*0.30} ${cy + S*0.38}
                ${cx}          ${cy + S*0.42}
              C ${cx + p*0.15} ${cy + S*0.35}
                ${cx + p*0.20} ${cy + S*0.22}
                ${cx + p*0.30} ${cy + S*0.18} Z`}
          fill="white"
          opacity={0.07}
        />

        {/* Stars */}
        {tier.stars > 0 && (
          <StarRow
            count={Math.min(tier.stars, 5)}
            rimColor={tier.rim[0]}
            starSize={S * 0.044}
            baseCx={cx}
            baseCy={cy + S * 0.34}
          />
        )}

        {/* Mythic double ring */}
        {badge.grade === 'mythic' && (
          <>
            <Path d={shield} fill="none" stroke={tier.rim[0]} strokeWidth={S*0.022} opacity={0.55} scale={1.06} origin={orig} />
            <Path d={shield} fill="none" stroke="#fda4af"    strokeWidth={S*0.010} opacity={0.30} scale={1.14} origin={orig} />
          </>
        )}

        {/* Lock overlay */}
        {locked && <LockOverlay cx={cx} cy={cy} S={S} />}
      </Svg>

      {/* Emoji rendered as native Text so it always renders correctly */}
      {!locked && (
        <Text
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: S,
            textAlign: 'center',
            top: cy - S * 0.225,
            fontSize: S * 0.37,
            lineHeight: S * 0.46,
          }}
        >
          {emoji}
        </Text>
      )}
    </View>
  );
}
