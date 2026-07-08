import { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

// Shimmering placeholder block. Compose these into screen-specific skeletons
// so loading states preview the real layout instead of showing a spinner.
export function Bone({ width = '100%', height = 14, radius = 8, style }) {
  const { isDark } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width, height, borderRadius: radius,
          backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

// Full-screen feed card placeholder (cover + title + meta + action rail)
export function FeedCardSkeleton({ height }) {
  return (
    <View style={[styles.feedCard, height ? { height } : { flex: 1 }]}>
      <Bone width="100%" height="58%" radius={18} />
      <View style={{ marginTop: 16, gap: 10 }}>
        <Bone width="70%" height={22} />
        <Bone width="45%" height={13} />
        <Bone width="92%" height={12} />
        <Bone width="85%" height={12} />
      </View>
      <View style={styles.feedActionsRow}>
        {[0, 1, 2, 3].map((i) => <Bone key={i} width={40} height={40} radius={20} />)}
      </View>
    </View>
  );
}

// Row placeholder (avatar + two lines) — friends lists, DMs, discussions
export function RowSkeleton({ count = 5 }) {
  return (
    <View style={{ gap: 14, paddingHorizontal: 20, paddingTop: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Bone width={44} height={44} radius={22} />
          <View style={{ flex: 1, gap: 7 }}>
            <Bone width={`${55 + ((i * 13) % 30)}%`} height={13} />
            <Bone width={`${30 + ((i * 17) % 25)}%`} height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Grid of cover-shaped placeholders — library / recommendation shelves
export function CoverGridSkeleton({ count = 6, columns = 3 }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: `${100 / columns - 2}%`, gap: 6 }}>
          <Bone width="100%" height={150} radius={12} />
          <Bone width="80%" height={11} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feedCard: { padding: 20, paddingTop: 12 },
  feedActionsRow: { flexDirection: 'row', gap: 18, marginTop: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, justifyContent: 'space-between' },
});
