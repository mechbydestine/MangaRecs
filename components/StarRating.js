import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useT } from '../utils/LanguageContext';

const GOLD = '#FFD700';

// Interactive 10-point rating rendered as 5 stars (2 points per star, half-star
// granularity). `value` is the user's own rating on a 1-10 scale (0 = unrated).
// Tapping the left half of a star registers the odd (half-star) point, the
// right half registers the even (full-star) point.
export function StarRatingInput({ value = 0, onRate, size = 20, color = GOLD, disabled = false }) {
  const t = useT();
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n * 2;
        const half = !filled && value >= n * 2 - 1;
        return (
          <TouchableOpacity
            key={n}
            disabled={disabled}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.rateStars', { n })}
            accessibilityState={{ disabled, selected: filled }}
            onPress={(e) => {
              if (disabled) return;
              const x = Math.max(0, Math.min(size, e.nativeEvent.locationX));
              const points = x < size / 2 ? n * 2 - 1 : n * 2;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onRate?.(points);
            }}>
            <Ionicons
              name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
              size={size}
              color={filled || half ? color : '#8A8894'}
              style={{ marginRight: 2 }}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Read-only average display. `avg` is on the same 1-10 point scale as the
// input above; rendered as 5 (half-)stars, labeled as "x.x/10" so the shown
// number always matches what rating the user actually submitted.
// This is MangaRecs' own in-app reader rating — a separate number from the
// canon/curated rating shown on MangaDetailScreen (AniList-sourced). Both
// numbers can legitimately differ, so every place this renders gets an
// explicit "MangaRecs Readers" caption rather than looking like a mismatch
// or a duplicate of the canon score.
export function StarRatingDisplay({ avg = 0, count = 0, size = 13, color = GOLD, mutedColor = '#8A8894', showCount = true, showLabel = false }) {
  const t = useT();
  const starsEquiv = avg / 2;
  const rounded = Math.round(starsEquiv * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((n) => {
    if (rounded >= n) return 'star';
    if (rounded >= n - 0.5) return 'star-half';
    return 'star-outline';
  });
  return (
    <View>
      {showLabel && (
        <Text style={[styles.label, { color: mutedColor, fontSize: size * 0.7 }]}>{t('community.mangarecsReaders')}</Text>
      )}
      <View style={styles.row}>
        {stars.map((name, i) => (
          <Ionicons key={i} name={name} size={size} color={name === 'star-outline' ? mutedColor : color} style={{ marginRight: 1 }} />
        ))}
        {showCount && (
          <Text style={[styles.countText, { color: mutedColor, fontSize: size * 0.75 }]}>
            {count > 0 ? ` ${avg.toFixed(1)}/10 (${count})` : ' Not rated'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  countText: { marginLeft: 4, fontWeight: '600' },
  label: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
});
