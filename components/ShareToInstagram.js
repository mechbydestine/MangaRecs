import { View, Text, StyleSheet, Modal, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useTheme } from '../utils/ThemeContext';

const SHARE_CARDS = [
  { id: 'progress', label: 'Reading Progress', emoji: '📖' },
  { id: 'panel',    label: 'Favorite Panel',   emoji: '🎨' },
  { id: 'rating',   label: 'My Rating',         emoji: '⭐' },
];

export default function ShareToInstagram({ open, onClose, series, chapter, progress }) {
  const { colors } = useTheme();
  const [selectedCard, setSelectedCard] = useState('progress');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedCard('progress');
      setShared(false);
    }
  }, [open]);

  const progressPct = Math.round((progress || 0) * 100);
  const storyBg = series?.color || '#2D1B69';

  async function handleCopyLink() {
    try {
      await Share.share({
        message: `https://mangarecs.app/series/${series?.id || 'discover'}`,
      });
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (_) {}
  }

  async function handleInstagram() {
    try {
      await Share.share({
        message: `I'm reading ${series?.title || 'an amazing manga'} Ch.${chapter || 1} on MangaRecs! 📚\nhttps://mangarecs.app/series/${series?.id || 'discover'}`,
      });
    } catch (_) {}
    onClose();
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>

          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Share</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Card type selector */}
          <View style={styles.cardRow}>
            {SHARE_CARDS.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.cardOption,
                  {
                    borderColor: selectedCard === c.id ? '#534AB7' : colors.border,
                    backgroundColor: selectedCard === c.id
                      ? 'rgba(83,74,183,0.1)'
                      : 'rgba(255,255,255,0.03)',
                  },
                ]}
                onPress={() => setSelectedCard(c.id)}
              >
                <Text style={styles.cardEmoji}>{c.emoji}</Text>
                <Text style={[styles.cardLabel, { color: selectedCard === c.id ? colors.text : colors.muted }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Story preview */}
          <View style={styles.previewWrap}>
            <View style={[styles.storyCard, { backgroundColor: storyBg }]}>
              <View style={styles.storyDimOverlay} />

              {/* MangaRecs watermark */}
              <View style={styles.watermark}>
                <View style={styles.watermarkPill}>
                  <Text style={styles.watermarkText}>mangarecs</Text>
                </View>
              </View>

              {/* Story content */}
              <View style={styles.storyContent}>
                {selectedCard === 'progress' && (
                  <>
                    <Text style={styles.storySubLabel}>Currently reading</Text>
                    <Text style={styles.storyTitle} numberOfLines={2}>
                      {series?.title || 'Series Title'}
                    </Text>
                    <Text style={styles.storyChapter}>Ch. {chapter || 1}</Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                    </View>
                    <Text style={styles.storyPct}>{progressPct}% complete</Text>
                  </>
                )}
                {selectedCard === 'panel' && (
                  <>
                    <View style={styles.storyRow}>
                      <Ionicons name="sparkles" size={8} color="#facc15" />
                      <Text style={[styles.storySubLabel, { marginLeft: 3 }]}>Favorite panel</Text>
                    </View>
                    <Text style={styles.storyTitle} numberOfLines={2}>
                      {series?.title || 'Series Title'}
                    </Text>
                    <Text style={styles.storyChapter}>Ch. {chapter || 1} · MangaRecs</Text>
                  </>
                )}
                {selectedCard === 'rating' && (
                  <>
                    <Text style={styles.storySubLabel}>I rated this</Text>
                    <Text style={styles.storyTitle} numberOfLines={2}>
                      {series?.title || 'Series Title'}
                    </Text>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Text
                          key={s}
                          style={[
                            styles.star,
                            { color: s <= Math.round(series?.rating || 4) ? '#facc15' : 'rgba(255,255,255,0.2)' },
                          ]}
                        >
                          ★
                        </Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.inputBg }]}
              onPress={handleCopyLink}
            >
              <Ionicons
                name={shared ? 'checkmark' : 'copy-outline'}
                size={16}
                color={shared ? '#1D9E75' : colors.text}
              />
              <Text style={[styles.copyBtnText, { color: shared ? '#1D9E75' : colors.text }]}>
                {shared ? 'Shared!' : 'Copy Link'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.igBtn} onPress={handleInstagram}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.igBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: 'bold' },
  closeBtn: { padding: 6, borderRadius: 20 },
  cardRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  cardOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardEmoji: { fontSize: 18, marginBottom: 4 },
  cardLabel: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  storyCard: {
    width: 120,
    aspectRatio: 9 / 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  storyDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  watermark: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watermarkPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  watermarkText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#fff',
  },
  storyContent: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
  },
  storySubLabel: { fontSize: 8, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  storyTitle: { fontSize: 10, fontWeight: 'bold', color: '#fff', lineHeight: 13 },
  storyChapter: { fontSize: 8, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 6,
  },
  progressFill: {
    height: 3,
    backgroundColor: '#534AB7',
    borderRadius: 2,
  },
  storyPct: { fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  storyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  starsRow: { flexDirection: 'row', marginTop: 4 },
  star: { fontSize: 10 },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  copyBtnText: { fontSize: 14, fontWeight: '500', paddingRight: 2 },
  igBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#C13584',
  },
  igBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', paddingRight: 2 },
});
