import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { badgeName, badgeDesc } from '../utils/badgeText';
import { useT } from '../utils/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import BadgeIcon from './BadgeIcon';
import { BADGE_GRADES, PROGRESS_GRADES, badgeProgress, formatRarity } from '../utils/badges';

// Badge detail card: big shield, tier, 5-7 word description, rarity ("12.4% of
// readers have this"), progress bar when locked, and an optional pin button.
// Rendered inside a Modal (grid taps) or an absolute overlay (badge sheet taps).
export default function BadgeDetail({
  badge, earned, colors, stats,
  pinned = false, onTogglePin = null, canPin = true,
  onClose,
}) {
  const t = useT();
  if (!badge) return null;
  const grade = BADGE_GRADES[badge.grade] || BADGE_GRADES.grey;
  const rarity = formatRarity(badge);
  const prog = !earned && (PROGRESS_GRADES.has(badge.grade) || badge.image) ? badgeProgress(badge, stats || {}) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: earned ? grade.border : colors.border }]} onStartShouldSetResponder={() => true}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={16} color={colors.muted} />
      </TouchableOpacity>

      <BadgeIcon badge={badge} size={96} locked={!earned} />

      <Text style={[styles.name, { color: earned ? grade.color : colors.text }]}>{badgeName(badge)}</Text>
      <View style={[styles.tierChip, { backgroundColor: grade.bg, borderColor: grade.border }]}>
        <Text style={[styles.tierChipText, { color: grade.color }]}>{grade.label}</Text>
      </View>

      <Text style={[styles.desc, { color: colors.muted }]}>{badgeDesc(badge)}</Text>

      {rarity && (
        <View style={styles.rarityRow}>
          <Ionicons name="people" size={11} color={grade.color} />
          <Text style={[styles.rarityText, { color: grade.color }]}>{rarity}</Text>
        </View>
      )}

      {prog && (
        <View style={styles.progWrap}>
          <View style={[styles.progTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progFill, { width: `${Math.round(prog.pct * 100)}%`, backgroundColor: grade.color }]} />
          </View>
          <Text style={[styles.progText, { color: colors.muted }]}>
            {prog.current.toLocaleString()} / {prog.target.toLocaleString()}
          </Text>
        </View>
      )}

      {earned && onTogglePin && (
        <TouchableOpacity
          style={[styles.pinBtn, pinned
            ? { backgroundColor: 'rgba(123,92,255,0.14)', borderColor: colors.primary }
            : { backgroundColor: grade.bg, borderColor: grade.border },
            !pinned && !canPin && { opacity: 0.45 }]}
          onPress={() => (pinned || canPin) && onTogglePin(badge)}
          activeOpacity={0.8}>
          <Ionicons name={pinned ? 'remove-circle-outline' : 'add-circle-outline'} size={15} color={pinned ? colors.primary : grade.color} />
          <Text style={[styles.pinBtnText, { color: pinned ? colors.primary : grade.color }]}>
            {pinned ? 'Remove from profile' : canPin ? 'Add to profile' : 'Showcase full (3/3)'}
          </Text>
        </TouchableOpacity>
      )}
      {!earned && (
        <View style={styles.lockedRow}>
          <Ionicons name="lock-closed" size={11} color={colors.muted} />
          <Text style={[styles.lockedText, { color: colors.muted }]}>{t('badge.notEarned')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 320, borderRadius: 22, borderWidth: 1, alignItems: 'center', padding: 24, paddingTop: 28 },
  closeBtn: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  name: { fontSize: 19, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  tierChip: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  tierChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  desc: { fontSize: 13, marginTop: 12, textAlign: 'center', lineHeight: 19 },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  rarityText: { fontSize: 12, fontWeight: '700' },
  progWrap: { width: '100%', marginTop: 14, alignItems: 'center', gap: 5 },
  progTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 5, borderRadius: 3 },
  progText: { fontSize: 11, fontWeight: '600' },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, borderWidth: 1 },
  pinBtnText: { fontSize: 13, fontWeight: '700' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16 },
  lockedText: { fontSize: 11, fontWeight: '600' },
});
