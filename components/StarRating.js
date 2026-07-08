import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const GOLD = '#FFD700';

// Interactive 1-5 star row. Tap a star to rate; `value` is the user's own
// rating (0 = unrated). Renders solid/outline stars only — no half stars,
// since a tap always resolves to a whole number.
export function StarRatingInput({ value = 0, onRate, size = 20, color = GOLD, disabled = false }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          onPress={() => {
            if (disabled) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onRate?.(n);
          }}>
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={size}
            color={n <= value ? color : '#8A8894'}
            style={{ marginRight: 2 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Read-only average display — supports half stars, optional rating count.
export function StarRatingDisplay({ avg = 0, count = 0, size = 13, color = GOLD, mutedColor = '#8A8894', showCount = true }) {
  const rounded = Math.round(avg * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((n) => {
    if (rounded >= n) return 'star';
    if (rounded >= n - 0.5) return 'star-half';
    return 'star-outline';
  });
  return (
    <View style={styles.row}>
      {stars.map((name, i) => (
        <Ionicons key={i} name={name} size={size} color={name === 'star-outline' ? mutedColor : color} style={{ marginRight: 1 }} />
      ))}
      {showCount && (
        <Text style={[styles.countText, { color: mutedColor, fontSize: size * 0.75 }]}>
          {count > 0 ? ` ${avg.toFixed(1)} (${count})` : ' Not rated'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  countText: { marginLeft: 4, fontWeight: '600' },
});
