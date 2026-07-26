import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Animated, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { MangaCover } from '../utils/mangaCovers';
import { findPoolEntry, MANGA_POOL } from '../utils/mangaPool';
import { searchMangaDex, getMangaFullDetails } from '../utils/mangaDexApi';
import { syncReadOpen, updateGenreWeights, syncLibraryWrite } from '../utils/readerUtils';
import { TOP_SITES, buildSearchUrl } from '../utils/mangaSearch';
import { fetchAnilistCharacters } from '../utils/anilist';
import { supabase } from '../supabase';

const READ_AVAILABLE_SITES = TOP_SITES.slice(0, 5);

function siteFavicon(url) {
  try {
    const hostname = new URL(url).hostname;
    // Same technique mangarecs.net's catalog page uses — Google's favicon
    // service resolves each site's actual declared icon, giving a real logo
    // mark instead of guessing at /favicon.ico or using a plain emoji.
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch (_) {
    return null;
  }
}

function formatLabel(lang) {
  if (lang === 'ko') return 'Manhwa';
  if (lang === 'zh') return 'Manhua';
  return 'Manga';
}

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
  const [characters, setCharacters] = useState([]);

  // Pool data resolves synchronously (no fetch) so synopsis/genres/rating can
  // render on first paint instead of waiting on the live MangaDex lookup —
  // MangaDex data still layers in afterward for fields the pool doesn't track
  // (content warnings, demographic, precise volume counts, alt titles).
  const poolEntry = findPoolEntry(title, searchKey);

  // "You Might Also Like" — scored by shared genre count against the app's
  // own curated pool, same data every other recommendation rail in the app
  // already draws from. Best-effort only; an obscure title with few/no
  // genre overlaps just gets an empty (hidden) shelf.
  const recommendations = useMemo(() => {
    const myGenreList = (details?.genres?.length ? details.genres : poolEntry?.genres) || [];
    const myGenres = new Set(myGenreList.map((g) => g.toLowerCase()));
    if (myGenres.size === 0) return [];
    return MANGA_POOL
      .filter((m) => m.title !== title && !m.comingSoon)
      .map((m) => ({ m, score: (m.genres || []).filter((g) => myGenres.has(g.toLowerCase())).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.m.readers || 0) - (a.m.readers || 0))
      .slice(0, 8)
      .map((x) => x.m);
  }, [details, poolEntry, title]);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const synopsisAnim = useRef(new Animated.Value(0)).current;
  const detailsAnim = useRef(new Animated.Value(0)).current;
  const genresAnim = useRef(new Animated.Value(0)).current;
  const warningsAnim = useRef(new Animated.Value(0)).current;
  const charactersAnim = useRef(new Animated.Value(0)).current;
  const recsAnim = useRef(new Animated.Value(0)).current;
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
    [synopsisAnim, detailsAnim, genresAnim, warningsAnim, charactersAnim, recsAnim].forEach((a) => a.setValue(0));
    Animated.parallel([
      stagger(synopsisAnim, 0),
      stagger(detailsAnim, 70),
      stagger(genresAnim, 130),
      stagger(charactersAnim, 160),
      stagger(warningsAnim, 190),
      stagger(recsAnim, 220),
    ]).start();
  }, [routeMangaId, searchKey, title, lang]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  // Best-effort — a wrong/no AniList match just means an empty Characters
  // card (already conditionally hidden below), nothing else depends on this.
  useEffect(() => {
    let cancelled = false;
    setCharacters([]);
    fetchAnilistCharacters(title, searchKey).then((list) => {
      if (!cancelled) setCharacters(list);
    });
    return () => { cancelled = true; };
  }, [title, searchKey]);

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

  // "Read Available" row tap — jumps straight to that site's search results
  // for this title (resumeUrl/resumeSite is the reader's existing "open this
  // exact URL, skip auto-resolve" path, reused here for a fresh open rather
  // than a true resume).
  function openReaderWithSite(site) {
    navigation.navigate('Reader', {
      searchQuery: searchKey || title,
      title,
      chapters: details?.lastChapter || routeChapters || 1,
      lang: details?.lang || lang || 'ja',
      resumeUrl: buildSearchUrl(site.url, searchKey || title),
      resumeSite: site.name,
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
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back">
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
            <View style={styles.badgeRow}>
              <View style={styles.formatPill}>
                <Text style={styles.formatPillText}>{formatLabel(details?.lang || poolEntry?.lang || lang).toUpperCase()}</Text>
              </View>
              {!!(details?.status || poolEntry?.status) && (
                <View style={[styles.statusPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.statusPillText, { color: colors.text }]}>
                    {details?.status || (poolEntry?.status === 'ongoing' ? 'Ongoing' : 'Completed')}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={3} ellipsizeMode="tail">{title}</Text>
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
          </View>
        </Animated.View>

        <View style={styles.stackedActions}>
          <TouchableOpacity style={styles.readBtn} onPress={openReader} activeOpacity={0.85}>
            <Ionicons name="book" size={16} color="#fff" />
            <Text style={styles.readBtnText}>Read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fullBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={toggleBookmark}
            activeOpacity={0.7}>
            <Animated.View style={[styles.fullBtnContent, { transform: [{ scale: bookmarkPop }] }]}>
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={bookmarked ? '#7B5CFF' : colors.muted} />
              <Text style={[styles.fullBtnText, { color: bookmarked ? '#7B5CFF' : colors.text }]}>{bookmarked ? 'Saved' : 'Save to Library'}</Text>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fullBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => Share.share({ message: `Check out ${title} on MangaRecs — mangarecs://series/${encodeURIComponent(searchKey || title)}` })}
            activeOpacity={0.7}>
            <View style={styles.fullBtnContent}>
              <Ionicons name="share-outline" size={16} color={colors.text} />
              <Text style={[styles.fullBtnText, { color: colors.text }]}>Share</Text>
            </View>
          </TouchableOpacity>
        </View>

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

            <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle(detailsAnim)]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Read Available</Text>
              <Text style={[styles.readAvailableSub, { color: colors.muted }]}>
                Pick a site to read this series in the app.
              </Text>
              {READ_AVAILABLE_SITES.map((site) => {
                const favicon = siteFavicon(site.url);
                return (
                  <TouchableOpacity
                    key={site.name}
                    style={[styles.siteRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={() => openReaderWithSite(site)}
                    activeOpacity={0.75}>
                    {favicon ? (
                      <Image source={{ uri: favicon }} style={styles.siteRowIcon} />
                    ) : (
                      <Text style={styles.siteRowEmoji}>{site.emoji}</Text>
                    )}
                    <Text style={[styles.siteRowText, { color: colors.text }]}>{site.name}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                  </TouchableOpacity>
                );
              })}
            </Animated.View>

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

            {characters.length > 0 && (
              <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, cardStyle(charactersAnim)]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Characters</Text>
                <View style={styles.charGrid}>
                  {characters.map((c) => (
                    <View key={c.name} style={styles.charCard}>
                      <View style={styles.charImgWrap}>
                        <Image source={{ uri: c.image }} style={styles.charImg} />
                        {c.main && (
                          <View style={styles.charMainBadge}>
                            <Text style={styles.charMainBadgeText}>MAIN</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.charName, { color: colors.text }]} numberOfLines={2}>{c.name}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

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

            {recommendations.length > 0 && (
              <Animated.View style={cardStyle(recsAnim)}>
                <Text style={[styles.sectionHeading, { color: colors.text }]}>You Might Also Like</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recsRow}>
                  {recommendations.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.recCard}
                      activeOpacity={0.85}
                      onPress={() => navigation.push('MangaDetail', {
                        title: m.title, searchKey: m.searchKey || m.title, lang: m.lang, color: m.color, chapters: m.chapters,
                      })}>
                      <MangaCover title={m.title} searchKey={m.searchKey} lang={m.lang} color={m.color} style={styles.recCover} />
                      {!!m.rating && (
                        <View style={styles.recRatingPill}>
                          <Ionicons name="star" size={9} color="#FFD700" />
                          <Text style={styles.recRatingText}>{m.rating.toFixed(1)}</Text>
                        </View>
                      )}
                      <Text style={[styles.recTitle, { color: colors.text }]} numberOfLines={2}>{m.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  formatPill: { backgroundColor: 'rgba(123,92,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  formatPillText: { color: '#7B5CFF', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  statusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 10.5, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800', lineHeight: 27 },
  altTitles: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,215,0,0.14)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  ratingText: { fontSize: 12, fontWeight: '800', color: '#FFD700' },
  readersText: { fontSize: 12, fontWeight: '600' },
  stackedActions: { paddingHorizontal: 20, marginTop: 18, gap: 10 },
  readBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7B5CFF', borderRadius: 12, paddingVertical: 14,
  },
  readBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fullBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  fullBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fullBtnText: { fontWeight: '700', fontSize: 14 },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  synopsis: { fontSize: 14, lineHeight: 21 },
  showMore: { color: '#7B5CFF', fontSize: 13, fontWeight: '600', marginTop: 8 },
  readAvailableSub: { fontSize: 12, lineHeight: 17, marginBottom: 12, marginTop: -4 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  siteRowEmoji: { fontSize: 16 },
  siteRowIcon: { width: 20, height: 20, borderRadius: 4 },
  siteRowText: { flex: 1, fontSize: 14, fontWeight: '600' },
  sectionHeading: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  recsRow: { gap: 12 },
  recCard: { width: 108 },
  recCover: { width: 108, height: 152, borderRadius: 10 },
  recRatingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  recRatingText: { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  recTitle: { fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 16 },
  charGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  charCard: { width: '28%' },
  charImgWrap: { position: 'relative' },
  charImg: { width: '100%', aspectRatio: 0.72, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  charMainBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  charMainBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  charName: { fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
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
