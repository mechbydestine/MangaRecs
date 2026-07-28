import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Image,
  ScrollView, RefreshControl, Animated, Dimensions, ActivityIndicator, Platform, PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { MangaCover } from '../utils/mangaCovers';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { supabase } from '../supabase';
import { syncReadOpen, getLastRead, getReadingHistory, setLastRead as saveLastRead, syncLibraryWrite } from '../utils/readerUtils';
import { getLatestChapter, searchMangaDexList, searchMangaDex, getMangaStatistics } from '../utils/mangaDexApi';
import { light, medium, heavy, success as hapticSuccess, warning as hapticWarning } from '../utils/haptics';
import { MANGA_POOL, COMPLETED_IDS, getRecentlyAddedIds, findPoolEntry } from '../utils/mangaPool';
import { ALL_SUPPORTED_SITES, siteFaviconUrl } from '../utils/mangaSearch';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers';
import { isJunkTitle } from '../utils/titleValidation';
import { maybeAskForReview } from '../utils/reviewPrompt';
import { CoverGridSkeleton } from '../components/Skeleton';
import { StarRatingInput, StarRatingDisplay } from '../components/StarRating';
import { rateSeries, getSeriesRating } from '../utils/ratings';
import { useResponsive, TABLET_GRID_MAX_WIDTH } from '../utils/responsive';

const TRENDING = ['TBATE', 'Solo Leveling', 'Murim Login', 'Omniscient Reader', 'Tower of God'];
const TABS = ['Reading', 'Bookmarked', 'Downloaded', 'Completed'];
// Context-menu delete label matches whichever tab the long-pressed entry lives
// in, instead of a generic "Delete from Library" — each entry only ever lives
// in one section at a time, so this is always accurate.
const DELETE_LABEL = {
  Reading: 'Delete from Reading',
  Completed: 'Delete from Completed',
  Bookmarked: 'Delete from Bookmarked',
  Downloaded: 'Delete from Downloaded',
};
const UPDATE_CACHE_KEY = '@mangarecs/updates_cache';
const UPDATE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const UPDATE_DISMISSED_KEY = '@mangarecs/updates_dismissed';
const JUST_ADDED_WINDOW = 10 * 60 * 1000; // 10 minutes — how long the "JUST ADDED" badge lingers

// Resolve whatever shape a saved "site" ended up as — an object ({name,url}
// from the normal auto-resolve flow), a bare name string (from an explicit
// "Read Available" pick), or occasionally already a URL — into a favicon.
function resolveSiteFavicon(site) {
  if (!site) return null;
  if (typeof site === 'object') return siteFaviconUrl(site.url);
  if (typeof site === 'string') {
    if (/^https?:\/\//i.test(site)) return siteFaviconUrl(site);
    const match = ALL_SUPPORTED_SITES.find((s) => s.name.toLowerCase() === site.toLowerCase());
    return match ? siteFaviconUrl(match.url) : null;
  }
  return null;
}
// v2: getMangaStatistics now returns { rating, readers } (was a bare, halved
// rating number) and ratings are on the pool's native 0–10 scale — bump the
// key so devices don't keep serving the old halved value for up to 7 days.
const RATINGS_CACHE_KEY = '@mangarecs/ratings_cache_v2';
const RATINGS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const SORT_MODE_KEY = '@mangarecs/library_sort_mode';
const CUSTOM_ORDER_KEY = '@mangarecs/library_custom_order';
const SORT_MODES = [
  { key: 'recent', label: 'Recent' },
  { key: 'alpha',  label: 'A–Z' },
  { key: 'custom', label: 'Custom' },
];

// Stable identity for a library item across tabs and sessions
const keyOf = (s) => s.searchKey || s.title;

// ── GridItem with entrance animation ──────────────────────────────────────

function GridItem({ series, activeTab, onPress, onLongPress, index, opening, newChapterCount, isNewInPool, siteIcon, arranging, pinned, onSlotLayout, onDragStart, onDrop, widthPct }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);

  // Refs so the once-created PanResponder always sees current values
  const indexRef = useRef(index);
  indexRef.current = index;
  const canDragRef = useRef(false);
  canDragRef.current = arranging && !pinned;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 160,
      delay: 0,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  // App-icon style jiggle while arrange mode is on (pinned tiles sit still)
  useEffect(() => {
    if (!arranging || pinned) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(wiggle, { toValue: 1,  duration: 130, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -1, duration: 260, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0,  duration: 130, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); wiggle.setValue(0); };
  }, [arranging, pinned]);

  // Drag-to-rearrange: capture the touch before the inner Touchable when
  // arrange mode is on, follow the finger, and let the parent work out the
  // drop slot from the release offset.
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => canDragRef.current,
    onMoveShouldSetPanResponderCapture: () => canDragRef.current,
    onPanResponderGrant: () => { setDragging(true); onDragStartRef.current?.(); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      setDragging(false);
      pan.setValue({ x: 0, y: 0 });
      onDropRef.current?.(indexRef.current, g.dx, g.dy);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      pan.setValue({ x: 0, y: 0 });
      onDropRef.current?.(indexRef.current, 0, 0);
    },
  })).current;

  const opacity    = anim;
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  const rotate     = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] });

  const isSaved     = series.savedFromFeed;
  const progressPct = series.progress ?? 0;
  // Only claim a percentage when the chapter total is actually known —
  // fallback progress values (unknown totals) would show made-up numbers
  const hasRealTotal = (series.chapters || 0) > 0 && (series.chapters || 0) < 999;
  const showPct = progressPct > 0 && (hasRealTotal || progressPct >= 1) && (activeTab === 'Reading' || activeTab === 'Completed');

  function handleLongPress() {
    if (containerRef.current && onLongPress) {
      containerRef.current.measure((x, y, w, h, pageX, pageY) => {
        onLongPress(series, { x: pageX, y: pageY, width: w, height: h });
      });
    }
  }

  return (
    <Animated.View
      ref={containerRef}
      onLayout={(e) => onSlotLayout?.(index, e.nativeEvent.layout)}
      {...panResponder.panHandlers}
      style={[styles.gridItem, { width: `${widthPct}%` }, dragging && styles.gridItemDragging, { transform: pan.getTranslateTransform() }]}>
      <Animated.View style={{ opacity, transform: [{ scale }, { translateY }, { rotate }] }}>
      <TouchableOpacity onPress={onPress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.82} disabled={opening || arranging}>
        <MangaCover title={series.title} searchKey={series.searchKey} lang={series.lang} color={series.color} contentRating={series.contentRating} nsfw={series.nsfw} style={styles.cover}>
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

          {siteIcon && (
            <View style={styles.siteFaviconBadge}>
              <Image source={{ uri: siteIcon }} style={styles.siteFaviconImg} />
            </View>
          )}

          {newChapterCount > 0 ? (
            <View style={[styles.updateBadge, styles.newChapterBadge]}>
              <Text style={styles.updateBadgeText}>NEW CHAPTER</Text>
            </View>
          ) : isNewInPool ? (
            <View style={styles.updateBadge}>
              <Text style={styles.updateBadgeText}>JUST ADDED</Text>
            </View>
          ) : null}

          {progressPct >= 1 && (
            <View style={styles.completeOverlay}>
              <View style={styles.completePill}>
                <Text style={styles.completePillText}>COMPLETE</Text>
              </View>
            </View>
          )}

          {hasRealTotal && (
            <View style={styles.chapterCountBadge}>
              <Text style={styles.chapterCountText}>{series.chapters} ch</Text>
            </View>
          )}

          <View style={styles.coverCenter}>
            <Text style={styles.coverLetter}>{series.title[0]}</Text>
          </View>
        </MangaCover>

        <Text style={[styles.itemTitle, { color: opening ? '#7B5CFF' : colors.text }]} numberOfLines={1}>
          {opening ? 'Opening…' : series.title}
        </Text>
        <View style={styles.itemMeta}>
          {activeTab === 'Downloaded' ? (
            // Downloads have no rating — show what actually matters offline
            <Text style={[styles.itemRating, { color: colors.muted }]} numberOfLines={1}>
              {series.chapterLabel || `Ch. ${series.chapter || 1}`}{series.pageCount ? ` · ${series.pageCount} pgs` : ''}
            </Text>
          ) : (
            <>
              {series.rating ? (
                <>
                  <Ionicons name="star" size={10} color="#FFD700" />
                  <Text style={[styles.itemRating, { color: colors.muted }]}>{Number(series.rating).toFixed(1)}</Text>
                </>
              ) : null}
              {showPct && (
                <Text style={[styles.itemProgress, progressPct >= 1 ? { color: '#1D9E75' } : { color: colors.muted }]}>
                  {Math.min(100, Math.max(1, Math.round(progressPct * 100)))}%
                </Text>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
      </Animated.View>
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
        <Text
          style={[styles.tabText, { color: colors.muted }, active && [styles.tabTextActive, { color: colors.text }]]}
          numberOfLines={1}
          allowFontScaling={false}
          adjustsFontSizeToFit={Platform.OS === 'ios'}
          minimumFontScale={0.75}
        >
          {tab}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Column count and item width are derived per-render from live window width
// (see useResponsive() in the screen body) so rotating/resizing a tablet
// updates the grid instead of freezing whatever Dimensions.get() returned at
// module load.
const ITEM_MARGIN_H = 1.0; // % each side
// Budget 99% not 100% — an exactly-full row wraps its last item due to
// sub-pixel rounding, collapsing the grid to 2 columns.
function itemWidthPct(numCols) {
  return (99 - numCols * ITEM_MARGIN_H * 2) / numCols;
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { profile, updateProfile, refreshProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const numCols = isTablet ? 4 : 3;
  const gridItemWidthPct = itemWidthPct(numCols);
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
  const [rateModal, setRateModal] = useState({ visible: false, series: null, avg: 0, count: 0, yourRating: 0, loading: false, submitting: false });
  const [progressRows, setProgressRows] = useState([]);
  const [lastReadEntry, setLastReadEntry] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [openingId, setOpeningId] = useState(null);
  const [libLoading, setLibLoading] = useState(true);
  const [updatesMap, setUpdatesMap] = useState(new Map());
  const [siteIconMap, setSiteIconMap] = useState(new Map());
  const [newPoolIds, setNewPoolIds] = useState(new Set());
  const [ratingsMap, setRatingsMap] = useState({});
  const ratingsFetchedRef = useRef(new Set());
  const [sortMode, setSortMode] = useState('recent');
  const [genreFilter, setGenreFilter] = useState(null);
  const [showGenreFilter, setShowGenreFilter] = useState(false);
  const [customOrder, setCustomOrder] = useState([]);
  const [arranging, setArranging] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const slotRects = useRef({});
  const [userId, setUserId] = useState(null);

  // Restore sort preference and the user's custom arrangement
  useEffect(() => {
    AsyncStorage.getItem(SORT_MODE_KEY).then((v) => {
      if (v && SORT_MODES.some((m) => m.key === v)) setSortMode(v);
    }).catch(() => {});
    AsyncStorage.getItem(CUSTOM_ORDER_KEY).then((v) => {
      try { if (v) setCustomOrder(JSON.parse(v)); } catch (_) {}
    }).catch(() => {});
  }, []);

  // Reload saved items, reading progress, and replay grid animations every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      setFocusKey((k) => k + 1);
      setOpeningId(null);
      setArranging(false);
      setScrollLocked(false);
      setLibLoading(true);

      // Load most recently read series for Continue Reading card
      getLastRead().then((lr) => { if (lr) setLastReadEntry(lr); });
      // Which pool entries appeared recently (green NEW badge)
      getRecentlyAddedIds(JUST_ADDED_WINDOW).then(setNewPoolIds);
      // Load full reading history for the Reading tab; also kick off background update check
      getReadingHistory().then((items) => {
        setHistoryItems(items);
        checkUpdatesInBackground(items);
        loadSiteIcons(items);
      });

      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        setUserId(uid || null);

        // Load local bookmarks first, then merge with Supabase (avoids race condition)
        AsyncStorage.getItem('@mangarecs_saved').then((val) => {
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
                  .filter((r) => r.series_title && !isJunkTitle(r.series_title))
                  .map((r) => {
                    const pool = findPoolEntry(r.series_title);
                    return {
                      id: `sb-${r.series_title}`,
                      title: r.series_title,
                      searchKey: pool?.searchKey || r.series_title,
                      lang: pool?.lang || 'ja',
                      rating: pool?.rating || null,
                      progress: 0,
                      chapters: pool?.chapters || 0,
                      color: pool?.color || '#1A1A2E',
                      bookmarked: true,
                    };
                  });
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
    AsyncStorage.getItem('@mangarecs_search_history').then((val) => {
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
    AsyncStorage.setItem('@mangarecs_search_history', JSON.stringify(updated)).catch(() => {});
    closeSearch();
    navigation.navigate('Reader', { searchQuery: q.trim(), title: q.trim(), chapters: 999 });
  }

  function removeRecent(term) {
    const updated = recentSearches.filter((r) => r !== term);
    setRecentSearches(updated);
    AsyncStorage.setItem('@mangarecs_search_history', JSON.stringify(updated)).catch(() => {});
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

  // MangaDex API search — covers everything not in the local pool (debounced)
  const [apiResults, setApiResults] = useState([]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setApiResults([]); return; }
    const timer = setTimeout(() => {
      searchMangaDexList(term, { limit: 8 }).then((items) => {
        setApiResults(items.map((m) => ({
          id: `mdx-${m.id}`,
          mangaId: m.id,
          title: m.title,
          searchKey: m.title,
          lang: m.lang,
          chapters: m.chapters || 999,
          color: '#1A1A2E',
          genres: [],
          fromApi: true,
        })));
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Local pool first, then API results deduped by normalized title
  const localTitleSet = new Set(searchResults.map((m) => (m.title || '').toLowerCase()));
  const mergedResults = [
    ...searchResults,
    ...apiResults.filter((m) => !localTitleSet.has((m.title || '').toLowerCase())),
  ];

  function openFromSearch(item) {
    const updated = [item.title, ...recentSearches.filter((r) => r !== item.title)].slice(0, 5);
    setRecentSearches(updated);
    AsyncStorage.setItem('@mangarecs_search_history', JSON.stringify(updated)).catch(() => {});
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
      mangaId: item.mangaId,
      lang: item.lang || 'ja',
    });
  }

  const staticPool = [];

  // ── Auto-complete ─────────────────────────────────────────────────────────
  // A series read to its final chapter that is *known* to be finished (pool
  // status or the concluded-series list) moves itself to Completed — no need
  // to long-press "Mark as Completed".

  function isKnownFinished(title) {
    const pool = findPoolEntry(title);
    if (!pool) return false;
    return pool.status === 'completed' || COMPLETED_IDS.has(String(pool.id));
  }

  useEffect(() => {
    if (!userId || progressRows.length === 0) return;
    const done = progressRows.filter((r) =>
      r.status === 'reading' &&
      (r.total_chapters || 0) > 0 &&
      (r.current_chapter || 0) >= r.total_chapters &&
      isKnownFinished(r.series_title)
    );
    if (done.length === 0) return;
    const titles = new Set(done.map((r) => r.series_title));
    setProgressRows((prev) => prev.map((r) => titles.has(r.series_title) ? { ...r, status: 'completed' } : r));
    done.forEach((r) => {
      supabase.from('reading_progress')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('series_title', r.series_title)
        .then(() => {});
    });
  }, [progressRows, userId]);

  // completedIds only ever grows (see handleMarkAsCompleted below) — it never
  // un-marks a title on its own. If a series is later reopened (status flips
  // back to 'reading', e.g. a reread), the stale flag stuck it in BOTH the
  // Reading tab (real status) and the Completed tab (leftover flag) at once,
  // so deleting the Reading-tab card also wiped the Completed one — they're
  // the same title, filtered by the same deletedIds/title match. Reconcile
  // completedIds against the authoritative status every time rows are (re)loaded.
  useEffect(() => {
    const stillReading = new Set(progressRows.filter((r) => r.status === 'reading').map((r) => r.series_title));
    if (stillReading.size === 0) return;
    setCompletedIds((prev) => {
      if (![...stillReading].some((t) => prev.has(t))) return prev;
      const next = new Set(prev);
      stillReading.forEach((t) => next.delete(t));
      return next;
    });
  }, [progressRows]);

  const liveReading = (() => {
    if (!profile?.currently_reading) return null;
    const prog = progressRows.find((r) => r.series_title === profile.currently_reading);
    const pool = findPoolEntry(profile.currently_reading);
    // Real chapter total: synced progress first, then the pool's known count —
    // never invent a percentage from a fallback total
    const total = prog?.total_chapters || pool?.chapters || 0;
    const liveProgress = total
      ? Math.min((prog?.current_chapter || 1) / total, 0.99)
      : 0;
    return {
      id: 'live',
      title: profile.currently_reading,
      searchKey: pool?.searchKey || profile.currently_reading,
      lang: pool?.lang || 'ja',
      color: pool?.color || '#1A1A2E',
      currentChapter: prog?.current_chapter || profile.current_chapter || 1,
      chapters: total || 999,
      progress: liveProgress,
      rating: pool?.rating || null,
    };
  })();

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
    .filter((r) => r.series_title && !isJunkTitle(r.series_title))
    .map((r) => {
      const pool = findPoolEntry(r.series_title);
      const total = r.total_chapters || pool?.chapters || 0;
      return {
        id: `prog-${r.series_title}`,
        title: r.series_title,
        searchKey: pool?.searchKey || r.series_title,
        lang: pool?.lang || 'ja',
        color: pool?.color || '#1A1A2E',
        currentChapter: r.current_chapter || 1,
        chapters: total || 999,
        progress: total ? Math.min((r.current_chapter || 1) / total, 0.99) : 0,
        rating: pool?.rating || null,
      };
    });

  // Note: raw reading history (historyItems, from getReadingHistory) is deliberately
  // NOT surfaced in the Reading tab grid — it's scraped webview page titles and often
  // picks up junk (cookie banners, site taglines) that isJunkTitle can't fully
  // filter. It only feeds checkUpdatesInBackground; "Continue Reading" is the sole
  // place recent history is shown, sourced from the single most-recent lastReadEntry.

  const liveReadingValid = liveReading
    && !deletedIds.has('live')
    && !deletedIds.has(liveReading.title)
    && !deletedIds.has(liveReading.searchKey)
    && !isJunkTitle(liveReading.title)
    && !liveReading.title?.startsWith('http')
    // profile.currently_reading is a standalone "last opened" pointer that
    // never gets cleared when that series' real reading_progress row moves to
    // 'completed' (or gets bookmarked/deleted) — so it kept rendering a
    // phantom "still reading" card here even after the authoritative row said
    // otherwise. That phantom card shares the same title as the real row, so
    // deleting it deleted the real (e.g. completed) row too. Defer entirely
    // to reading_progress whenever it already has ANY row for this title.
    && !progressRows.some((r) => r.series_title === liveReading.title);

  // Same series can end up saved under slightly different scraped title
  // spellings ("Sword God From..." vs "The Sword God From The Ruined
  // World...") across separate reading_progress rows — an exact-match-after-
  // normalizing dedup still misses these since the strings genuinely differ
  // beyond just a leading article. Fall back to substring containment (either
  // direction) so near-duplicates still collapse, and when two rows do
  // collapse, keep whichever one actually resolves a real pool cover instead
  // of whichever came first — otherwise the tile that survives can be the
  // placeholder-letter one instead of the one with real art/rating.
  function normalizeTitleKey(title) {
    return (title || '')
      .toLowerCase()
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function dedupeByNormalizedTitle(list) {
    const keys = [];
    const bestBySlot = new Map();
    for (const s of list) {
      const key = normalizeTitleKey(s.title);
      if (!key) continue;
      let slot = keys.find((k) => k === key || (k.length >= 6 && key.length >= 6 && (k.includes(key) || key.includes(k))));
      if (!slot) { slot = key; keys.push(key); }
      const current = bestBySlot.get(slot);
      if (!current) {
        bestBySlot.set(slot, s);
      } else {
        const poolCoverResolved = (item) => {
          const pool = findPoolEntry(item.title, item.searchKey);
          return !!(pool && (POOL_COVER_URLS[pool.id] || item.coverUrl));
        };
        if (poolCoverResolved(s) && !poolCoverResolved(current)) bestBySlot.set(slot, s);
      }
    }
    return keys.map((k) => bestBySlot.get(k));
  }

  const readingSeries = dedupeByNormalizedTitle([
    ...(liveReadingValid && !baseReadingSeries.some((s) => s.title === liveReading.title) && !progressReading.some((s) => s.title === liveReading.title) ? [liveReading] : []),
    ...progressReading,
    ...baseReadingSeries,
  ]);

  const completedSeries = dedupeByNormalizedTitle([
    ...progressRows
      .filter((r) => (r.status === 'completed' || completedIds.has(r.series_title)) && !deletedIds.has(r.series_title))
      .filter((r) => r.series_title && !isJunkTitle(r.series_title))
      .map((r) => {
        const pool = findPoolEntry(r.series_title);
        return {
          id: `comp-${r.series_title}`,
          title: r.series_title,
          searchKey: pool?.searchKey || r.series_title,
          lang: pool?.lang || 'ja',
          color: pool?.color || '#1A1A2E',
          currentChapter: r.current_chapter || 1,
          chapters: r.total_chapters || pool?.chapters || 999,
          progress: 1,
          rating: pool?.rating || null,
        };
      }),
    ...staticPool.filter((s) => (s.progress >= 1 || completedIds.has(s.id)) && !deletedIds.has(s.id)),
  ]);

  // New-chapter / site-icon checks used to only ever see raw reading history,
  // which — per the note above — deliberately isn't the same set shown in
  // the Bookmarked/Completed tabs. Build the real union of what's actually
  // visible across all three so those tabs get the same badges as Reading.
  const bookmarkedForCheck = savedItems.filter((item) => !item.downloaded && !deletedIds.has(item.id));
  const combinedCheckItems = [];
  const combinedCheckKeys = new Set();
  for (const s of [...readingSeries, ...bookmarkedForCheck, ...completedSeries]) {
    const k = keyOf(s);
    if (k && !combinedCheckKeys.has(k)) { combinedCheckKeys.add(k); combinedCheckItems.push(s); }
  }
  // A plain string, not the array itself, so this only fires when the actual
  // set of items changes — the arrays above are freshly rebuilt every render.
  const combinedCheckSignature = combinedCheckItems.map((s) => keyOf(s)).sort().join('|');

  useEffect(() => {
    if (!combinedCheckItems.length) return;
    checkUpdatesInBackground(combinedCheckItems);
    loadSiteIcons(combinedCheckItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedCheckSignature]);

  // The resume cache's own searchKey can drift out of sync with its title
  // (e.g. a webview session navigating to a different manga mid-read updates
  // one but not the other) — MangaCover resolves the shown cover from
  // searchKey, so a stale one silently shows a completely different series'
  // cover under the correct title. Always re-derive searchKey fresh from the
  // pool using the title actually being displayed, rather than trusting
  // whatever was cached alongside it.
  const continueReadingPool = lastReadEntry ? findPoolEntry(lastReadEntry.title, lastReadEntry.searchKey) : null;
  const continueReading = lastReadEntry
    ? {
        id: 'last-read',
        title: lastReadEntry.title,
        searchKey: continueReadingPool?.searchKey || lastReadEntry.title,
        lang: continueReadingPool?.lang || lastReadEntry.lang || 'ja',
        color: continueReadingPool?.color || lastReadEntry.color || '#1A1A2E',
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
      // Downloaded chapters live in the same saved list but belong to their
      // own tab — keep them out of Bookmarked
      case 'Bookmarked': return savedItems.filter((item) => !item.downloaded && !deletedIds.has(item.id)).map((item) => ({
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

  // Sort the grid per the user's mode, then pin new-chapter entries to the
  // top of Reading — sticky updates win over every sort mode, including Custom.
  function applySort(list) {
    let sorted = list;
    if (sortMode === 'alpha') {
      sorted = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortMode === 'custom' && customOrder.length) {
      const pos = new Map(customOrder.map((k, i) => [k, i]));
      sorted = list
        .map((s, i) => ({ s, rank: pos.has(keyOf(s)) ? pos.get(keyOf(s)) : customOrder.length + i }))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.s);
    }
    if ((activeTab === 'Reading' || activeTab === 'Bookmarked' || activeTab === 'Completed') && updatesMap.size) {
      const pinned = sorted.filter((s) => updatesMap.has(keyOf(s)));
      if (pinned.length) sorted = [...pinned, ...sorted.filter((s) => !updatesMap.has(keyOf(s)))];
    }
    return sorted;
  }
  const sortedForTab = applySort(getFilteredSeries());

  // Genre chips: derived from whatever's actually in the current tab (via the
  // pool entry, since progress/bookmark rows don't carry genres themselves),
  // so the chip row only ever shows genres a user could actually narrow down to.
  function genresFor(series) {
    return findPoolEntry(series.title, series.searchKey)?.genres || [];
  }
  const tabGenres = [...new Set(sortedForTab.flatMap(genresFor))].sort();
  const filtered = genreFilter
    ? sortedForTab.filter((s) => genresFor(s).includes(genreFilter))
    : sortedForTab;
  const pinnedCount = (activeTab === 'Reading' || activeTab === 'Bookmarked' || activeTab === 'Completed')
    ? filtered.filter((s) => updatesMap.has(keyOf(s))).length
    : 0;

  function changeSortMode(mode) {
    light();
    setArranging(false);
    setScrollLocked(false);
    setSortMode(mode);
    AsyncStorage.setItem(SORT_MODE_KEY, mode).catch(() => {});
    // Entering Custom for the first time: seed the order from what's on
    // screen so rearranging starts from a familiar arrangement
    if (mode === 'custom' && customOrder.length === 0) {
      const seed = filtered.map(keyOf);
      setCustomOrder(seed);
      AsyncStorage.setItem(CUSTOM_ORDER_KEY, JSON.stringify(seed)).catch(() => {});
    }
  }

  function toggleArranging() {
    medium();
    const next = !arranging;
    setArranging(next);
    if (!next) setScrollLocked(false);
    if (next && customOrder.length === 0) {
      const seed = filtered.map(keyOf);
      setCustomOrder(seed);
      AsyncStorage.setItem(CUSTOM_ORDER_KEY, JSON.stringify(seed)).catch(() => {});
    }
  }

  // A tile was dragged and released: find the slot whose center is nearest to
  // where the tile landed, insert it there, and persist. Drops are clamped
  // below the pinned new-chapter section so sticky updates never move.
  function handleDrop(fromIndex, dx, dy) {
    setScrollLocked(false);
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // treat as a stray tap
    const from = slotRects.current[fromIndex];
    if (!from) return;
    const cx = from.x + from.width / 2 + dx;
    const cy = from.y + from.height / 2 + dy;
    let target = fromIndex;
    let best = Infinity;
    for (let i = 0; i < filtered.length; i++) {
      const r = slotRects.current[i];
      if (!r) continue;
      const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
      if (d < best) { best = d; target = i; }
    }
    target = Math.max(target, pinnedCount);
    if (target === fromIndex) return;
    const keys = filtered.map(keyOf);
    const [moved] = keys.splice(fromIndex, 1);
    keys.splice(target, 0, moved);
    // Keep custom positions of series from other tabs
    const merged = [...keys, ...customOrder.filter((k) => !keys.includes(k))];
    setCustomOrder(merged);
    AsyncStorage.setItem(CUSTOM_ORDER_KEY, JSON.stringify(merged)).catch(() => {});
    hapticSuccess();
  }

  async function openReader(series) {
    setOpeningId(series.id);
    dismissUpdateBadge(keyOf(series));

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
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: uid,
        series_title: series.title,
        current_chapter: series.currentChapter || 1,
        total_chapters: series.chapters || null,
        status: 'reading',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title' }), 'start reading');
    }
  }

  function handleLongPress(series, pos) {
    medium();
    setContextMenu({ visible: true, series, pos });
  }

  function closeContextMenu() {
    setContextMenu({ visible: false, series: null, pos: null });
  }

  // Caches the expensive part (MangaDex's "latest chapter" lookup) but always
  // compares it against the item's LIVE current-chapter, so a badge clears
  // the moment the user reads up to it instead of sticking around stale
  // until the 2-hour cache entry happens to expire.
  async function checkUpdatesInBackground(items) {
    if (!items?.length) return;
    try {
      const [cacheRaw, dismissedRaw] = await Promise.all([
        AsyncStorage.getItem(UPDATE_CACHE_KEY),
        AsyncStorage.getItem(UPDATE_DISMISSED_KEY),
      ]);
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
      // Chapters the user already tapped the badge for — stays suppressed
      // until an even newer chapter comes out past this value.
      const dismissed = dismissedRaw ? JSON.parse(dismissedRaw) : {};
      const now = Date.now();
      const newCounts = new Map();

      for (const s of items.slice(0, 20)) {
        const cacheKey = s.searchKey || s.title;
        if (!cacheKey) continue;

        const cached = cache[cacheKey];
        let latest = null;

        if (cached && now - cached.ts < UPDATE_CACHE_TTL) {
          latest = cached.latest;
        } else {
          // Prefer the exact id the reader already resolved (resume data);
          // fall back to a title search — same approach as the push-
          // notification checker in utils/chapterUpdates.js — so bookmarked
          // or never-opened-via-API series still get checked instead of
          // being silently skipped.
          let mangaId = cached?.mangaId || null;
          if (!mangaId) {
            const resumeKey = '@mangarecs/resume/' + encodeURIComponent(cacheKey);
            const resumeRaw = await AsyncStorage.getItem(resumeKey).catch(() => null);
            if (resumeRaw) {
              try {
                const resume = JSON.parse(resumeRaw);
                if (resume?.mode === 'api' && resume?.mangaId) mangaId = resume.mangaId;
              } catch (_) {}
            }
          }
          if (!mangaId) {
            const found = await searchMangaDex(cacheKey);
            mangaId = found?.id || null;
          }
          if (mangaId) {
            latest = await getLatestChapter(mangaId);
            // Brief pause between API calls to respect MangaDex rate limits
            await new Promise((r) => setTimeout(r, 500));
          }
          cache[cacheKey] = { ts: now, latest, mangaId };
        }

        const currentCh = s.chapter || s.currentChapter || 1;
        const dismissedAt = dismissed[cacheKey];
        if (latest != null && latest > currentCh && (dismissedAt == null || latest > dismissedAt)) {
          newCounts.set(cacheKey, Math.max(1, Math.floor(latest) - Math.floor(currentCh)));
        }
      }

      await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
      setUpdatesMap(newCounts);
    } catch (_) {}
  }

  // Tapping into a series clears its "New Chapter" badge immediately, not
  // only once actually read up to — recorded against the currently-known
  // latest chapter so a genuinely newer chapter later still re-shows it.
  async function dismissUpdateBadge(cacheKey) {
    if (!cacheKey) return;
    setUpdatesMap((prev) => {
      if (!prev.has(cacheKey)) return prev;
      const next = new Map(prev);
      next.delete(cacheKey);
      return next;
    });
    try {
      const [cacheRaw, dismissedRaw] = await Promise.all([
        AsyncStorage.getItem(UPDATE_CACHE_KEY),
        AsyncStorage.getItem(UPDATE_DISMISSED_KEY),
      ]);
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
      const latest = cache[cacheKey]?.latest;
      if (latest == null) return;
      const dismissed = dismissedRaw ? JSON.parse(dismissedRaw) : {};
      dismissed[cacheKey] = latest;
      await AsyncStorage.setItem(UPDATE_DISMISSED_KEY, JSON.stringify(dismissed));
    } catch (_) {}
  }

  // Which site each series was actually read from — purely local (resume
  // data already on-device), so unlike checkUpdatesInBackground this needs
  // no network call and can run for every item, not just a capped subset.
  async function loadSiteIcons(items) {
    if (!items?.length) return;
    try {
      const icons = new Map();
      for (const s of items) {
        const cacheKey = s.searchKey || s.title;
        if (!cacheKey) continue;
        const resumeRaw = await AsyncStorage.getItem('@mangarecs/resume/' + encodeURIComponent(cacheKey)).catch(() => null);
        if (!resumeRaw) continue;
        try {
          const resume = JSON.parse(resumeRaw);
          const favicon = resolveSiteFavicon(resume.site);
          if (favicon) icons.set(cacheKey, favicon);
        } catch (_) {}
      }
      setSiteIconMap(icons);
    } catch (_) {}
  }

  // Resolve real community ratings for library items the pool doesn't cover:
  // find each item's MangaDex id (reader resume data, then title search), pull
  // the statistics endpoint in one batch, cache for 7 days. Items MangaDex has
  // no rating for yet (brand-new series) stay blank on purpose.
  async function resolveRatingsInBackground(items) {
    const need = items
      .filter((s) => !s.rating && (s.searchKey || s.title) && !ratingsFetchedRef.current.has(s.searchKey || s.title))
      .slice(0, 20);
    if (!need.length) return;
    need.forEach((s) => ratingsFetchedRef.current.add(s.searchKey || s.title));
    try {
      const cacheRaw = await AsyncStorage.getItem(RATINGS_CACHE_KEY);
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
      const now = Date.now();
      const found = {};
      const toFetch = [];
      for (const s of need) {
        const key = s.searchKey || s.title;
        const cached = cache[key];
        if (cached && now - cached.ts < RATINGS_CACHE_TTL) {
          if (cached.rating) found[key] = cached.rating;
          continue;
        }
        let mangaId = s.mangaId || null;
        if (!mangaId) {
          const resumeRaw = await AsyncStorage.getItem('@mangarecs/resume/' + encodeURIComponent(key)).catch(() => null);
          if (resumeRaw) {
            try { mangaId = JSON.parse(resumeRaw)?.mangaId || null; } catch (_) {}
          }
        }
        if (!mangaId) {
          const match = await searchMangaDex(key);
          mangaId = match?.id || null;
        }
        if (mangaId) toFetch.push({ key, mangaId });
        else cache[key] = { ts: now, rating: null };
      }
      if (toFetch.length) {
        const stats = await getMangaStatistics(toFetch.map((t) => t.mangaId));
        toFetch.forEach(({ key, mangaId }) => {
          const rating = stats[mangaId]?.rating || null;
          cache[key] = { ts: now, rating };
          if (rating) found[key] = rating;
        });
      }
      await AsyncStorage.setItem(RATINGS_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
      if (Object.keys(found).length) setRatingsMap((prev) => ({ ...prev, ...found }));
    } catch (_) {}
  }

  // Kick off rating resolution whenever the visible list changes (debounced)
  useEffect(() => {
    if (activeTab === 'Downloaded' || libLoading) return;
    const timer = setTimeout(() => resolveRatingsInBackground(getFilteredSeries()), 400);
    return () => clearTimeout(timer);
  }, [activeTab, progressRows, historyItems, savedItems, libLoading]);

  async function handleDeleteFromLibrary() {
    const series = contextMenu.series;
    closeContextMenu();
    hapticWarning();
    if (series?.downloaded && series?.downloadDir) {
      // Downloaded chapter: remove the files AND the library entry
      const updated = savedItems.filter((s) => s.id !== series.id);
      setSavedItems(updated);
      await AsyncStorage.setItem('@mangarecs_saved', JSON.stringify(updated.filter((s) => !s.id?.startsWith?.('sb-')))).catch(() => {});
      FileSystem.deleteAsync(series.downloadDir, { idempotent: true }).catch(() => {});
      return;
    }
    if (series?.savedFromFeed || series?.id?.startsWith?.('sb-')) {
      const updated = savedItems.filter((s) => s.id !== series.id);
      setSavedItems(updated);
      await AsyncStorage.setItem('@mangarecs_saved', JSON.stringify(updated.filter((s) => !s.id?.startsWith?.('sb-')))).catch(() => {});
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        syncLibraryWrite(() => supabase.from('reading_progress').delete()
          .eq('user_id', session.user.id).eq('series_title', series.title).eq('status', 'bookmarked'), 'remove bookmark');
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
        syncLibraryWrite(() => supabase.from('reading_progress').delete()
          .eq('user_id', session.user.id).eq('series_title', series.title), 'remove from library');
      }
      // Remove from local reading history so hist-* items don't come back on focus
      if (series.id.startsWith('hist-')) {
        try {
          const raw = await AsyncStorage.getItem('@mangarecs_reading_history');
          if (raw) {
            const hist = JSON.parse(raw);
            delete hist[series.searchKey];
            if (series.title) delete hist[series.title];
            await AsyncStorage.setItem('@mangarecs_reading_history', JSON.stringify(hist));
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
    await AsyncStorage.setItem('@mangarecs_saved', JSON.stringify(updated)).catch(() => {});
    // Persist bookmark to Supabase (won't overwrite existing reading/completed progress)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: session.user.id,
        series_title: series.title,
        status: 'bookmarked',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
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
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: uid,
        series_title: series.title,
        current_chapter: series.chapters || series.currentChapter || 1,
        total_chapters: series.chapters || null,
        status: 'completed',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title' }), 'mark completed');

      supabase.from('activity_feed').insert({
        user_id: uid,
        type: 'series_completed',
        data: { series_title: series.title },
      }).then(() => {});

      // Server-side capped increment (completed_count is no longer client-writable)
      supabase.rpc('increment_completed_count').then(() => refreshProfile?.());
    }
    // Small delay so the review prompt doesn't collide with the context
    // menu's own close animation
    setTimeout(maybeAskForReview, 900);
  }

  async function handleOpenRateModal() {
    const series = contextMenu.series;
    closeContextMenu();
    if (!series?.title) return;
    setRateModal({ visible: true, series, avg: 0, count: 0, yourRating: 0, loading: true, submitting: false });
    const result = await getSeriesRating(series.title);
    setRateModal((prev) => prev.series?.title === series.title
      ? { ...prev, avg: result.avg || 0, count: result.count || 0, yourRating: result.yourRating || 0, loading: false }
      : prev);
  }

  async function handleSubmitRating(stars) {
    const series = rateModal.series;
    if (!series?.title || !userId || rateModal.submitting) return;
    hapticSuccess();
    setRateModal((prev) => ({ ...prev, yourRating: stars, submitting: true }));
    try {
      const poolEntry = findPoolEntry(series.title, series.searchKey);
      const genres = series.genres || poolEntry?.genres || [];
      const result = await rateSeries(userId, series.title, stars, genres);
      if (result) {
        setRateModal((prev) => prev.series?.title === series.title
          ? { ...prev, avg: result.avg, count: result.count, submitting: false }
          : { ...prev, submitting: false });
        refreshProfile?.();
      } else {
        setRateModal((prev) => ({ ...prev, submitting: false }));
      }
    } catch (_) {
      setRateModal((prev) => ({ ...prev, submitting: false }));
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
            AsyncStorage.getItem('@mangarecs_saved').then((val) => {
              let localItems = [];
              try { localItems = val ? JSON.parse(val) : []; } catch (_) {}
              const localTitles = new Set(localItems.map((s) => s.title));
              const serverBookmarks = data
                .filter((r) => r.status === 'bookmarked' && !localTitles.has(r.series_title))
                .map((r) => {
                  const pool = findPoolEntry(r.series_title);
                  return {
                    id: `sb-${r.series_title}`,
                    title: r.series_title,
                    searchKey: pool?.searchKey || r.series_title,
                    lang: pool?.lang || 'ja',
                    rating: pool?.rating || null,
                    progress: 0,
                    chapters: pool?.chapters || 0,
                    color: pool?.color || '#1A1A2E',
                    bookmarked: true,
                  };
                });
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
        scrollEnabled={!scrollLocked}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B5CFF" colors={['#7B5CFF']} />}>

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
                <Text style={styles.continueLabel}>Continue</Text>
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
                <Ionicons name="play" size={16} color="#7B5CFF" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={[styles.tabsRow, { backgroundColor: colors.border }]}>
          {TABS.map((tab) => (
            <TabButton key={tab} tab={tab} active={activeTab === tab} onPress={(t) => { setArranging(false); setScrollLocked(false); setGenreFilter(null); setActiveTab(t); }} />
          ))}
        </View>

        <View style={styles.sortRow}>
          <Ionicons name="swap-vertical" size={12} color={colors.muted} />
          {SORT_MODES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.sortChip, { backgroundColor: colors.border }, sortMode === key && styles.sortChipActive]}
              onPress={() => changeSortMode(key)}>
              <Text style={[styles.sortChipText, { color: sortMode === key ? '#7B5CFF' : colors.muted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
          {sortMode === 'custom' && (
            <TouchableOpacity
              style={[styles.arrangeBtn, arranging && styles.arrangeBtnActive]}
              onPress={toggleArranging}>
              <Ionicons name={arranging ? 'checkmark' : 'move-outline'} size={11} color={arranging ? '#fff' : '#7B5CFF'} />
              <Text style={[styles.arrangeBtnText, arranging && { color: '#fff' }]}>{arranging ? 'Done' : 'Move'}</Text>
            </TouchableOpacity>
          )}
          {tabGenres.length > 1 && (
            <TouchableOpacity
              style={[styles.genreFilterToggle, { backgroundColor: colors.border }, showGenreFilter && styles.sortChipActive]}
              onPress={() => { light(); setShowGenreFilter((v) => !v); }}
              accessibilityRole="button"
              accessibilityLabel="Filter by genre">
              <Ionicons name="filter" size={13} color={genreFilter ? '#7B5CFF' : colors.muted} />
              {!!genreFilter && <View style={styles.genreFilterDot} />}
            </TouchableOpacity>
          )}
        </View>

        {showGenreFilter && tabGenres.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreRow} contentContainerStyle={styles.genreRowContent}>
            <TouchableOpacity
              style={[styles.sortChip, { backgroundColor: colors.border }, !genreFilter && styles.sortChipActive]}
              onPress={() => { light(); setGenreFilter(null); }}>
              <Text style={[styles.sortChipText, { color: !genreFilter ? '#7B5CFF' : colors.muted }]}>All</Text>
            </TouchableOpacity>
            {tabGenres.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.sortChip, { backgroundColor: colors.border }, genreFilter === g && styles.sortChipActive]}
                onPress={() => { light(); setGenreFilter(genreFilter === g ? null : g); }}>
                <Text style={[styles.sortChipText, { color: genreFilter === g ? '#7B5CFF' : colors.muted }]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {activeTab === 'Downloaded' && filtered.length > 0 && (
          <Text style={[styles.storageLine, { color: colors.muted }]}>
            {filtered.length} {filtered.length === 1 ? 'chapter' : 'chapters'}
            {(() => {
              const total = filtered.reduce((s, i) => s + (i.bytes || 0), 0);
              if (total <= 0) return '';
              const mb = total / (1024 * 1024);
              return ` · ${mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`} on device · hold to delete`;
            })()}
          </Text>
        )}

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
          <View style={[styles.grid, isTablet && styles.gridTablet]}>
            {filtered.map((series, index) => {
              const metaKey = keyOf(series);
              const rating = series.rating || ratingsMap[metaKey] || ratingsMap[series.title] || null;
              const pool = findPoolEntry(series.title, series.searchKey);
              return (
                <GridItem
                  key={`${focusKey}-${activeTab}-${series.id}`}
                  series={rating === series.rating ? series : { ...series, rating }}
                  activeTab={activeTab}
                  index={index}
                  widthPct={gridItemWidthPct}
                  onPress={() => { if (!arranging) openReader(series); }}
                  onLongPress={handleLongPress}
                  opening={openingId === series.id}
                  newChapterCount={updatesMap.get(metaKey) || 0}
                  isNewInPool={!!pool && newPoolIds.has(String(pool.id))}
                  siteIcon={siteIconMap.get(metaKey)}
                  arranging={arranging}
                  pinned={index < pinnedCount}
                  onSlotLayout={(i, layout) => { slotRects.current[i] = layout; }}
                  onDragStart={() => { setScrollLocked(true); light(); }}
                  onDrop={handleDrop}
                />
              );
            })}
          </View>
        )}

        {filtered.length === 0 && activeTab !== 'Bookmarked' && activeTab !== 'Downloaded' && (
          libLoading ? (
            <View style={{ paddingTop: 8 }}>
              <CoverGridSkeleton count={6} columns={numCols} />
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
          const { width: sw, height: sh } = Dimensions.get('window');
          const menuW = 210;
          const menuH = 184; // 4 rows + 3 dividers, approx
          const { x, y, width: iw, height: ih } = contextMenu.pos;
          // Center under the tile, clamped so it never runs off either edge —
          // the old left/right-of-tile math glitched for middle-column items.
          let menuLeft = x + iw / 2 - menuW / 2;
          menuLeft = Math.min(Math.max(menuLeft, 8), sw - menuW - 8);
          // Prefer below the tile; flip above it if there's no room at the bottom.
          let menuTop = y + ih + 8;
          if (menuTop + menuH > sh - 20) menuTop = Math.max(60, y - menuH - 8);
          return (
            <View style={[styles.contextMenu, { top: menuTop, left: menuLeft }]}>
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleDeleteFromLibrary}>
                <Ionicons name="trash-outline" size={15} color="#FF3B30" />
                <Text style={[styles.contextMenuText, { color: '#FF3B30' }]}>{DELETE_LABEL[activeTab] || 'Delete from Library'}</Text>
              </TouchableOpacity>
              {activeTab !== 'Bookmarked' && (
                <>
                  <View style={styles.contextDivider} />
                  <TouchableOpacity style={styles.contextMenuItem} onPress={handleAddToBookmarked}>
                    <Ionicons name="bookmark-outline" size={15} color="#A09CE0" />
                    <Text style={styles.contextMenuText}>Add to Bookmarked</Text>
                  </TouchableOpacity>
                </>
              )}
              {activeTab !== 'Completed' && (
                <>
                  <View style={styles.contextDivider} />
                  <TouchableOpacity style={styles.contextMenuItem} onPress={handleMarkAsCompleted}>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#1D9E75" />
                    <Text style={[styles.contextMenuText, { color: '#1D9E75' }]}>Mark as Completed</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={styles.contextDivider} />
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleOpenRateModal}>
                <Ionicons name="star-outline" size={15} color="#FFD700" />
                <Text style={styles.contextMenuText}>Rate this Series</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </Modal>

      {/* ── Rate Series Modal ── */}
      <Modal visible={rateModal.visible} transparent animationType="fade" onRequestClose={() => setRateModal((p) => ({ ...p, visible: false }))}>
        <TouchableOpacity style={styles.rateOverlay} activeOpacity={1} onPress={() => setRateModal((p) => ({ ...p, visible: false }))}>
          <TouchableOpacity style={[styles.rateSheet, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={1}>
            <Text style={[styles.rateTitle, { color: colors.text }]} numberOfLines={1}>{rateModal.series?.title}</Text>
            {rateModal.loading ? (
              <ActivityIndicator size="small" color="#7B5CFF" style={{ marginVertical: 20 }} />
            ) : (
              <>
                <StarRatingDisplay avg={rateModal.avg} count={rateModal.count} size={14} showLabel />
                <Text style={[styles.rateSub, { color: colors.muted }]}>
                  {rateModal.yourRating ? 'Tap to change your rating' : 'Tap to rate'}
                </Text>
                <View style={{ marginTop: 10 }}>
                  <StarRatingInput value={rateModal.yourRating} onRate={handleSubmitRating} size={32} disabled={rateModal.submitting} />
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
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
                <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search">
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
                mergedResults.length > 0 ? (
                  <View style={styles.searchSection}>
                    <View style={styles.searchSectionHeader}>
                      <Ionicons name="book-outline" size={11} color={colors.muted} />
                      <Text style={[styles.searchSectionTitle, { color: colors.muted }]}>Results</Text>
                    </View>
                    {mergedResults.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.searchResultRow}
                        onPress={() => openFromSearch(item)}
                        activeOpacity={0.7}>
                        <View style={[styles.searchResultDot, { backgroundColor: item.color || '#7B5CFF' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.searchResultTitle, { color: colors.text }]}>{item.title}</Text>
                          {item.genres?.length > 0 ? (
                            <Text style={[styles.searchResultMeta, { color: colors.muted }]}>
                              {item.genres.slice(0, 2).join(' · ')}
                            </Text>
                          ) : item.fromApi ? (
                            <Text style={[styles.searchResultMeta, { color: colors.muted }]}>MangaDex</Text>
                          ) : null}
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
                          <TouchableOpacity onPress={() => removeRecent(term)} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={`Remove "${term}" from recent searches`}>
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
  headerTitle: { fontSize: 18, fontWeight: '700' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,149,0,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  fireEmoji: { fontSize: 12 },
  streakText: { color: '#FF9500', fontSize: 11, fontWeight: '600', marginLeft: 5, paddingRight: 2 },
  storageLine: { fontSize: 11, paddingHorizontal: 20, marginBottom: 10, marginTop: -4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(155,154,163,0.08)', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 11, marginHorizontal: 20, marginBottom: 16 },
  searchPlaceholder: { fontSize: 13, marginLeft: 10 },
  continueCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(123,92,255,0.15)', borderWidth: 1, borderColor: 'rgba(123,92,255,0.2)', borderRadius: 16, padding: 12, marginHorizontal: 20, marginBottom: 16 },
  continueCover: { width: 48, height: 66, borderRadius: 10, marginRight: 12 },
  continueCoverPlay: { position: 'absolute', bottom: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(123,92,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  continueInfo: { flex: 1 },
  continueLabel: { color: '#7B5CFF', fontSize: 11, fontWeight: '500' },
  continueTitle: { fontSize: 14, fontWeight: '600', marginTop: 1 },
  continueChapter: { fontSize: 11, marginTop: 1 },
  continuePlayBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(123,92,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  continueProgressBar: { height: 3, backgroundColor: 'rgba(123,92,255,0.18)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  continueProgressFill: { height: 3, backgroundColor: '#7B5CFF', borderRadius: 2 },
  tabsRow: { flexDirection: 'row', borderRadius: 12, padding: 4, marginHorizontal: 20, marginBottom: 10 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  genreRow: { marginBottom: 14 },
  genreRowContent: { paddingHorizontal: 20 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginLeft: 6 },
  sortChipActive: { backgroundColor: 'rgba(123,92,255,0.18)' },
  sortChipText: { fontSize: 10.5, fontWeight: '600' },
  arrangeBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(123,92,255,0.14)' },
  arrangeBtnActive: { backgroundColor: '#7B5CFF' },
  arrangeBtnText: { fontSize: 10.5, fontWeight: '700', color: '#7B5CFF', marginLeft: 4 },
  genreFilterToggle: { marginLeft: 'auto', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  genreFilterDot: { position: 'absolute', top: 3, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: '#7B5CFF' },
  tab: { flex: 1, borderRadius: 9, overflow: 'hidden' },
  tabInner: { paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center' },
  tabActive: {},
  tabText: { fontSize: 11, fontWeight: '500' },
  tabTextActive: { fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  gridTablet: { maxWidth: TABLET_GRID_MAX_WIDTH, width: '100%', alignSelf: 'center' },
  gridItem: { marginHorizontal: `${ITEM_MARGIN_H}%`, marginBottom: 20 },
  cover: { width: '100%', aspectRatio: 0.66, borderRadius: 12, overflow: 'hidden', marginBottom: 6 },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: 3, backgroundColor: '#7B5CFF' },
  savedBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(123,92,255,0.25)', borderRadius: 10, padding: 3 },
  downloadedBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(29,158,117,0.25)', borderRadius: 10, padding: 3 },
  cloudBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 3 },
  siteFaviconBadge: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  siteFaviconImg: { width: 20, height: 20 },
  updateBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#1D9E75', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  newChapterBadge: { backgroundColor: '#FF3B30' },
  gridItemDragging: { zIndex: 100, elevation: 8, opacity: 0.92 },
  updateBadgeText: { color: '#fff', fontSize: 8, fontWeight: 'bold', letterSpacing: 0.3 },
  completeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  completePill: { backgroundColor: '#1D9E75', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  completePillText: { color: '#fff', fontSize: 9, fontWeight: 'bold', paddingRight: 2 },
  chapterCountBadge: { position: 'absolute', bottom: 7, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  chapterCountText: { color: '#fff', fontSize: 8.5, fontWeight: '700', letterSpacing: 0.2 },
  coverCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverLetter: { color: 'rgba(255,255,255,0.15)', fontSize: 26, fontWeight: 'bold' },
  itemTitle: { fontSize: 11.5, fontWeight: '600' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  itemRating: { fontSize: 10, marginLeft: 3, marginRight: 6 },
  itemProgress: { fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 14, fontWeight: '600' },
  emptySub: { fontSize: 11, marginTop: 6 },
  contextMenu: { position: 'absolute', width: 210, backgroundColor: 'rgba(22,22,28,0.93)', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(123,92,255,0.22)', overflow: 'hidden' },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  contextMenuText: { color: '#E8E8F0', fontSize: 13, fontWeight: '500', marginLeft: 10, flex: 1 },
  contextDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  rateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  rateSheet: { width: '100%', maxWidth: 320, borderRadius: 18, borderWidth: 1, padding: 22, alignItems: 'center' },
  rateTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, maxWidth: '100%' },
  rateSub: { fontSize: 11, marginTop: 10 },
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
