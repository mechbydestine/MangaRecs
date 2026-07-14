import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { MangaCover } from '../utils/mangaCovers';
import { findPoolEntry } from '../utils/mangaPool';
import { searchMangaDex, getMangaFullDetails } from '../utils/mangaDexApi';
import { syncReadOpen, updateGenreWeights, syncLibraryWrite } from '../utils/readerUtils';
import { supabase } from '../supabase';

function InfoRow({ icon, label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.muted} style={styles.infoIcon} />
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
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

  // Pool data resolves synchronously (no fetch) so synopsis/genres/rating can
  // render on first paint instead of waiting on the live MangaDex lookup —
  // MangaDex data still layers in afterward for fields the pool doesn't track
  // (content warnings, demographic, precise volume counts, alt titles).
  const poolEntry = findPoolEntry(title, searchKey);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const synopsisAnim = useRef(new Animated.Value(0)).current;
  const detailsAnim = useRef(new Animated.Value(0)).current;
  const genresAnim = useRef(new Animated.Value(0)).current;
  const warningsAnim = useRef(new Animated.Value(0)).current;
  const bookmarkPop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(heroAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, []);

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
    const stagger = (a, delay, duration = 260) => Animated.timing(a, { toValue: 1, duration, delay, useNativeDriver: true });
    [synopsisAnim, detailsAnim, genresAnim, warningsAnim].forEach((a) => a.setValue(0));
    Animated.parallel([
      stagger(synopsisAnim, 0),
      stagger(detailsAnim, 70),
      stagger(genresAnim, 130),
      stagger(warningsAnim, 190),
    ]).start();
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
    bookmarkPop.setValue(0.7);
    Animated.spring(bookmarkPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    if (next) {
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: userId, series_title: title, status: 'bookmarked', updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
    } else {
      syncLibraryWrite(() => supabase.from('reading_progress').delete()
        .eq('user_id', userId).eq('series_title', title).eq('status', 'bookmarked'), 'remove bookmark');
    }
  }

  const synopsis = details?.description || poolEntry?.description || '';
  const showToggle = synopsis.length > 260;
  const displaySynopsis = expanded || !showToggle ? synopsis : synopsis.slice(0, 260).trim() + '…';
  const genres = (details?.genres?.length ? details.genres : poolEntry?.genres) || [];
  const rating = poolEntry?.rating || null;
  const readers = poolEntry?.readers || null;

  const heroStyle = {
    opacity: heroAnim,
    transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
  function cardStyle(anim) {
    return {
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    };
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Animated.View style={[styles.hero, heroStyle]}>
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
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
            {details?.altTitles?.length > 0 && (
              <Text style={[styles.altTitles, { color: colors.muted }]} numberOfLines={2}>{details.altTitles.join(' · ')}</Text>
            )}
            {(rating || readers) && (
              <View style={styles.ratingRow}>
                {rating ? (
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                  </View>
                ) : null}
                {readers ? <Text style={[styles.readersText, { color: colors.muted }]}>{readers} readers</Text> : null}
              </View>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.readBtn} onPress={openReader} activeOpacity={0.85}>
                <Ionicons name="book" size={16} color="#fff" />
                <Text style={styles.readBtnText}>Read</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={toggleBookmark}
                activeOpacity={0.7}>
                <Animated.View style={{ transform: [{ scale: bookmarkPop }] }}>
                  <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={bookmarked ? '#7B5CFF' : colors.muted} />
                </Animated.View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => Share.share({ message: `Check out ${title} on MangaRecs — mangarecs://series/${encodeURIComponent(searchKey || title)}` })}
                activeOpacity={0.7}>
                <Ionicons name="share-outline" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {(!poolEntry && loading) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#7B5CFF" />
          </View>
        ) : (
          <View style={styles.body}>
            <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle(synopsisAnim)]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Synopsis</Text>
              <Text style={[styles.synopsis, { color: colors.muted }]}>
                {displaySynopsis || (loading ? 'Loading synopsis…' : 'No synopsis available for this series yet.')}
              </Text>
              {showToggle && (
                <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
                  <Text style={styles.showMore}>{expanded ? 'Show less' : 'Show more'}</Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {(details || poolEntry) && (
              <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle(detailsAnim)]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Details</Text>
                <InfoRow icon="bookmark-outline" label="Status" value={details?.status || (poolEntry?.status === 'ongoing' ? 'Ongoing' : poolEntry?.status === 'completed' ? 'Completed' : null)} colors={colors} />
                <InfoRow icon="people-outline" label="Demographic" value={details?.demographic} colors={colors} />
                <InfoRow icon="calendar-outline" label="Year" value={details?.year} colors={colors} />
                <InfoRow icon="layers-outline" label="Chapters" value={details?.lastChapter ? String(Math.round(details.lastChapter)) : (poolEntry?.chapters ? String(poolEntry.chapters) : null)} colors={colors} />
                <InfoRow icon="albums-outline" label="Volumes" value={details?.lastVolume} colors={colors} />
                <InfoRow icon="create-outline" label="Author" value={details?.authors?.join(', ') || poolEntry?.author} colors={colors} />
                <InfoRow icon="brush-outline" label="Artist" value={details?.artists?.join(', ')} colors={colors} />
              </Animated.View>
            )}

            {genres.length > 0 && (
              <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle(genresAnim)]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Genres</Text>
                <View style={styles.chipRow}>
                  {genres.map((g) => (
                    <View key={g} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.chipText, { color: colors.text }]}>{g}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {details?.contentWarnings?.length > 0 && (
              <Animated.View style={[styles.card, styles.warningCard, cardStyle(warningsAnim)]}>
                <View style={styles.warningHeader}>
                  <Ionicons name="alert-circle" size={16} color="#E24B4A" />
                  <Text style={styles.warningTitle}>Content Warnings</Text>
                </View>
                {details.contentWarnings.map((w) => (
                  <Text key={w} style={styles.warningItem}>• {w}</Text>
                ))}
              </Animated.View>
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
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,215,0,0.14)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  ratingText: { fontSize: 12, fontWeight: '800', color: '#FFD700' },
  readersText: { fontSize: 12, fontWeight: '600' },
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
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  infoIcon: { marginTop: 2 },
  infoLabel: { fontSize: 13, paddingTop: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  // No `gap` here on purpose — RN's flexWrap can miscalculate the wrap point when
  // `gap` is combined with content-hugging (auto-width) children, letting an item
  // that doesn't actually fit stay in the row and get compressed/clipped instead of
  // wrapping. Plain margins on each chip sidestep that entirely.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, flexShrink: 0, overflow: 'visible', marginRight: 8, marginBottom: 8 },
  chipText: { fontSize: 12, fontWeight: '600', includeFontPadding: false, flexShrink: 0 },
  warningCard: { backgroundColor: 'rgba(226,75,74,0.08)', borderWidth: 1, borderColor: 'rgba(226,75,74,0.25)' },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#E24B4A' },
  warningItem: { fontSize: 13, color: '#E24B4A', opacity: 0.88, lineHeight: 20 },
});
