import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal,
  ScrollView, RefreshControl, Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { MangaCover } from '../utils/mangaCovers';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { supabase } from '../supabase';
import { syncReadOpen, getLastRead, getReadingHistory, setLastRead as saveLastRead } from '../utils/readerUtils';
import { getLatestChapter } from '../utils/mangaDexApi';
import { light, medium, heavy, success as hapticSuccess, warning as hapticWarning } from '../utils/haptics';
import { MANGA_POOL } from '../utils/mangaPool';

const TRENDING = ['TBATE', 'Solo Leveling', 'Murim Login', 'Omniscient Reader', 'Tower of God'];
const TABS = ['Reading', 'Completed', 'Bookmarked', 'Downloaded'];
const UPDATE_CACHE_KEY = '@panelr/updates_cache';
const UPDATE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours


// ── GridItem with entrance animation ──────────────────────────────────────

function GridItem({ series, activeTab, onPress, onLongPress, index, opening, hasUpdate }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const containerRef = useRef(null);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 160,
      delay: 0,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  const opacity    = anim;
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });

  const isSaved     = series.savedFromFeed;
  const progressPct = series.progress ?? 0;

  function handleLongPress() {
    if (containerRef.current && onLongPress) {
      containerRef.current.measure((x, y, w, h, pageX, pageY) => {
        onLongPress(series, { x: pageX, y: pageY, width: w, height: h });
      });
    }
  }

  return (
    <Animated.View ref={containerRef} style={[styles.gridItem, { opacity, transform: [{ scale }, { translateY }] }]}>
      <TouchableOpacity onPress={onPress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.82} disabled={opening}>
        <MangaCover title={series.title} searchKey={series.searchKey} lang={series.lang} color={series.color} style={styles.cover}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
          </View>

          {isSaved ? (
            <View style={styles.savedBadge}>
              <Ionicons name="bookmark" size={11} color="#A09CE0" />
            </View>
          ) : activeTab === 'Downloaded' ? (
            <View style={styles.downloadedBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#1D9E75" />
            </View>
          ) : (
            <View style={styles.cloudBadge}>
              <Ionicons name="cloud-outline" size={12} color="rgba(255,255,255,0.6)" />
            </View>
          )}

          {hasUpdate && (
            <View style={styles.updateBadge}>
              <Text style={styles.updateBadgeText}>NEW</Text>
            </View>
          )}

          {progressPct >= 1 && (
            <View style={styles.completeOverlay}>
              <View style={styles.completePill}>
                <Text style={styles.completePillText}>COMPLETE</Text>
              </View>
            </View>
          )}

          <View style={styles.coverCenter}>
            <Text style={styles.coverLetter}>{series.title[0]}</Text>
          </View>
        </MangaCover>

        <Text style={[styles.itemTitle, { color: opening ? '#534AB7' : colors.text }]} numberOfLines={1}>
          {opening ? 'Opening…' : series.title}
        </Text>
        <View style={styles.itemMeta}>
          <Ionicons name="star" size={10} color="#FFD700" />
          <Text style={[styles.itemRating, { color: colors.muted }]}>{series.rating}</Text>
          {progressPct > 0 && (
            <Text style={[styles.itemProgress, { color: colors.muted }]}>{Math.floor(progressPct * 100)}%</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── TabButton with spring ──────────────────────────────────────────────────

function TabButton({ tab, active, onPress }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    light();
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 20, bounciness: 10 }),
    ]).start();
    onPress(tab);
  }

  return (
    <Animated.View style={[styles.tab, active && [styles.tabActive, { backgroundColor: colors.card }], { transform: [{ scale }] }]}>
      <TouchableOpacity onPress={handlePress} style={styles.tabInner}>
        <Text style={[styles.tabText, { color: colors.muted }, active && [styles.tabTextActive, { color: colors.text }]]} numberOfLines={1}>
          {tab}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { profile, updateProfile, refreshProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('Reading');
  const [savedItems, setSavedItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [completedIds, setCompletedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState({ visible: false, series: null, pos: null });
  const [progressRows, setProgressRows] = useState([]);
  const [lastReadEntry, setLastReadEntry] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [openingId, setOpeningId] = useState(null);
  const [libLoading, setLibLoading] = useState(true);
  const [updatesSet, setUpdatesSet] = useState(new Set());

  // Reload saved items, reading progress, and replay grid animations every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      setFocusKey((k) => k + 1);
      setOpeningId(null);
      setLibLoading(true);

      // Load most recently read series for Continue Reading card
      getLastRead().then((lr) => { if (lr) setLastReadEntry(lr); });
      // Load full reading history for the Reading tab; also kick off background update check
      getReadingHistory().then((items) => {
        setHistoryItems(items);
        checkUpdatesInBackground(items.slice(0, 8));
      });

      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;

        // Load local bookmarks first, then merge with Supabase (avoids race condition)
        AsyncStorage.getItem('@panelr_saved').then((val) => {
          let localItems = [];
          try { localItems = val ? JSON.parse(val) : []; } catch (_) {}

          if (!uid) { setSavedItems(localItems); setLibLoading(false); return; }

          supabase
            .from('reading_progress')
            .select('series_title, current_chapter, total_chapters, status, updated_at')
            .eq('user_id', uid)
            .order('updated_at', { ascending: false })
            .then(({ data }) => {
              if (data) {
                setProgressRows(data.filter((r) => r.status !== 'bookmarked'));
                // Restore server-only bookmarks not present in AsyncStorage
                const localTitles = new Set(localItems.map((s) => s.title));
                const serverBookmarks = data
                  .filter((r) => r.status === 'bookmarked' && !localTitles.has(r.series_title))
                  .map((r) => ({
                    id: `sb-${r.series_title}`,
                    title: r.series_title,
                    searchKey: r.series_title,
                    rating: null,
                    progress: 0,
                    chapters: 0,
                    color: '#1A1A2E',
                    bookmarked: true,
                  }));
                setSavedItems([...serverBookmarks, ...localItems]);
              } else {
                setSavedItems(localItems);
              }
              setLibLoading(false);
            })
            .catch(() => { setSavedItems(localItems); setLibLoading(false); });
        });
      }).catch(() => setLibLoading(false));
    }, [])
  );

  function openSearch() {
    setSearchOpen(true);
    AsyncStorage.getItem('@panelr_search_history').then((val) => {
      try { if (val) setRecentSearches(JSON.parse(val)); } catch (_) {}
    });
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
  }

  function submitSearch(term) {
    const q = term || query;
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter((r) => r !== q)].slice(0, 5);
    setRecentSearches(updated);
    AsyncStorage.setItem('@panelr_search_history', JSON.stringify(updated)).catch(() => {});
    closeSearch();
    navigation.navigate('Reader', { searchQuery: q.trim(), title: q.trim(), chapters: 999 });
  }

  function removeRecent(term) {
    const updated = recentSearches.filter((r) => r !== term);
    setRecentSearches(updated);
    AsyncStorage.setItem('@panelr_search_history', JSON.stringify(updated)).catch(() => {});
  }

  // Live pool search — filters MANGA_POOL as the user types
  const q = query.trim().toLowerCase();
  const searchResults = q.length > 0
    ? MANGA_POOL.filter((m) =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.searchKey || '').toLowerCase().includes(q) ||
        (m.author || '').toLowerCase().includes(q) ||
        (m.genres || []).some((g) => g.toLowerCase().includes(q))
      ).slice(0, 15)
    : [];

  function openFromSearch(item) {
    const updated = [item.title, ...recentSearches.filter((r) => r !== item.title)].slice(0, 5);
    setRecentSearches(updated);
    AsyncStorage.setItem('@panelr_search_history', JSON.stringify(updated)).catch(() => {});
    closeSearch();
    saveLastRead({
      title: item.title,
      searchKey: item.searchKey || item.title,
      chapter: 1,
      color: item.color || '#1A1A2E',
      lang: item.lang || 'ja',
      chapters: item.chapters || 999,
      rating: item.rating,
    });
    navigation.navigate('Reader', {
      searchQuery: item.searchKey || item.title,
      title: item.title,
      chapters: item.chapters || 1,
      lang: item.lang || 'ja',
    });
  }

  const staticPool = [];

  const liveReading = (() => {
    if (!profile?.currently_reading) return null;
    const prog = progressRows.find((r) => r.series_title === profile.currently_reading);
    const liveProgress = prog?.total_chapters
      ? Math.min((prog.current_chapter || 1) / prog.total_chapters, 0.99)
      : prog?.current_chapter ? 0.1 : 0;
    return {
      id: 'live',
      title: profile.currently_reading,
      searchKey: profile.currently_reading,
      lang: 'ja',
      color: '#1A1A2E',
      currentChapter: prog?.current_chapter || profile.current_chapter || 1,
      chapters: prog?.total_chapters || 999,
      progress: liveProgress,
      rating: null,
    };
  })();

  const INVALID_HIST_TITLE = /^(reader|browser|panelr|mangadex|mangafire|webtoon|asura scans|weeb central|manga plus|mangahub|cubari proxy|dynasty reader|likemanga|mangago|mangakatana|mangapill|manhuaplus|manhuabuddy|vymanga|zinmanga|readmanga|mangaball|mangafreak)$/i;

  const baseReadingSeries = staticPool
    .filter((s) => s.progress < 1 && !deletedIds.has(s.id) && !completedIds.has(s.id))
    .map((s) => {
      const prog = progressRows.find((r) => r.series_title === s.title);
      if (prog?.current_chapter) {
        return {
          ...s,
          currentChapter: prog.current_chapter,
          chapterLabel: `Chapter ${prog.current_chapter}`,
          progress: prog.total_chapters ? Math.min(prog.current_chapter / prog.total_chapters, 0.99) : s.progress,
        };
      }
      return s;
    });

  const progressReading = progressRows
    .filter((r) => r.status === 'reading' && !deletedIds.has(r.series_title))
    .filter((r) => !baseReadingSeries.some((s) => s.title === r.series_title))
    .filter((r) => r.series_title && !INVALID_HIST_TITLE.test(r.series_title.trim()) && !r.series_title.startsWith('http'))
    .map((r) => {
      const pool = MANGA_POOL.find((m) => m.title === r.series_title || m.searchKey === r.series_title);
      return {
        id: `prog-${r.series_title}`,
        title: r.series_title,
        searchKey: pool?.searchKey || r.series_title,
        lang: pool?.lang || 'ja',
        color: pool?.color || '#1A1A2E',
        currentChapter: r.current_chapter || 1,
        chapters: r.total_chapters || 999,
        progress: r.total_chapters ? Math.min(r.current_chapter / r.total_chapters, 0.99) : 0.1,
        rating: pool?.rating || null,
      };
    });

  const existingTitles = new Set([
    ...baseReadingSeries.map((s) => s.title),
    ...progressReading.map((s) => s.title),
    ...(liveReading ? [liveReading.title] : []),
  ]);

  const historyReading = historyItems
    .filter((h) => !deletedIds.has(h.searchKey) && !completedIds.has(h.searchKey))
    .filter((h) => !existingTitles.has(h.title))
    .filter((h) => !progressRows.some((r) => r.series_title === h.title && r.status === 'completed'))
    .filter((h) => {
      if (!h.title) return false;
      if (INVALID_HIST_TITLE.test(h.title.trim())) return false;
      if (h.title.startsWith('http')) return false;
      if (/\.(com|to|net|io|org|me|pro|xyz|app|moe|gg)\b/.test(h.title.toLowerCase())) return false;
      return true;
    })
    .map((h) => ({
      id: `hist-${h.searchKey}`,
      title: h.title,
      searchKey: h.searchKey || h.title,
      lang: h.lang || 'ja',
      color: h.color || '#1A1A2E',
      currentChapter: h.chapter || 1,
      chapterLabel: h.chapterLabel || `Chapter ${h.chapter || 1}`,
      chapters: h.chapters || 999,
      progress: h.chapters && h.chapters < 999 ? Math.min((h.chapter || 1) / h.chapters, 0.99) : 0.05,
      rating: h.rating || null,
      url: h.url || null,
      site: h.site || null,
    }));

  const liveReadingValid = liveReading
    && !deletedIds.has('live')
    && !deletedIds.has(liveReading.title)
    && !deletedIds.has(liveReading.searchKey)
    && !INVALID_HIST_TITLE.test((liveReading.title || '').trim())
    && !liveReading.title?.startsWith('http');

  const readingSeries = [
    ...(liveReadingValid && !baseReadingSeries.some((s) => s.title === liveReading.title) && !progressReading.some((s) => s.title === liveReading.title) ? [liveReading] : []),
    ...progressReading,
    ...historyReading,
    ...baseReadingSeries,
  ];

  const completedSeries = [
    ...progressRows
      .filter((r) => (r.status === 'completed' || completedIds.has(r.series_title)) && !deletedIds.has(r.series_title))
      .map((r) => {
        const pool = MANGA_POOL.find((m) => m.title === r.series_title || m.searchKey === r.series_title);
        return {
          id: `comp-${r.series_title}`,
          title: r.series_title,
          searchKey: pool?.searchKey || r.series_title,
          lang: pool?.lang || 'ja',
          color: pool?.color || '#1A1A2E',
          currentChapter: r.current_chapter || 1,
          chapters: r.total_chapters || 999,
          progress: 1,
          rating: pool?.rating || null,
        };
      }),
    ...staticPool.filter((s) => (s.progress >= 1 || completedIds.has(s.id)) && !deletedIds.has(s.id)),
  ];

  const continueReading = lastReadEntry
    ? {
        id: 'last-read',
        title: lastReadEntry.title,
        searchKey: lastReadEntry.searchKey || lastReadEntry.title,
        lang: lastReadEntry.lang || 'ja',
        color: lastReadEntry.color || '#1A1A2E',
        currentChapter: lastReadEntry.chapter || 1,
        chapterLabel: lastReadEntry.chapterLabel || `Chapter ${lastReadEntry.chapter || 1}`,
        chapters: lastReadEntry.chapters || 999,
        rating: lastReadEntry.rating,
        url: lastReadEntry.url || null,
        site: lastReadEntry.site || null,
      }
    : (progressReading[0] || readingSeries[0]);

  function getFilteredSeries() {
    switch (activeTab) {
      case 'Reading':    return readingSeries;
      case 'Completed':  return completedSeries;
      case 'Bookmarked': return savedItems.filter((item) => !deletedIds.has(item.id)).map((item) => ({
        ...item,
        progress: 0,
        savedFromFeed: true,
      }));
      case 'Downloaded': return savedItems
        .filter((item) => item.downloaded && !deletedIds.has(item.id))
        .map((item) => ({ ...item, progress: 0 }));
      default:           return [];
    }
  }
  const filtered = getFilteredSeries();

  async function openReader(series) {
    setOpeningId(series.id);

    // Offline: open directly from local filesystem without API calls
    if (series.downloadDir) {
      navigation.navigate('Reader', {
        title: series.title,
        downloadDir: series.downloadDir,
        chapters: series.pageCount || 1,
      });
      setOpeningId(null);
      return;
    }

    // Persist immediately so the card is accurate when user returns
    saveLastRead({
      title: series.title,
      searchKey: series.searchKey || series.title,
      chapter: series.currentChapter || 1,
      chapterLabel: series.chapterLabel || (series.currentChapter ? `Chapter ${series.currentChapter}` : null),
      color: series.color || '#1A1A2E',
      lang: series.lang || 'ja',
      chapters: series.chapters || 999,
      rating: series.rating,
    });
    navigation.navigate('Reader', {
      searchQuery: series.searchKey || series.title,
      title: series.title,
      chapters: series.chapters || 1,
      mangaId: series.mangaId,
      resumeUrl: series.url || null,
      resumeSite: series.site || null,
      lang: series.lang || 'ja',
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const uid = session.user.id;
      updateProfile({ currently_reading: series.title });
      syncReadOpen(uid, series.title);
      supabase.from('reading_progress').upsert({
        user_id: uid,
        series_title: series.title,
        current_chapter: series.currentChapter || 1,
        total_chapters: series.chapters || null,
        status: 'reading',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title' }).then(() => {});
    }
  }

  function handleLongPress(series, pos) {
    medium();
    setContextMenu({ visible: true, series, pos });
  }

  function closeContextMenu() {
    setContextMenu({ visible: false, series: null, pos: null });
  }

  async function checkUpdatesInBackground(items) {
    if (!items?.length) return;
    try {
      const cacheRaw = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
      const now = Date.now();
      const newUpdates = new Set();

      for (const s of items.slice(0, 10)) {
        const cacheKey = s.searchKey || s.title;
        if (!cacheKey) continue;

        const cached = cache[cacheKey];
        if (cached && now - cached.ts < UPDATE_CACHE_TTL) {
          if (cached.hasUpdate) newUpdates.add(cacheKey);
          continue;
        }

        const resumeKey = '@panelr/resume/' + encodeURIComponent(cacheKey);
        const resumeRaw = await AsyncStorage.getItem(resumeKey).catch(() => null);
        if (!resumeRaw) { cache[cacheKey] = { ts: now, hasUpdate: false }; continue; }

        let resume;
        try { resume = JSON.parse(resumeRaw); } catch (_) { continue; }
        if (resume?.mode !== 'api' || !resume?.mangaId) {
          cache[cacheKey] = { ts: now, hasUpdate: false }; continue;
        }

        const latest = await getLatestChapter(resume.mangaId);
        if (latest == null) { cache[cacheKey] = { ts: now, hasUpdate: false }; continue; }

        const currentCh = s.chapter || s.currentChapter || 1;
        const hasUpdate = latest > currentCh;
        cache[cacheKey] = { ts: now, hasUpdate };
        if (hasUpdate) newUpdates.add(cacheKey);
      }

      await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
      setUpdatesSet(newUpdates);
    } catch (_) {}
  }

  async function handleDeleteFromLibrary() {
    const series = contextMenu.series;
    closeContextMenu();
    hapticWarning();
    if (series?.savedFromFeed || series?.id?.startsWith?.('sb-')) {
      const updated = savedItems.filter((s) => s.id !== series.id);
      setSavedItems(updated);
      await AsyncStorage.setItem('@panelr_saved', JSON.stringify(updated.filter((s) => !s.id?.startsWith?.('sb-')))).catch(() => {});
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        supabase.from('reading_progress').delete()
          .eq('user_id', session.user.id).eq('series_title', series.title).eq('status', 'bookmarked').then(() => {});
      }
    } else if (series?.id) {
      const keys = new Set([series.id]);
      if (series.id.startsWith('hist-')) keys.add(series.id.slice(5));
      if (series.id.startsWith('prog-')) keys.add(series.id.slice(5));
      if (series.title)    keys.add(series.title);
      if (series.searchKey) keys.add(series.searchKey);
      setDeletedIds((prev) => new Set([...prev, ...keys]));

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && series.title) {
        // Remove from Supabase so it doesn't reappear after reload
        supabase.from('reading_progress').delete()
          .eq('user_id', session.user.id).eq('series_title', series.title).then(() => {});
      }
      // Remove from local reading history so hist-* items don't come back on focus
      if (series.id.startsWith('hist-')) {
        try {
          const raw = await AsyncStorage.getItem('@panelr_reading_history');
          if (raw) {
            const hist = JSON.parse(raw);
            delete hist[series.searchKey];
            if (series.title) delete hist[series.title];
            await AsyncStorage.setItem('@panelr_reading_history', JSON.stringify(hist));
            setHistoryItems((prev) => prev.filter((h) => h.searchKey !== series.searchKey && h.title !== series.title));
          }
        } catch (_) {}
      }
    }
  }

  async function handleAddToBookmarked() {
    const series = contextMenu.series;
    closeContextMenu();
    hapticSuccess();
    if (!series || savedItems.some((s) => s.id === series.id)) return;
    const newItem = {
      ...series,
      progress: 0,
      bookmarked: true,
      savedFromFeed: true,
    };
    const updated = [newItem, ...savedItems];
    setSavedItems(updated);
    await AsyncStorage.setItem('@panelr_saved', JSON.stringify(updated)).catch(() => {});
    // Persist bookmark to Supabase (won't overwrite existing reading/completed progress)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      supabase.from('reading_progress').upsert({
        user_id: session.user.id,
        series_title: series.title,
        status: 'bookmarked',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }).then(() => {});
    }
  }

  async function handleMarkAsCompleted() {
    const series = contextMenu.series;
    closeContextMenu();
    if (!series) return;
    hapticSuccess();

    // Mark locally with all keys so all filter arrays pick it up
    const keys = new Set([series.id]);
    if (series.id?.startsWith('hist-')) keys.add(series.id.slice(5));
    if (series.id?.startsWith('prog-')) keys.add(series.id.slice(5));
    if (series.title)                   keys.add(series.title);
    if (series.searchKey)               keys.add(series.searchKey);
    setCompletedIds((prev) => new Set([...prev, ...keys]));

    // Update progressRows immediately so Completed tab shows it without re-navigation
    setProgressRows((prev) => {
      const exists = prev.find((r) => r.series_title === series.title);
      if (exists) {
        return prev.map((r) => r.series_title === series.title ? { ...r, status: 'completed' } : r);
      }
      return [...prev, {
        series_title: series.title,
        current_chapter: series.currentChapter || series.chapters || 1,
        total_chapters: series.chapters || null,
        status: 'completed',
        updated_at: new Date().toISOString(),
      }];
    });

    // Persist to Supabase with progress=1
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const uid = session.user.id;
      supabase.from('reading_progress').upsert({
        user_id: uid,
        series_title: series.title,
        current_chapter: series.chapters || series.currentChapter || 1,
        total_chapters: series.chapters || null,
        status: 'completed',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title' }).then(() => {});

      supabase.from('activity_feed').insert({
        user_id: uid,
        type: 'series_completed',
        data: { series_title: series.title },
      }).then(() => {});

      // Increment completed_count in profile for badge tracking
      const prev = profile?.completed_count || 0;
      updateProfile({ completed_count: prev + 1 });
    }
  }

  function onRefresh() {
    setRefreshing(true);
    refreshProfile();
    getLastRead().then((lr) => { if (lr) setLastReadEntry(lr); });
    getReadingHistory().then((items) => setHistoryItems(items));
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) { setRefreshing(false); return; }
      supabase
        .from('reading_progress')
        .select('series_title, current_chapter, total_chapters, status, updated_at')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false })
        .then(({ data }) => {
          if (data) {
            setProgressRows(data.filter((r) => r.status !== 'bookmarked'));
            AsyncStorage.getItem('@panelr_saved').then((val) => {
              let localItems = [];
              try { localItems = val ? JSON.parse(val) : []; } catch (_) {}
              const localTitles = new Set(localItems.map((s) => s.title));
              const serverBookmarks = data
                .filter((r) => r.status === 'bookmarked' && !localTitles.has(r.series_title))
                .map((r) => ({
                  id: `sb-${r.series_title}`,
                  title: r.series_title,
                  searchKey: r.series_title,
                  rating: null,
                  progress: 0,
                  chapters: 0,
                  color: '#1A1A2E',
                  bookmarked: true,
                }));
              setSavedItems([...serverBookmarks, ...localItems]);
            });
          }
          setRefreshing(false);
        });
    });
  }

  // Continue reading card scale animation
  const continueScale = useRef(new Animated.Value(1)).current;

  function pressContinue() {
    Animated.sequence([
      Animated.spring(continueScale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(continueScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    if (continueReading) openReader(continueReading);
  }


  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#534AB7" colors={['#534AB7']} />}>

        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>
          <View style={styles.streakBadge}>
            <Text style={styles.fireEmoji}>🔥</Text>
            <Text style={styles.streakText}>{profile?.streak_count || 0} day streak </Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.searchBar, { borderColor: colors.border }]} onPress={openSearch}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <Text style={[styles.searchPlaceholder, { color: colors.muted }]}>Search manga, webtoons...</Text>
        </TouchableOpacity>

        {continueReading && (
          <Animated.View style={{ transform: [{ scale: continueScale }] }}>
            <TouchableOpacity
              style={styles.continueCard}
              onPress={pressContinue}
              activeOpacity={0.82}>
              <MangaCover
                title={continueReading.title}
                searchKey={continueReading.searchKey}
                lang={continueReading.lang}
                color={continueReading.color || '#1A1A2E'}
                style={styles.continueCover}>
                <View style={styles.continueCoverPlay}>
                  <Ionicons name="play" size={10} color="#fff" />
                </View>
              </MangaCover>
              <View style={styles.continueInfo}>
                <Text style={styles.continueLabel}>Continue Reading</Text>
                <Text style={[styles.continueTitle, { color: colors.text }]} numberOfLines={1}>
                  {continueReading.title}
                </Text>
                <Text style={[styles.continueChapter, { color: colors.muted }]}>
                  {continueReading.chapterLabel ||
                    (continueReading.currentChapter
                      ? `Chapter ${continueReading.currentChapter}`
                      : `Chapter ${Math.floor((continueReading.chapters || 1) * (continueReading.progress || 0.1))}`)}
                </Text>
                {(() => {
                  const ch = continueReading.currentChapter || continueReading.chapter || 1;
                  const total = continueReading.chapters || 0;
                  if (total > 0 && total < 999) {
                    const pct = Math.max(2, Math.min(99, Math.round((ch / total) * 100)));
                    return (
                      <View style={styles.continueProgressBar}>
                        <View style={[styles.continueProgressFill, { width: `${pct}%` }]} />
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
              <View style={styles.continuePlayBtn}>
                <Ionicons name="play" size={16} color="#534AB7" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={[styles.tabsRow, { backgroundColor: colors.border }]}>
          {TABS.map((tab) => (
            <TabButton key={tab} tab={tab} active={activeTab === tab} onPress={setActiveTab} />
          ))}
        </View>

        {activeTab === 'Downloaded' && filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-download-outline" size={36} color={colors.muted} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.muted }]}>No Downloaded Chapters </Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>→ Download Chapter for offline reading</Text>
          </View>
        ) : activeTab === 'Bookmarked' && savedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={36} color={colors.muted} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.muted }]}>No saved series yet </Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>Tap Save on any series in your feed </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((series, index) => (
              <GridItem
                key={`${focusKey}-${activeTab}-${series.id}`}
                series={series}
                activeTab={activeTab}
                index={index}
                onPress={() => openReader(series)}
                onLongPress={handleLongPress}
                opening={openingId === series.id}
                hasUpdate={updatesSet.has(series.searchKey || series.title)}
              />
            ))}
          </View>
        )}

        {filtered.length === 0 && activeTab !== 'Bookmarked' && activeTab !== 'Downloaded' && (
          libLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#534AB7" size="large" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.muted }]}>Nothing here yet </Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>Start exploring to fill your library </Text>
            </View>
          )
        )}

        <View style={{ height: 88 }} />
      </ScrollView>

      {/* Long-press context menu */}
      <Modal visible={contextMenu.visible} transparent animationType="fade" onRequestClose={closeContextMenu}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeContextMenu} />
        {contextMenu.pos && (() => {
          const { width: sw } = Dimensions.get('window');
          const menuW = 210;
          const { x, y, width: iw, height: ih } = contextMenu.pos;
          let menuLeft = x + iw + 6;
          if (menuLeft + menuW > sw - 8) menuLeft = x - menuW - 6;
          const menuTop = Math.max(60, y);
          return (
            <View style={[styles.contextMenu, { top: menuTop, left: menuLeft }]}>
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleDeleteFromLibrary}>
                <Ionicons name="trash-outline" size={15} color="#FF3B30" />
                <Text style={[styles.contextMenuText, { color: '#FF3B30' }]}>Delete from Library</Text>
              </TouchableOpacity>
              <View style={styles.contextDivider} />
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleAddToBookmarked}>
                <Ionicons name="bookmark-outline" size={15} color="#A09CE0" />
                <Text style={styles.contextMenuText}>Add to Bookmarked</Text>
              </TouchableOpacity>
              <View style={styles.contextDivider} />
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleMarkAsCompleted}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#1D9E75" />
                <Text style={[styles.contextMenuText, { color: '#1D9E75' }]}>Mark as Completed</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={searchOpen} animationType="fade" transparent onRequestClose={closeSearch}>
        <TouchableOpacity style={styles.searchOverlay} activeOpacity={1} onPress={closeSearch}>
          <TouchableOpacity style={[styles.searchPanel, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={1}>
            <View style={[styles.searchInputRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                ref={inputRef}
                style={[styles.searchInput, { color: colors.text }]}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => submitSearch()}
                placeholder="Search manga, webtoons..."
                placeholderTextColor={colors.muted}
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={closeSearch}>
                  <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.searchBody}>
              {query.trim().length > 0 ? (
                searchResults.length > 0 ? (
                  <View style={styles.searchSection}>
                    <View style={styles.searchSectionHeader}>
                      <Ionicons name="book-outline" size={11} color={colors.muted} />
                      <Text style={[styles.searchSectionTitle, { color: colors.muted }]}>Results</Text>
                    </View>
                    {searchResults.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.searchResultRow}
                        onPress={() => openFromSearch(item)}
                        activeOpacity={0.7}>
                        <View style={[styles.searchResultDot, { backgroundColor: item.color || '#534AB7' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.searchResultTitle, { color: colors.text }]}>{item.title}</Text>
                          {item.genres?.length > 0 && (
                            <Text style={[styles.searchResultMeta, { color: colors.muted }]}>
                              {item.genres.slice(0, 2).join(' · ')}
                            </Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={13} color={colors.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.searchSection}>
                    <TouchableOpacity style={styles.recentRow} onPress={() => submitSearch()}>
                      <Ionicons name="search" size={13} color={colors.muted} style={{ marginRight: 8 }} />
                      <Text style={[styles.recentTermText, { color: colors.text }]}>Search "{query}" on the web</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <>
                  {recentSearches.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <Ionicons name="time-outline" size={11} color={colors.muted} />
                        <Text style={[styles.searchSectionTitle, { color: colors.muted }]}>Recent</Text>
                      </View>
                      {recentSearches.map((term) => (
                        <View key={term} style={styles.recentRow}>
                          <TouchableOpacity style={styles.recentTermBtn} onPress={() => submitSearch(term)}>
                            <Text style={[styles.recentTermText, { color: colors.text }]}>{term}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeRecent(term)} style={{ padding: 6 }}>
                            <Ionicons name="close" size={13} color={colors.muted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.searchSection}>
                    <View style={styles.searchSectionHeader}>
                      <Ionicons name="trending-up" size={11} color={colors.muted} />
                      <Text style={[styles.searchSectionTitle, { color: colors.muted }]}>Trending</Text>
                    </View>
                    <View style={styles.trendingWrap}>
                      {TRENDING.map((term, i) => (
                        <TouchableOpacity
                          key={term}
                          style={[styles.trendingChip, { backgroundColor: colors.border }]}
                          onPress={() => submitSearch(term)}>
                          <Text style={[styles.trendingNum, { color: colors.muted }]}>{i + 1}</Text>
                          <Text style={[styles.trendingText, { color: colors.text }]}>{term}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, marginBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,149,0,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  fireEmoji: { fontSize: 12 },
  streakText: { color: '#FF9500', fontSize: 11, fontWeight: '600', marginLeft: 5, paddingRight: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(155,154,163,0.08)', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 11, marginHorizontal: 20, marginBottom: 16 },
  searchPlaceholder: { fontSize: 13, marginLeft: 10 },
  continueCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(83,74,183,0.15)', borderWidth: 1, borderColor: 'rgba(83,74,183,0.2)', borderRadius: 16, padding: 12, marginHorizontal: 20, marginBottom: 16 },
  continueCover: { width: 48, height: 66, borderRadius: 10, marginRight: 12 },
  continueCoverPlay: { position: 'absolute', bottom: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(83,74,183,0.88)', alignItems: 'center', justifyContent: 'center' },
  continueInfo: { flex: 1 },
  continueLabel: { color: '#534AB7', fontSize: 11, fontWeight: '500' },
  continueTitle: { fontSize: 14, fontWeight: '600', marginTop: 1 },
  continueChapter: { fontSize: 11, marginTop: 1 },
  continuePlayBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(83,74,183,0.2)', alignItems: 'center', justifyContent: 'center' },
  continueProgressBar: { height: 3, backgroundColor: 'rgba(83,74,183,0.18)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  continueProgressFill: { height: 3, backgroundColor: '#534AB7', borderRadius: 2 },
  tabsRow: { flexDirection: 'row', borderRadius: 12, padding: 4, marginHorizontal: 20, marginBottom: 20 },
  tab: { flex: 1, borderRadius: 9 },
  tabInner: { paddingVertical: 8, alignItems: 'center' },
  tabActive: {},
  tabText: { fontSize: 11.5, fontWeight: '500' },
  tabTextActive: { fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  gridItem: { width: '31%', marginHorizontal: '1.16%', marginBottom: 20 },
  cover: { width: '100%', aspectRatio: 0.66, borderRadius: 12, overflow: 'hidden', marginBottom: 6 },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: 3, backgroundColor: '#534AB7' },
  savedBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(83,74,183,0.25)', borderRadius: 10, padding: 3 },
  downloadedBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(29,158,117,0.25)', borderRadius: 10, padding: 3 },
  cloudBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 3 },
  updateBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#1D9E75', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  updateBadgeText: { color: '#fff', fontSize: 8, fontWeight: 'bold', letterSpacing: 0.3 },
  completeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  completePill: { backgroundColor: '#1D9E75', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  completePillText: { color: '#fff', fontSize: 9, fontWeight: 'bold', paddingRight: 2 },
  coverCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverLetter: { color: 'rgba(255,255,255,0.15)', fontSize: 26, fontWeight: 'bold' },
  itemTitle: { fontSize: 11.5, fontWeight: '600' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  itemRating: { fontSize: 10, marginLeft: 3, marginRight: 6 },
  itemProgress: { fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 14, fontWeight: '600' },
  emptySub: { fontSize: 11, marginTop: 6 },
  contextMenu: { position: 'absolute', width: 210, backgroundColor: 'rgba(22,22,28,0.93)', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(83,74,183,0.22)', overflow: 'hidden' },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  contextMenuText: { color: '#E8E8F0', fontSize: 13, fontWeight: '500', marginLeft: 10, flex: 1 },
  contextDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  searchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  searchPanel: { position: 'absolute', top: 50, left: 16, right: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden', maxHeight: '75%' },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, marginLeft: 10 },
  cancelText: { fontSize: 12 },
  searchBody: { padding: 14 },
  searchSection: { marginBottom: 16 },
  searchSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  searchSectionTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginLeft: 5, textTransform: 'uppercase' },
  recentRow: { flexDirection: 'row', alignItems: 'center' },
  recentTermBtn: { flex: 1, paddingHorizontal: 8, paddingVertical: 7 },
  recentTermText: { fontSize: 13 },
  trendingWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  trendingChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  trendingNum: { fontSize: 10, fontFamily: 'monospace', marginRight: 6 },
  trendingText: { fontSize: 12 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  searchResultDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  searchResultTitle: { fontSize: 14, fontWeight: '600' },
  searchResultMeta: { fontSize: 11, marginTop: 2 },
});
