import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { badgeDisplayName, badgeDisplayDesc, isMasked } from '../utils/badgeText';
import { useT } from '../utils/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import BadgeIcon from './BadgeIcon';
import { BADGE_GRADES, PROGRESS_GRADES, badgeProgress, formatRarity, nextInLine } from '../utils/badges';

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
  // A rarity line on a masked badge still tells you how hard it is, which is
  // most of what the mask is hiding.
  const rarity = isMasked(badge, earned) ? null : formatRarity(badge);
  const prog = !earned && (PROGRESS_GRADES.has(badge.grade) || badge.image) ? badgeProgress(badge, stats || {}) : null;

  // What this badge leads to. Shown dimmed so the line reads as a progression
  // rather than a wall of unrelated tokens — but only once this rung is in
  // hand, otherwise it's two locked badges stacked on each other.
  const next = earned ? nextInLine(badge) : null;
  const nextGrade = next ? (BADGE_GRADES[next.grade] || BADGE_GRADES.grey) : null;
  const nextProg = next ? badgeProgress(next, stats || {}) : null;
  const remaining = nextProg ? Math.max(0, nextProg.target - nextProg.current) : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: earned ? grade.border : colors.border }]} onStartShouldSetResponder={() => true}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Ionicons name="close" size={16} color={colors.muted} />
      </TouchableOpacity>

      <BadgeIcon badge={badge} size={96} locked={!earned} />

      <Text style={[styles.name, { color: earned ? grade.color : colors.text }]}>{badgeDisplayName(badge, earned)}</Text>
      <View style={[styles.tierChip, { backgroundColor: grade.bg, borderColor: grade.border }]}>
        <Text style={[styles.tierChipText, { color: grade.color }]}>{grade.label}</Text>
      </View>

      <Text style={[styles.desc, { color: colors.muted }]}>{badgeDisplayDesc(badge, earned)}</Text>

      {/* Series badges always name the work they came from, never just the art. */}
      {!!badge.source && (
        <Text style={[styles.source, { color: colors.muted }]}>{t('badge.from', { source: badge.source })}</Text>
      )}

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
            ? { backgroundColor: 'rgba(120, 88, 255,0.14)', borderColor: colors.primary }
            : { backgroundColor: grade.bg, borderColor: grade.border },
            !pinned && !canPin && { opacity: 0.45 }]}
          onPress={() => (pinned || canPin) && onTogglePin(badge)}
          activeOpacity={0.8}>
          <Ionicons name={pinned ? 'remove-circle-outline' : 'add-circle-outline'} size={15} color={pinned ? colors.primary : grade.color} />
          <Text style={[styles.pinBtnText, { color: pinned ? colors.primary : grade.color }]}>
            {pinned ? t('badge.removeFromProfile') : canPin ? t('badge.addToProfile') : t('badge.showcaseFull')}
          </Text>
        </TouchableOpacity>
      )}
      {!earned && (
        <View style={styles.lockedRow}>
          <Ionicons name="lock-closed" size={11} color={colors.muted} />
          <Text style={[styles.lockedText, { color: colors.muted }]}>{t('badge.notEarned')}</Text>
        </View>
      )}

      {next && (
        <View style={[styles.nextWrap, { borderTopColor: colors.border }]}>
          <Text style={[styles.nextLabel, { color: colors.muted }]}>{t('badge.nextTier')}</Text>
          <View style={styles.nextRow}>
            <View style={{ opacity: 0.55 }}>
              <BadgeIcon badge={next} size={46} locked />
            </View>
            <View style={styles.nextTextWrap}>
              <Text style={[styles.nextName, { color: colors.text }]} numberOfLines={1}>{badgeDisplayName(next, false)}</Text>
              <Text style={[styles.nextTier, { color: nextGrade.color }]}>{nextGrade.label}</Text>
              {remaining > 0 && (
                <Text style={[styles.nextRemaining, { color: colors.muted }]}>
                  {t('badge.moreToGo', { n: remaining.toLocaleString() })}
                </Text>
              )}
            </View>
          </View>
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
  source: { fontSize: 11, fontWeight: '700', marginTop: 8, textAlign: 'center', letterSpacing: 0.2 },
  nextWrap: { width: '100%', marginTop: 18, paddingTop: 14, borderTopWidth: 1, alignItems: 'center' },
  nextLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextTextWrap: { flexShrink: 1 },
  nextName: { fontSize: 13, fontWeight: '800' },
  nextTier: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 1 },
  nextRemaining: { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
