import { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useReducedMotion } from '../utils/a11y';

// Shimmering placeholder block. Compose these into screen-specific skeletons
// so loading states preview the real layout instead of showing a spinner.
export function Bone({ width = '100%', height = 14, radius = 8, style }) {
  const { isDark } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // A skeleton can be on screen for several seconds and there are usually
    // a dozen of them pulsing at once — exactly the kind of ambient motion
    // Reduce Motion exists to stop. Hold it at a readable mid-opacity so the
    // placeholder still reads as "loading" rather than as real, empty content.
    if (reduced) { pulse.setValue(0.7); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

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

// Profile tab placeholder — banner, avatar, name, the three stat cards, the
// badge row and the friends strip, in the same order and roughly the same
// boxes as the real screen. Without this the tab hydrates 20+ pieces of state
// from the network with no loading flag, so a cold start renders "0 chapters,
// 0 badges, no friends" as if the account were empty.
export function ProfileSkeleton() {
  return (
    <View style={{ paddingTop: 8 }}>
      <View style={styles.profileHeaderRow}>
        <Bone width={110} height={22} />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Bone width={24} height={24} radius={12} />
          <Bone width={24} height={24} radius={12} />
        </View>
      </View>

      <Bone width="100%" height={120} radius={0} style={{ marginTop: 12 }} />

      <View style={styles.profileIdentity}>
        <Bone width={84} height={84} radius={42} />
        <View style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Bone width={140} height={18} />
          <Bone width={90} height={12} />
          <Bone width={220} height={12} />
        </View>
      </View>

      <View style={styles.profileStatsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.profileStatCard}>
            <Bone width="55%" height={20} />
            <Bone width="80%" height={10} />
          </View>
        ))}
      </View>

      <View style={styles.profileSection}>
        <Bone width={130} height={13} />
        <View style={styles.profileBadgeRow}>
          {[0, 1, 2, 3, 4].map((i) => <Bone key={i} width={52} height={52} radius={26} />)}
        </View>
      </View>

      <View style={styles.profileSection}>
        <Bone width={100} height={13} />
        <View style={styles.profileBadgeRow}>
          {[0, 1, 2, 3].map((i) => <Bone key={i} width={56} height={72} radius={12} />)}
        </View>
      </View>
    </View>
  );
}

// For You placeholder — header, the taste radar, and two shelf rows. The pool
// is local so cards appear instantly, but the radar and the personalised
// shelves are network/AsyncStorage-derived and used to pop in over an empty
// frame.
export function ForYouSkeleton() {
  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Bone width={150} height={20} />
        <Bone width={230} height={12} />
      </View>

      <View style={styles.forYouRadar}>
        <Bone width={180} height={180} radius={90} />
      </View>

      {[0, 1].map((row) => (
        <View key={row} style={{ marginTop: 22 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <Bone width={140} height={14} />
          </View>
          <View style={styles.forYouShelf}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ gap: 6 }}>
                <Bone width={110} height={158} radius={12} />
                <Bone width={82} height={11} />
              </View>
            ))}
          </View>
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

  profileHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  profileIdentity:  { alignItems: 'center', marginTop: -34 },
  profileStatsRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 22 },
  profileStatCard:  { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16 },
  profileSection:   { paddingHorizontal: 20, marginTop: 26, gap: 12 },
  profileBadgeRow:  { flexDirection: 'row', gap: 12 },
  forYouRadar:      { alignItems: 'center', marginTop: 20 },
  forYouShelf:      { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 12 },
});
