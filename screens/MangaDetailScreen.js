import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { MangaCover } from '../utils/mangaCovers';
import { searchMangaDex, getMangaFullDetails } from '../utils/mangaDexApi';
import { syncReadOpen, updateGenreWeights, syncLibraryWrite } from '../utils/readerUtils';
import { supabase } from '../supabase';

function InfoRow({ icon, label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function MangaDetailScreen() {
  const { params } = useRoute();
  const { title, searchKey, lang, mangaId: routeMangaId, color, coverUrl: knownCoverUrl, chapters: routeChapters } = params || {};
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, profile, updateProfile } = useProfile();

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    let id = routeMangaId;
    if (!id) {
      const found = await searchMangaDex(searchKey || title, { lang });
      id = found?.id || null;
    }
    if (id) {
      const full = await getMangaFullDetails(id);
      setDetails(full);
    }
    setLoading(false);
  }, [routeMangaId, searchKey, title, lang]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  useEffect(() => {
    supabase.from('reading_progress')
      .select('status')
      .eq('user_id', userId || '')
      .eq('series_title', title)
      .maybeSingle()
      .then(({ data }) => setBookmarked(!!data));
  }, [userId, title]);

  function openReader() {
    navigation.navigate('Reader', {
      searchQuery: searchKey || title,
      title,
      chapters: details?.lastChapter || routeChapters || 1,
      mangaId: details?.id || routeMangaId,
      lang: details?.lang || lang || 'ja',
    });
    if (userId) {
      updateProfile({ currently_reading: title });
      syncReadOpen(userId, title);
      if (details?.genres?.length) updateGenreWeights(details.genres);
    }
  }

  function toggleBookmark() {
    if (!userId) return;
    const next = !bookmarked;
    setBookmarked(next);
    if (next) {
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: userId, series_title: title, status: 'bookmarked', updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
    } else {
      syncLibraryWrite(() => supabase.from('reading_progress').delete()
        .eq('user_id', userId).eq('series_title', title).eq('status', 'bookmarked'), 'remove bookmark');
    }
  }

  const synopsis = details?.description || '';
  const showToggle = synopsis.length > 260;
  const displaySynopsis = expanded || !showToggle ? synopsis : synopsis.slice(0, 260).trim() + '…';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.hero}>
          <View style={[styles.coverWrap, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { top: insets.top + 10 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <MangaCover
              title={title}
              searchKey={searchKey}
              lang={lang}
              color={color}
              coverUrl={knownCoverUrl || details?.coverUrl}
              contentRating={details?.contentRating}
              style={styles.cover}
            />
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {details?.altTitles?.length > 0 && (
              <Text style={[styles.altTitles, { color: colors.muted }]} numberOfLines={2}>{details.altTitles.join(' · ')}</Text>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.readBtn} onPress={openReader} activeOpacity={0.85}>
                <Ionicons name="book" size={16} color="#fff" />
                <Text style={styles.readBtnText}>Start Reading</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={toggleBookmark}>
                <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={bookmarked ? '#7B5CFF' : colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => Share.share({ message: `Check out ${title} on MangaRecs — mangarecs://series/${encodeURIComponent(searchKey || title)}` })}>
                <Ionicons name="share-outline" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#7B5CFF" />
          </View>
        ) : (
          <View style={styles.body}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Synopsis</Text>
              <Text style={[styles.synopsis, { color: colors.muted }]}>
                {displaySynopsis || 'No synopsis available for this series yet.'}
              </Text>
              {showToggle && (
                <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
                  <Text style={styles.showMore}>{expanded ? 'Show less' : 'Show more'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {details && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Details</Text>
                <InfoRow icon="bookmark-outline" label="Status" value={details.status} colors={colors} />
                <InfoRow icon="people-outline" label="Demographic" value={details.demographic} colors={colors} />
                <InfoRow icon="calendar-outline" label="Year" value={details.year} colors={colors} />
                <InfoRow icon="layers-outline" label="Chapters" value={details.lastChapter ? String(Math.round(details.lastChapter)) : null} colors={colors} />
                <InfoRow icon="albums-outline" label="Volumes" value={details.lastVolume} colors={colors} />
                <InfoRow icon="create-outline" label="Author" value={details.authors?.join(', ')} colors={colors} />
                <InfoRow icon="brush-outline" label="Artist" value={details.artists?.join(', ')} colors={colors} />
              </View>
            )}

            {details?.genres?.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Genres</Text>
                <View style={styles.chipRow}>
                  {details.genres.map((g) => (
                    <View key={g} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.chipText, { color: colors.text }]}>{g}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {details?.contentWarnings?.length > 0 && (
              <View style={[styles.card, styles.warningCard]}>
                <View style={styles.warningHeader}>
                  <Ionicons name="alert-circle" size={16} color="#E24B4A" />
                  <Text style={styles.warningTitle}>Content Warnings</Text>
                </View>
                {details.contentWarnings.map((w) => (
                  <Text key={w} style={styles.warningItem}>• {w}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { flexDirection: 'row', paddingHorizontal: 20, gap: 16 },
  coverWrap: { position: 'relative' },
  backBtn: {
    position: 'absolute', left: -8, zIndex: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  cover: { width: 128, height: 182, borderRadius: 12 },
  heroInfo: { flex: 1, justifyContent: 'flex-end', paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', lineHeight: 27 },
  altTitles: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  readBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7B5CFF', borderRadius: 12, paddingVertical: 13,
  },
  readBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  synopsis: { fontSize: 14, lineHeight: 21 },
  showMore: { color: '#7B5CFF', fontSize: 13, fontWeight: '600', marginTop: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', maxWidth: '55%' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  warningCard: { backgroundColor: 'rgba(226,75,74,0.08)', borderWidth: 1, borderColor: 'rgba(226,75,74,0.25)' },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#E24B4A' },
  warningItem: { fontSize: 13, color: '#E24B4A', opacity: 0.88, lineHeight: 20 },
});
