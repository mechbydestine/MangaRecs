import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { supabase } from '../supabase';
import { MangaCover } from '../utils/mangaCovers';
import { MANGA_POOL } from '../utils/mangaPool';
import { RowSkeleton } from '../components/Skeleton';
import { useResponsive } from '../utils/responsive';

const MAX_TRENDING = 10;

export default function AllDiscussionsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();

  const [userId, setUserId] = useState(null);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  const loadTrending = useCallback(async (uid) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_trending_discussions', { p_user_id: uid, p_limit: MAX_TRENDING });
      if (!error && data) {
        setTrending(data.map((d) => ({
          id: `disc-${d.series_title}`,
          title: d.series_title,
          searchKey: d.search_key || d.series_title,
          lang: d.lang || 'ja',
          latestChapter: d.chapters || 0,
          discussing: Number(d.total_count) || 0,
          recentCount: Number(d.recent_count) || 0,
          color: d.color || '#1A1A2E',
        })));
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      loadTrending(uid);
    });
  }, [loadTrending]);

  // Search: matches the full manga catalog (not just the top-10 trending list)
  // so users can find or start a discussion on anything, then merges in real
  // comment counts where a discussion already exists.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const lower = q.toLowerCase();
      const localMatches = MANGA_POOL.filter((m) =>
        (m.title || '').toLowerCase().includes(lower)
      ).slice(0, 20);

      const titles = localMatches.map((m) => m.title);
      let countMap = {};
      if (titles.length > 0) {
        const { data: commentRows } = await supabase
          .from('comments')
          .select('series_title')
          .in('series_title', titles);
        (commentRows || []).forEach((c) => { countMap[c.series_title] = (countMap[c.series_title] || 0) + 1; });
      }

      setSearchResults(localMatches.map((m) => ({
        id: `search-${m.id}`,
        title: m.title,
        searchKey: m.searchKey || m.title,
        lang: m.lang || 'ja',
        latestChapter: m.chapters || 0,
        discussing: countMap[m.title] || 0,
        color: m.color || '#1A1A2E',
      })));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function openDiscussion(item) {
    navigation.navigate('Discussion', {
      title: item.title,
      searchKey: item.searchKey,
      lang: item.lang,
      color: item.color,
      latestChapter: item.latestChapter,
      discussing: item.discussing,
    });
  }

  function openReader(item) {
    navigation.navigate('Reader', {
      searchQuery: item.searchKey || item.title,
      title: item.title,
      chapters: item.latestChapter || 1,
      lang: item.lang || 'ja',
    });
  }

  function toggleSearch() {
    setSearchOpen((v) => {
      const next = !v;
      if (next) setTimeout(() => inputRef.current?.focus(), 80);
      else { setQuery(''); setSearchResults([]); }
      return next;
    });
  }

  const showingSearch = searchOpen && query.trim().length > 0;
  const list = showingSearch ? searchResults : trending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Ionicons name="chatbubbles" size={16} color="#7B5CFF" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Discussions</Text>
        </View>
        <TouchableOpacity onPress={toggleSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {searchOpen && (
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search any series to discuss..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color="#7B5CFF" />}
        </View>
      )}

      {!showingSearch && (
        <View style={styles.trendingHint}>
          <Ionicons name="sparkles" size={12} color="#7B5CFF" />
          <Text style={[styles.trendingHintText, { color: colors.muted }]}>
            Ranked by what's trending, recently active, and matches your taste
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        <View style={isTablet ? styles.tabletWrap : null}>
        {loading && !showingSearch ? (
          <View style={{ marginTop: 16, marginHorizontal: -20 }}>
            <RowSkeleton count={6} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name={showingSearch ? 'search-outline' : 'chatbubbles-outline'} size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {showingSearch ? `No series found for "${query}"` : 'No discussions yet — be the first to start one!'}
            </Text>
          </View>
        ) : (
          list.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.discCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openDiscussion(item)}
              activeOpacity={0.82}>
              {!showingSearch && idx < 3 && (
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => openReader(item)} activeOpacity={0.82}>
                <MangaCover title={item.title} searchKey={item.searchKey} lang={item.lang} color={item.color} style={styles.discCover} />
              </TouchableOpacity>
              <View style={styles.discInfo}>
                <Text style={[styles.discTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.discChap, { color: colors.muted }]}>
                  {item.latestChapter > 0 ? `Ch. ${item.latestChapter} · Latest` : 'Tap to discuss'}
                </Text>
                <View style={styles.discCountRow}>
                  <Ionicons name="chatbubble-ellipses" size={11} color="#7B5CFF" />
                  <Text style={styles.discCount}>{item.discussing.toLocaleString()} discussing</Text>
                  {item.recentCount > 0 && (
                    <View style={styles.hotChip}>
                      <Ionicons name="flame" size={10} color="#EF9F27" />
                      <Text style={styles.hotChipText}>Hot</Text>
                    </View>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          ))
        )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  trendingHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 14 },
  trendingHintText: { fontSize: 11, flex: 1 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  discCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  rankBadge: { position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#7B5CFF', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  rankBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  discCover: { width: 52, height: 66, borderRadius: 8, marginRight: 14 },
  discInfo: { flex: 1 },
  discTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  discChap: { fontSize: 11, marginBottom: 5 },
  discCountRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  discCount: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },
  hotChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(239,159,39,0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 4 },
  hotChipText: { color: '#EF9F27', fontSize: 9, fontWeight: '700' },
});
