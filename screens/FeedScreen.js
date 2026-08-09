import {
  View, Text, StyleSheet, FlatList, useWindowDimensions, TouchableOpacity,
  Modal, TextInput, RefreshControl, KeyboardAvoidingView,
  Platform, Animated, Image, ActivityIndicator, ScrollView, Share, Linking,
} from 'react-native';
import { profileAccent } from '../utils/profileThemes';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { fetchMangaInfo, getCachedCoverUrl, getFaviconUrl, AI_REC_KEY, prewarmCoverCache, NSFW_KEY, isRatingGated } from '../utils/mangaCovers';
import { fetchPopularManga } from '../utils/mangaDexApi';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useCoachmarkTarget } from '../utils/CoachmarkContext';
import StarLogo from '../components/StarLogo';
import ShareCard from '../components/ShareCard';
import { supabase } from '../supabase';
import { syncReadOpen, setLastRead, syncLibraryWrite } from '../utils/readerUtils';
import { sendCommentPush } from '../utils/pushNotifications';
import { loadVideoPool, interleaveVideos } from '../utils/shortVideos';
import ShortVideoCard from '../components/ShortVideoCard';
import { requireAccount } from '../utils/guestGate';
import { useNotifications } from '../utils/NotificationsContext';

import { MANGA_POOL, COMPLETED_IDS } from '../utils/mangaPool';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers';
import { containsBlockedLanguage } from '../utils/contentFilter';
import { showAppToast } from '../utils/appToast';
import { light, medium, selection } from '../utils/haptics';
import { startCoverTransition } from '../utils/coverTransition';
import { HIT_SLOP } from '../utils/tokens';
import { useReducedMotion, useAnnounceOnOpen } from '../utils/a11y';

// Plain FlatList can't take a native-driven onScroll — RN throws
// "must be wrapped with Animated.createAnimatedComponent" without this.
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

// Every dimension here is reactive. `Dimensions.get('window')` at module scope
// is captured once, at import, and never updates — which broke the feed on
// rotation, on foldables and in split-screen, because the frozen height drove
// snapToInterval and getItemLayout while the cards themselves resized.
//
// Cover/text sizing is derived from a capped content width, not the raw screen
// width — on a tablet the card background still fills edge-to-edge but the
// cover art and text stay phone-proportioned instead of ballooning.
function useFeedMetrics() {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const contentW = Math.min(width, 480);
    const coverW   = Math.round(contentW * 0.66);
    return {
      width,
      height,
      notifH:    Math.round(height * 0.40),
      commentsH: Math.round(height * 0.88),
      contentW,
      coverW,
      coverH: Math.round(coverW * 1.44),
    };
  }, [width, height]);
}

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);

// Comments per page in the feed's comment sheet.
const FEED_COMMENT_PAGE_SIZE = 30;

// Matches the palette used everywhere else a user's chosen profile color
// shows up (SocialScreen/DMScreen) — comment avatars were a flat purple
// placeholder regardless of the commenter's real avatar/chroma.
const themeColor = profileAccent;


// ── Module-level feed state ──────────────────────────────────────────────────

const _seenIds = new Set();
const _recentBuffer = [];
const RECENT_BUFFER_SIZE = 150;
let _feedCounter = 0;

// Section rotation state — persists across refreshes so each pull reveals new content
const _hotSeen      = new Set();
const _trendingSeen = new Set();
const _popularSeen  = new Set();

// Feed queue constants
const MAX_FEED_LENGTH = 120;  // max cards kept in state — prevents RAM growth
const TRIM_BATCH      = 60;   // how many to drop from front when cap is hit
const BATCH_SIZE      = 15;   // cards dispensed per loadMore
const FEED_CACHE_KEY  = '@mangarecs/feed_cache_v1'; // offline-first snapshot of the last feed
const QUEUE_REFILL_AT = 80;   // start background refill when queue drops below this

// Pre-fetch buffer — filled from Supabase personalized RPC, falls back to local pool
let _feedQueue     = [];
let _queueFetching = false;

// Genre preference weights for per-user algorithm
// Updated when user likes/saves; persisted to AsyncStorage
const PREFS_KEY = '@mangarecs_genre_prefs';
let _genreWeights = {};
let _aiRecEnabled = true;

// Set by component on mount — lets the module-level refillQueue use them
let _currentUserId = null;
export async function loadFeedPrefs() {
  try {
    const [[, raw], [, aiRaw]] = await AsyncStorage.multiGet([PREFS_KEY, AI_REC_KEY]);
    if (raw) _genreWeights = JSON.parse(raw);
    _aiRecEnabled = aiRaw === null ? true : aiRaw === 'true';
  } catch (_) {}
}

async function trackGenreInteraction(genres) {
  if (!genres?.length) return;
  genres.forEach((g) => { _genreWeights[g] = (_genreWeights[g] || 0) + 1; });
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(_genreWeights));
  } catch (_) {}
  // Sync genre_weights and recompute favorite_genre so ProfileScreen always shows the latest
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) {
      const topGenre = Object.entries(_genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0];
      supabase.from('profiles').update({
        genre_weights: _genreWeights,
        ...(topGenre ? { favorite_genre: topGenre } : {}),
      }).eq('id', session.user.id).then(() => {});
    }
  });
}

// ── Category helpers ─────────────────────────────────────────────────────────

function itemCategory(m) {
  if (m.lang === 'zh') return 'zh';
  if (m.lang === 'ko' || m.lang === 'en') return 'ko';
  return 'ja'; // lang: 'ja' or undefined
}

function preferenceScore(item) {
  if (!item.genres?.length) return 0;
  return item.genres.reduce((s, g) => s + (_genreWeights[g] || 0), 0);
}

// Picks n items from a category using a two-tier dedup strategy:
// 1) Prefer items not yet seen this session (_seenIds).
// 2) When the category is exhausted, reset it but still avoid items shown
//    very recently (_recentBuffer, last 150 cards) so re-cycles feel fresh.
function pickCategory(langFilter, n) {
  const categoryPool = MANGA_POOL.filter((m) => langFilter(m) && !m.nsfw);
  let pool = categoryPool.filter((m) => !_seenIds.has(m.id));
  if (pool.length < n) {
    categoryPool.forEach((m) => _seenIds.delete(m.id));
    pool = categoryPool.filter((m) => !_recentBuffer.includes(m.id));
    if (pool.length < n) pool = categoryPool;
  }
  pool.sort((a, b) => {
    if (!_aiRecEnabled) return Math.random() - 0.5;
    const scoreDiff = preferenceScore(b) - preferenceScore(a);
    return scoreDiff * 0.8 + (Math.random() - 0.5) * 2;
  });
  const picked = pool.slice(0, n);
  picked.forEach((m) => {
    _seenIds.add(m.id);
    _recentBuffer.push(m.id);
    if (_recentBuffer.length > RECENT_BUFFER_SIZE) _recentBuffer.shift();
  });
  return picked;
}

// Returns a mixed batch at a roughly even 25/35/25/15 (ja/ko/zh/en) ratio.
// English webtoons are given their own lane so they aren't squeezed by Korean
// manhwa when the ko pool is large.
function getNextBatch(count = 8, savedIds = new Set()) {
  const jaCount = Math.max(1, Math.round(count * 0.27));
  const zhCount = Math.max(1, Math.round(count * 0.27));
  const enCount = Math.max(1, Math.round(count * 0.13));
  const koCount = Math.max(1, count - jaCount - zhCount - enCount);

  const jaPicked = pickCategory((m) => m.lang === 'ja' || !m.lang, jaCount);
  const koPicked = pickCategory((m) => m.lang === 'ko',             koCount);
  const zhPicked = pickCategory((m) => m.lang === 'zh',             zhCount);
  const enPicked = pickCategory((m) => m.lang === 'en',             enCount);

  return [...jaPicked, ...koPicked, ...zhPicked, ...enPicked]
    .sort(() => Math.random() - 0.5)
    .map((m) => ({
      ...m,
      likeCount:    0,
      commentCount: 0,
      liked:        false,
      bookmarked:   savedIds.has(m.id),
      feedKey:      `${m.id}_${++_feedCounter}`,
      status:       COMPLETED_IDS.has(m.id) ? 'Completed' : 'Ongoing',
    }));
}

// Refills _feedQueue using personalized RPC (falls back to local pool on error)
async function refillQueue() {
  if (_queueFetching || _feedQueue.length >= QUEUE_REFILL_AT) return;
  _queueFetching = true;
  try {
    const seenArr = Array.from(_seenIds).slice(-500);
    const { data, error } = await supabase.rpc('get_personalized_feed', {
      p_user_id:    _currentUserId ?? undefined,
      p_seen_ids:   seenArr,
      p_nsfw_ok:    false,
      p_batch_size: 80,
    });
    if (!error && data?.length) {
      const mapped = data.map((m) => ({
        ...m,
        genres:        Array.isArray(m.genres) ? m.genres : [],
        // increment_manga_likes (and every realtime update) writes to the
        // `likes` column — `like_count` is a legacy duplicate nothing keeps
        // current, so reading it here made the initial like count on a card
        // go stale/stuck at whatever it last was instead of the real total.
        likeCount:     m.likes ?? m.like_count ?? 0,
        commentCount:  m.comment_count || 0,
        bookmarkCount: m.bookmark_count || 0,
        shareCount:    m.share_count   || 0,
        liked:         false,
        bookmarked:    false,
        _fromSupabase: true,
        feedKey:       `${m.id}_${++_feedCounter}`,
        status:        COMPLETED_IDS.has(m.id) ? 'Completed' : 'Ongoing',
      }));
      mapped.sort((a, b) => {
        const scoreDiff = preferenceScore(b) - preferenceScore(a);
        return scoreDiff * 0.8 + (Math.random() - 0.5) * 2;
      });
      data.forEach((m) => {
        _seenIds.add(m.id);
        _recentBuffer.push(m.id);
        if (_recentBuffer.length > RECENT_BUFFER_SIZE) _recentBuffer.shift();
      });
      _feedQueue = [..._feedQueue, ...mapped];
    } else {
      _feedQueue = [..._feedQueue, ...getNextBatch(80)];
    }
  } catch (_) {
    _feedQueue = [..._feedQueue, ...getNextBatch(80)];
  } finally {
    _queueFetching = false;
  }
}

// Synchronously dequeues n items, topping up from pool if queue ran dry.
// When NSFW is on, guarantees at least 2 adult items per batch even if the
// Supabase queue returned only clean content.
function dequeueItems(n, savedIds = new Set()) {
  if (_feedQueue.length < QUEUE_REFILL_AT) refillQueue();
  const items = _feedQueue.splice(0, Math.min(n, _feedQueue.length));
  if (items.length < n) items.push(...getNextBatch(n - items.length, savedIds));
  return items.map((m) => ({
    ...m,
    liked:      false,
    bookmarked: savedIds.has(m.id),
    feedKey:    `${m.id}_${++_feedCounter}`,
    status:     COMPLETED_IDS.has(m.id) ? 'Completed' : 'Ongoing',
  }));
}

function parseReaderCount(str) {
  const n = parseFloat(str || '0');
  if ((str || '').includes('M')) return n * 1_000_000;
  if ((str || '').includes('K')) return n * 1_000;
  return n;
}

// Builds the initial (and refresh) feed in ordered sections:
// Hot Picks → Trending → Popular → algorithmic algo batch
//
// Each section tracks its own seen set (_hotSeen / _trendingSeen / _popularSeen)
// so successive refreshes advance to the next 5 items in each ranked list,
// cycling back to the beginning only when all items have been shown.
function buildSectionedFeed(savedIds, likedSet) {
  const pool = MANGA_POOL.filter((m) => !m.nsfw);
  const usedThisBuild = new Set(); // prevents the same item appearing in multiple sections

  function takeSorted(sorted, n, section, sectionSeen) {
    // Prefer items not yet shown in this section AND not already used in another section
    let picks = sorted.filter((m) => !usedThisBuild.has(m.id) && !sectionSeen.has(m.id));
    if (picks.length < n) {
      // All items in this section have been cycled — reset and start over
      sectionSeen.clear();
      picks = sorted.filter((m) => !usedThisBuild.has(m.id));
    }
    picks = picks.slice(0, n);
    picks.forEach((m) => {
      usedThisBuild.add(m.id);
      sectionSeen.add(m.id);
      _seenIds.add(m.id);
      _recentBuffer.push(m.id);
      if (_recentBuffer.length > RECENT_BUFFER_SIZE) _recentBuffer.shift();
    });
    return picks.map((m) => ({ ...m, _section: section }));
  }

  const hotPicks = takeSorted([...pool].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)), 5, 'hot', _hotSeen);
  const trending = takeSorted([...pool].sort((a, b) => parseReaderCount(b.readers) - parseReaderCount(a.readers)), 5, 'trending', _trendingSeen);
  const popular  = takeSorted([...pool].sort((a, b) => (b.rating || 0) - (a.rating || 0)), 5, 'popular', _popularSeen);

  // Purge section picks from the Supabase queue so the algo batch never repeats them
  _feedQueue = _feedQueue.filter((m) => !usedThisBuild.has(m.id));

  const algoBatch = dequeueItems(BATCH_SIZE, savedIds);

  return [...hotPicks, ...trending, ...popular, ...algoBatch].map((item) => ({
    ...item,
    likeCount:    item._fromSupabase ? (item.likeCount ?? 0) : 0,
    commentCount: 0,
    liked:        likedSet instanceof Set ? likedSet.has(item.id) : false,
    bookmarked:   savedIds.has(item.id),
    feedKey:      item.feedKey || `${item.id}_${++_feedCounter}`,
    status:       COMPLETED_IDS.has(item.id) ? 'Completed' : 'Ongoing',
  }));
}

// Fetches popular manga from MangaDex and adds new items to MANGA_POOL.
// Succeeds once per app session (subsequent calls are instant from the
// AsyncStorage cache); a failed/timed-out attempt does NOT latch permanently
// — it retries on the next call once RETRY_COOLDOWN has passed, instead of
// silently never showing live entries for the rest of the session. Exported
// so other screens (e.g. ForYouScreen) that read MANGA_POOL before FeedScreen
// ever mounts can trigger the same fetch instead of seeing an empty live tier.
let _feedLiveLoaded = false;
let _feedLoadAttemptAt = 0;
const RETRY_COOLDOWN = 60 * 1000;
export async function augmentPoolFromApi() {
  if (_feedLiveLoaded) return;
  const now = Date.now();
  if (now - _feedLoadAttemptAt < RETRY_COOLDOWN) return;
  _feedLoadAttemptAt = now;
  try {
    const items = await fetchPopularManga({ limit: 30 });
    if (!items.length) return;
    _feedLiveLoaded = true;
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const seenIds    = new Set(MANGA_POOL.map((m) => String(m.id)));
    // Check both title AND searchKey so "Attack on Titan" dedupes against searchKey "Shingeki no Kyojin"
    const seenTitles = new Set(
      MANGA_POOL.flatMap((m) => [norm(m.title), m.searchKey ? norm(m.searchKey) : null].filter(Boolean))
    );
    items.forEach((item) => {
      if (seenIds.has(String(item.id))) return;
      const t = norm(item.searchKey || item.title);
      if (seenTitles.has(t)) return;
      MANGA_POOL.push(item);
      seenIds.add(String(item.id));
      seenTitles.add(t);
      if (item.coverUrl) prewarmCoverCache(item.title, item.lang, item.coverUrl);
    });
  } catch (_) {}
}

// ── Static data ─────────────────────────────────────────────────────────────

const BOOKMARKS = [
  { name: 'MangaDex',  url: 'https://mangadex.org',              desc: 'Largest manga library',   emoji: '📚' },
  { name: 'Webtoon',   url: 'https://webtoons.com',              desc: 'Official webtoons',        emoji: '🎨' },
  { name: 'MangaPlus', url: 'https://mangaplus.shueisha.co.jp',  desc: 'Official Shueisha titles', emoji: '⭐' },
  { name: 'Bato.to',   url: 'https://bato.to',                   desc: 'Community scanlations',    emoji: '🌐' },
];


// ── Helpers ─────────────────────────────────────────────────────────────────

// Abbreviation starts at 10K, not 1K. The seeded pool has counts in the
// thousands, and `(7511/1000).toFixed(1)` and `(7512/1000).toFixed(1)` are
// both "7.5K" — so liking something changed the number by one and the label
// not at all, which reads as a broken button. Below 10K the exact figure is
// shown with separators so a tap always moves something visible.
function formatCount(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
}
function notifIconName(type) {
  if (type === 'friend_request')  return 'person-add';
  if (type === 'friend_accepted') return 'people';
  if (type === 'comment')         return 'chatbubble';
  if (type === 'badge')           return 'trophy';
  if (type === 'system')          return 'notifications';
  return 'heart';
}
// Takes the palette rather than freezing it — these dots are app chrome and
// have to follow the theme like every other accent.
function notifIconColor(type, colors) {
  if (type === 'friend_request')  return colors.primary;
  if (type === 'friend_accepted') return '#1D9E75';
  if (type === 'comment')         return '#1D9E75';
  if (type === 'badge')           return '#f59e0b';
  if (type === 'system')          return '#EF9F27';
  return '#E8527A';
}
function notifIconBg(type) {
  if (type === 'friend_request')  return 'rgba(120, 88, 255,0.22)';
  if (type === 'friend_accepted') return 'rgba(29,158,117,0.22)';
  if (type === 'comment')         return 'rgba(29,158,117,0.22)';
  if (type === 'badge')           return 'rgba(245,158,11,0.22)';
  if (type === 'system')          return 'rgba(239,159,39,0.22)';
  return 'rgba(232,82,122,0.22)';
}

// ── SkeletonFeed ─────────────────────────────────────────────────────────────

function SkeletonFeed() {
  const { colors } = useTheme();
  const { coverW, coverH } = useFeedMetrics();
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    // Full-screen skeleton — the largest single source of ambient motion in
    // the app. Held mid-way so it still reads as a placeholder.
    if (reduced) { pulse.setValue(0.5); return undefined; }
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, [reduced, pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}>
      <Animated.View style={{ width: coverW, height: coverH, borderRadius: 18, backgroundColor: colors.primary, opacity }} />
      <Animated.View style={{ width: coverW * 0.65, height: 22, borderRadius: 8, backgroundColor: '#A09CE0', opacity, marginTop: 8 }} />
      <Animated.View style={{ width: coverW * 0.45, height: 14, borderRadius: 6, backgroundColor: colors.primary, opacity }} />
      <Animated.View style={{ width: coverW * 0.9, height: 36, borderRadius: 10, backgroundColor: '#2D2A4A', opacity }} />
      <Animated.View style={{ width: coverW * 0.55, height: 12, borderRadius: 6, backgroundColor: '#3B3672', opacity }} />
    </View>
  );
}

// ── FeedCard ────────────────────────────────────────────────────────────────
// Wrapped in memo with a tight comparator so a like/bookmark tap on any card
// never re-renders the other cards in the list. The comparator allows liked/
// bookmarked changes through so the initial async sync (savedMap, server likes)
// still reaches the correct card.

const FeedCard = memo(function FeedCard({ item, index = 0, scrollY, onLike, onBookmark, onComment, onShare, onOpen }) {
  const t = useT();
  const navigation = useNavigation();
  const metrics = useFeedMetrics();
  // The tab bar floats over the card, so the card's own bottom padding is what
  // keeps the title/description clear of it. A hardcoded 88 was short of the
  // real bar height on gesture-nav Android and any home-indicator device.
  const tabBarHeight = useBottomTabBarHeight();
  const { isDark } = useTheme();
  const cardOverlay   = isDark ? 'rgba(4,3,14,0.72)'      : 'rgba(245,245,250,0.78)';
  const cardText      = isDark ? '#FFFFFF'                  : '#0D0D0F';
  const cardDesc      = isDark ? 'rgba(210,208,242,0.88)'  : 'rgba(13,13,15,0.72)';
  const cardMuted     = isDark ? 'rgba(255,255,255,0.58)'  : 'rgba(13,13,15,0.5)';
  const cardAuthor    = isDark ? 'rgba(255,255,255,0.4)'   : 'rgba(13,13,15,0.38)';
  const cardBgOpacity = isDark ? 0.22 : 0.38;

  const coverCardRef = useRef(null);

  function openDetail() {
    // Creator series have no MangaDetail page — their content lives in-app, so
    // the reader IS the detail view for them.
    if (item.creatorSeriesId) { onOpen(item); return; }
    const isMangaDexUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
    const navParams = {
      title: item.title,
      searchKey: item.searchKey || item.title,
      lang: item.lang || 'ja',
      color: item.color,
      mangaId: item.mangaId || (isMangaDexUuid ? item.id : undefined),
      chapters: item.chapters,
    };
    // Navigation must NOT be nested inside the measure callback: on the New
    // Architecture measureInWindow is an async round-trip that is simply
    // never invoked if the view is already detaching, which silently turned
    // a tap into a no-op. The morph is cosmetic, so fire it opportunistically
    // and navigate unconditionally — CoverMorphOverlay self-clears if the
    // rect arrives late.
    if (coverUrl && !coverError && coverCardRef.current) {
      coverCardRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          startCoverTransition({ uri: coverUrl, color: item.color, rect: { x, y, width, height, radius: 18 } });
        }
      });
    }
    navigation.navigate('MangaDetail', navParams);
    // Opening detail is a real interest signal. It used to be picked up by
    // handleOpenReader, which the card tap no longer goes through — weight it
    // once here, against the double weight an actual read still gets.
    if (item.genres?.length) trackGenreInteraction(item.genres);
  }

  // Per-card interaction state — lives here, never in the parent feed array
  const [liked,      setLiked]      = useState(item.liked      ?? false);
  const [bookmarked, setBookmarked] = useState(item.bookmarked ?? false);
  const [likeCount,  setLikeCount]  = useState(item.likeCount  ?? item.likes ?? 0);
  const [saveCount,  setSaveCount]  = useState(item.bookmarkCount ?? item.bookmark_count ?? 0);
  const [shareCount, setShareCount] = useState(item.shareCount ?? item.share_count ?? 0);

  // Sync when parent pushes async updates (initial savedMap / server-likes / realtime)
  useEffect(() => { setLiked(item.liked ?? false); }, [item.liked]);
  useEffect(() => { setBookmarked(item.bookmarked ?? false); }, [item.bookmarked]);
  useEffect(() => { setLikeCount(item.likeCount ?? item.likes ?? 0); }, [item.likeCount, item.likes]);
  useEffect(() => { setSaveCount(item.bookmarkCount ?? item.bookmark_count ?? 0); }, [item.bookmarkCount, item.bookmark_count]);
  useEffect(() => { setShareCount(item.shareCount ?? item.share_count ?? 0); }, [item.shareCount, item.share_count]);

  // Priority: Supabase cover_url → pre-baked static URL → in-memory API cache → null
  const [coverUrl, setCoverUrl] = useState(
    () => item.cover_url
       ?? POOL_COVER_URLS[item.id]
       ?? getCachedCoverUrl(item.searchKey || item.title, item.lang)
       ?? item.cover_image_url
       ?? null
  );
  const [coverError, setCoverError] = useState(false);
  const [allowNsfw, setAllowNsfw] = useState(false);
  useEffect(() => { AsyncStorage.getItem(NSFW_KEY).then((v) => setAllowNsfw(v === 'true')); }, []);
  const covered = isRatingGated(item.contentRating) && !allowNsfw;

  const enterAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(coverUrl ? 1 : 0)).current;
  const likeScale  = useRef(new Animated.Value(1)).current;
  const saveScale  = useRef(new Animated.Value(1)).current;
  const chatScale  = useRef(new Animated.Value(1)).current;
  const shareScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const stagger = Math.min(index, 5) * 65;
    const spring  = Animated.spring(enterAnim, {
      toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200, mass: 0.85,
    });
    stagger > 0
      ? Animated.sequence([Animated.delay(stagger), spring]).start()
      : spring.start();
  }, []);

  useEffect(() => {
    if (coverUrl && !coverError) return; // already have a good cover
    let cancelled = false;
    fetchMangaInfo(item.searchKey || item.title, item.lang).then((info) => {
      if (!cancelled && info?.coverUrl) { setCoverUrl(info.coverUrl); setCoverError(false); }
    });
    return () => { cancelled = true; };
  }, [item.title, coverError]);

  function onImageLoad() {
    Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }

  function pulse(anim, cb) {
    medium();
    Animated.sequence([
      Animated.spring(anim, { toValue: 0.68, useNativeDriver: true, speed: 100, bounciness: 0 }),
      Animated.spring(anim, { toValue: 1.35, useNativeDriver: true, speed: 18,  bounciness: 16 }),
      Animated.spring(anim, { toValue: 1.0,  useNativeDriver: true, speed: 22,  bounciness: 5 }),
    ]).start();
    cb?.();
  }

  function handleLikeTap() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => next ? c + 1 : c - 1);
    pulse(likeScale, () => onLike(item.id, next));
  }

  // Double-tap to like — the baseline gesture on Instagram, TikTok and Webtoon,
  // and the one place a tap on the card body shouldn't just open the reader.
  // A single tap still opens; it's held back only long enough to see whether a
  // second tap follows, which is the same 280ms window DMScreen already uses.
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef(null);
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);

  function handleCardTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
      // Double-tap only ever likes — never unlikes. Instagram behaves the same
      // way, because an accidental double-tap that removed a like would be
      // silent and unrecoverable.
      if (!liked) {
        setLiked(true);
        setLikeCount((c) => c + 1);
        onLike(item.id, true);
      }
      medium();
      burst.setValue(0);
      Animated.sequence([
        Animated.spring(burst, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }),
        Animated.timing(burst, { toValue: 0, duration: 260, delay: 260, useNativeDriver: true }),
      ]).start();
      return;
    }
    lastTapRef.current = now;
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      // Detail, not the reader. Tapping the card used to jump straight into
      // whatever source auto-resolved (usually MangaDex) — which is a hard
      // commit to one site that may not even carry the series. Detail shows
      // the synopsis and the verified source list, so the reader is a choice.
      openDetail();
    }, 285);
  }

  function handleBookmarkTap() {
    const next = !bookmarked;
    setBookmarked(next);
    setSaveCount((c) => Math.max(0, next ? c + 1 : c - 1));
    pulse(saveScale, () => onBookmark(item.id, next));
  }

  const entryOpacity  = enterAnim;
  const entryScale    = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] });
  const cardTranslate = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] });

  // Momentum: as the card scrolls away from center (either direction) it eases
  // down in scale/opacity, so a swipe feels like it has weight instead of an
  // instant cut — same idea as TikTok's page transition.
  const focusRange   = [(index - 1) * metrics.height, index * metrics.height, (index + 1) * metrics.height];
  const focusScale   = scrollY.interpolate({ inputRange: focusRange, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' });
  const focusOpacity = scrollY.interpolate({ inputRange: focusRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });
  const cardOpacity  = Animated.multiply(entryOpacity, focusOpacity);
  const cardScale    = Animated.multiply(entryScale, focusScale);

  return (
    <Animated.View style={{ height: metrics.height, opacity: cardOpacity, transform: [{ scale: cardScale }, { translateY: cardTranslate }] }}>
    <TouchableOpacity
      style={[styles.card, { width: metrics.width, height: metrics.height }]}
      activeOpacity={0.98}
      onPress={handleCardTap}>

      {/* ── Background: color base + blurred cover + dark overlay ── */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: item.color || '#0D1A2D' }]} />
      {/* Double-tap burst. pointerEvents none so it never eats a later tap. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.burstWrap, {
          opacity: burst,
          transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }],
        }]}>
        <Ionicons name="heart" size={96} color="rgba(255,255,255,0.92)" />
      </Animated.View>
      {coverUrl && !coverError && (
        <ExpoImage
          source={{ uri: coverUrl }}
          style={[styles.cardBgImage, { opacity: cardBgOpacity }]}
          contentFit="cover"
          cachePolicy="disk"
          blurRadius={Platform.OS === 'ios' ? 18 : 6}
          onError={() => setCoverError(true)}
        />
      )}
      <View style={[styles.cardBgOverlay, { backgroundColor: cardOverlay }]} />

      {/* ── Main layout ── */}
      <View style={[styles.cardLayout, { paddingBottom: tabBarHeight + 8 }]}>

        {/* Centered manga cover with curved border */}
        <View style={styles.coverSection}>
          <TouchableOpacity
            ref={coverCardRef}
            onPress={openDetail}
            activeOpacity={0.85}
            style={[styles.coverCard, { width: metrics.coverW, height: metrics.coverH }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: item.color || '#0D1A2D' }]} />
            {coverUrl && !coverError ? (
              <AnimatedExpoImage
                source={{ uri: coverUrl }}
                style={[StyleSheet.absoluteFill, styles.coverImg, { opacity: fadeAnim }]}
                contentFit="cover"
                cachePolicy="disk"
                blurRadius={covered ? (Platform.OS === 'ios' ? 26 : 14) : 0}
                onLoad={onImageLoad}
                onError={() => { setCoverError(true); fadeAnim.setValue(1); }}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.coverFallback]}>
                <Text style={styles.coverFallbackText}>{(item.title || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {covered && (
              <View style={styles.nsfwGateOverlay} pointerEvents="none">
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.nsfwGateText}>18+</Text>
              </View>
            )}
            {item.comingSoon && (
              <View style={styles.feedComingSoonOverlay}>
                <View style={styles.feedComingSoonChip}>
                  <Text style={styles.feedComingSoonLabel}>{t('feed.unreleased')}</Text>
                </View>
                <Text style={styles.feedComingSoonText}>{t('feed.comingSoon')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Info below cover */}
        <View style={[styles.cardInfo, { maxWidth: metrics.contentW }]}>
          {item._section && item._section !== 'creator' && (
            <View style={[
              styles.sectionBadge,
              item._section === 'hot'      && styles.sectionBadgeHot,
              item._section === 'trending' && styles.sectionBadgeTrending,
              item._section === 'popular'  && styles.sectionBadgePopular,
            ]}>
              <Text style={styles.sectionBadgeText}>
                {item._section === 'hot' ? 'Hot Pick' : item._section === 'trending' ? 'Trending' : 'Popular'}
              </Text>
            </View>
          )}
          {item._section === 'creator' && (
            <View style={[styles.sectionBadge, styles.sectionBadgeCreator]}>
              <Text style={styles.sectionBadgeIcon}>✨</Text>
              <Text style={styles.sectionBadgeText}>{t('feed.creatorLabel')}</Text>
            </View>
          )}
          <View style={styles.genres}>
            {item.genres.map((g) => (
              <View key={g} style={styles.genreTag}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={openDetail} activeOpacity={0.7} hitSlop={{ top: 4, bottom: 4 }}>
            <Text style={[styles.title, { color: cardText }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[styles.description, { color: cardDesc }]} numberOfLines={2}>{item.description}</Text>
          </TouchableOpacity>
          <View style={styles.meta}>
            {item.rating ? (
              <>
                <Ionicons name="star" size={13} color="#FFD700" />
                <Text style={[styles.metaText, { color: cardMuted }]}>{item.rating}</Text>
              </>
            ) : null}
            <Ionicons name="book-outline" size={13} color={cardMuted} style={{ marginLeft: item.rating ? 10 : 0 }} />
            <Text style={[styles.metaText, { color: cardMuted }]}>{item.chapters} ch</Text>
            <Ionicons name="time-outline" size={13} color={cardMuted} style={{ marginLeft: 10 }} />
            <Text style={[styles.metaText, { color: cardMuted }]}>{item.updated}</Text>
          </View>
          <Text style={[styles.author, { color: cardAuthor }]}>
            {'by '}{item.author}{item.readers ? ` · ${item.readers}` : ''}
            {item.status ? <Text style={{ color: item.status === 'Completed' ? '#1D9E75' : '#9B9AA3', fontStyle: 'normal' }}>{' · '}{item.status}</Text> : ''}
          </Text>
        </View>
      </View>

      {/* ── Side actions ── */}
      <View style={styles.sideActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLikeTap}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: liked }}
          accessibilityHint={`${formatCount(likeCount)} likes`}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#E8527A' : cardText} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: cardText }]}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => pulse(chatScale, () => onComment(item))}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Comments"
          accessibilityHint={`${formatCount(item.commentCount || 0)} comments`}>
          <Animated.View style={{ transform: [{ scale: chatScale }] }}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={cardText} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: cardText }]}>{formatCount(item.commentCount || 0)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => { setShareCount((c) => c + 1); pulse(shareScale, () => onShare(item)); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share">
          <Animated.View style={{ transform: [{ scale: shareScale }] }}>
            <Ionicons name="share-social-outline" size={28} color={cardText} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: cardText }]}>{formatCount(shareCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleBookmarkTap}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          accessibilityState={{ selected: bookmarked }}>
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <Ionicons
              name={bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={28}
              color={bookmarked ? '#A09CE0' : cardText}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: cardText }]}>{formatCount(saveCount)}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
    </Animated.View>
  );
}, (prev, next) => (
  prev.item.feedKey       === next.item.feedKey       &&
  prev.item.liked         === next.item.liked         &&
  prev.item.bookmarked    === next.item.bookmarked    &&
  prev.item.likeCount     === next.item.likeCount     &&
  prev.item.likes         === next.item.likes         &&
  prev.item.commentCount  === next.item.commentCount  &&
  prev.item.bookmarkCount === next.item.bookmarkCount &&
  prev.item.shareCount    === next.item.shareCount
));

// ── CommentItem ─────────────────────────────────────────────────────────────

function CommentItem({ item, onLike, onReveal, revealed, onReply, colors }) {
  const t = useT();
  const likeScale = useRef(new Animated.Value(1)).current;
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  function handleLike() {
    light();
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 0.55, useNativeDriver: true, speed: 90, bounciness: 0 }),
      Animated.spring(likeScale, { toValue: 1.45, useNativeDriver: true, speed: 18, bounciness: 16 }),
      Animated.spring(likeScale, { toValue: 1.0,  useNativeDriver: true, speed: 22, bounciness: 5 }),
    ]).start();
    onLike(item.id);
  }

  async function toggleReplies() {
    if (repliesExpanded) { setRepliesExpanded(false); return; }
    if (replies.length === 0) {
      setRepliesLoading(true);
      const { data } = await supabase
        .from('comments')
        .select('id, text, created_at, author:user_id(username, display_name, avatar_url, color)')
        .eq('parent_id', item.id)
        .order('created_at', { ascending: true });
      if (data) {
        setReplies(data.map((r) => {
          const name = r.author?.display_name || r.author?.username || 'Reader';
          const diffMs = Date.now() - new Date(r.created_at).getTime();
          const m = Math.floor(diffMs / 60000);
          const h = Math.floor(m / 60);
          const d = Math.floor(h / 24);
          const time = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'Just now';
          return {
            id: r.id, name, avatar: name.charAt(0).toUpperCase(),
            avatarUrl: r.author?.avatar_url || null, color: r.author?.color || null,
            time, text: r.text,
          };
        }));
      }
      setRepliesLoading(false);
    }
    setRepliesExpanded(true);
  }

  return (
    <View style={styles.commentRow}>
      <View style={[styles.commentAvatar, { backgroundColor: themeColor(item.color) }]}>
        {item.avatarUrl
          ? <Image source={{ uri: item.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Text style={styles.commentAvatarText}>{item.avatar}</Text>}
      </View>

      <View style={styles.commentContent}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentUser, { color: colors.text }]}>{item.user}</Text>
          {item.spoiler && (
            <View style={styles.spoilerBadge}>
              <Text style={styles.spoilerBadgeText}>{t('feed.spoiler')}</Text>
            </View>
          )}
          <Text style={[styles.commentTime, { color: colors.muted }]}>{item.time}</Text>
        </View>

        {item.spoiler && !revealed ? (
          <TouchableOpacity
            style={[styles.spoilerReveal, { borderColor: colors.border }]}
            onPress={() => onReveal(item.id)}>
            <Ionicons name="eye-off-outline" size={13} color={colors.muted} />
            <Text style={[styles.spoilerRevealText, { color: colors.muted }]}>{t('feed.tapToReveal')}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.commentText, { color: colors.text }]}>{item.text}</Text>
        )}

        <View style={styles.commentFooter}>
          <TouchableOpacity style={styles.replyBtn} onPress={() => onReply?.(item.user)}>
            <Text style={[styles.replyBtnText, { color: colors.muted }]}>{t('feed.reply')}</Text>
          </TouchableOpacity>
          {item.replyCount > 0 && (
            <TouchableOpacity onPress={toggleReplies}>
              <Text style={styles.repliesBtnText}>
                {repliesExpanded
                  ? '↑ Hide replies'
                  : `↳ ${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {repliesExpanded && (
          repliesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
          ) : (
            <View style={styles.replyThread}>
              {replies.map((r) => (
                <View key={r.id} style={styles.replyItem}>
                  <View style={[styles.replyAvatar, { backgroundColor: themeColor(r.color) }]}>
                    {r.avatarUrl
                      ? <Image source={{ uri: r.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      : <Text style={styles.replyAvatarText}>{r.avatar}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Text style={[styles.replyName, { color: colors.text }]}>{r.name}</Text>
                      <Text style={[styles.replyTime, { color: colors.muted }]}>{r.time}</Text>
                    </View>
                    <Text style={[styles.replyText, { color: colors.text }]}>{r.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </View>

      <View style={styles.commentLikeCol}>
        <TouchableOpacity onPress={handleLike} style={styles.commentLikeBtn}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={item.liked ? 'heart' : 'heart-outline'}
              size={20}
              color={item.liked ? '#E8527A' : colors.muted}
            />
          </Animated.View>
          <Text style={[styles.commentLikeCount, { color: item.liked ? '#E8527A' : colors.muted }]}>
            {formatCount(item.likes)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const metrics = useFeedMetrics();
  const route = useRoute();
  const searchCoachTarget = useCoachmarkTarget('header-search');
  // Video cards lay their own caption out, so they need the same real tab-bar
  // height FeedCard measures rather than a hardcoded guess.
  const tabBarHeight = useBottomTabBarHeight();

  const [feed, setFeed]           = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [savedMap, setSavedMap]   = useState(new Map());
  const [likedIds, setLikedIds]   = useState(new Set());
  const realtimeRef = useRef(null);
  const logoRef = useRef(null);
  const [comments, setComments]   = useState({});
  const [revealedSpoilers, setRevealedSpoilers] = useState(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const { items: notifications, unreadCount, load: reloadNotifs, clearAll: handleClearAllNotif, markAllSeen, acceptFriendRequest } = useNotifications();

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUsername, setCurrentUsername] = useState('Reader');
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState(null);
  const [currentUserColor, setCurrentUserColor] = useState(null);
  const [commentFetching, setCommentFetching] = useState(false);
  const [commentLoadingMore, setCommentLoadingMore] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  useAnnounceOnOpen(commentsOpen, t('feed.comments'));
  useAnnounceOnOpen(searchOpen, t('common.search'));
  useAnnounceOnOpen(shareSheetOpen, t('feed.sendTo'));
  // sms:/mailto: are default-queryable system schemes on both platforms (no
  // extra entitlement needed), so canOpenURL reliably reflects real device
  // capability here — unlike third-party app schemes (e.g. whatsapp://),
  // which report false everywhere unless the scheme is declared in a native
  // config plugin (LSApplicationQueriesSchemes / Android <queries>), so we
  // deliberately don't try to detect those and always show them instead.
  const [destAvailable, setDestAvailable] = useState({ sms: true, email: true });
  const [cardShareOpen, setCardShareOpen]   = useState(false);
  const [shareProgress, setShareProgress]   = useState(0);
  const [shareChapter, setShareChapter]     = useState(1);
  const [sendFriends, setSendFriends]       = useState([]);
  const [sendSentTo, setSendSentTo]         = useState({});
  const [friendSearchOpen, setFriendSearchOpen]   = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [linkCopied, setLinkCopied]         = useState(false);
  const [activeItem, setActiveItem]   = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentSpoiler, setCommentSpoiler] = useState(false);
  const [siteInput, setSiteInput]     = useState('');
  const [refreshing, setRefreshing]   = useState(false);

  const notifY    = useRef(new Animated.Value(-metrics.notifH)).current;
  // The panel's resting position is "one panel-height above the top", which
  // changes when the window does. The Animated.Value is created once, so a
  // rotation while the panel is closed would otherwise leave it peeking in.
  useEffect(() => {
    if (!notifOpen) notifY.setValue(-metrics.notifH);
  }, [metrics.notifH, notifOpen]);
  const notifFade = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const commentInputRef = useRef(null);
  const loadingMoreRef  = useRef(false);

  // Scroll-driven momentum for the paging feed — cards ease their scale/opacity
  // in and out as they cross the viewport, and a light haptic ticks each time
  // a swipe settles on a new card (mirrors TikTok's page-snap feedback).
  const scrollY = useRef(new Animated.Value(0)).current;
  const onFeedScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
  ).current;
  const lastSnapIndexRef = useRef(0);
  // Which card the feed is settled on. Only video cards read it — FeedCard's
  // memo comparator ignores every prop that changes here, so manga cards do
  // not re-render when this moves.
  const [activeIndex, setActiveIndex] = useState(0);
  function onFeedMomentumEnd(e) {
    const idx = Math.round(e.nativeEvent.contentOffset.y / metrics.height);
    if (idx !== lastSnapIndexRef.current) {
      lastSnapIndexRef.current = idx;
      setActiveIndex(idx);
      selection();
    }
  }

  async function loadUserInfo() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setCurrentUserId(uid);
    supabase.from('profiles').select('username, display_name, avatar_url, color').eq('id', uid).maybeSingle().then(({ data }) => {
      if (data?.username) setCurrentUsername(data.display_name || data.username);
      setCurrentUserAvatarUrl(data?.avatar_url || null);
      setCurrentUserColor(data?.color || null);
    });
  }

  // ── Augment MANGA_POOL with live MangaDex data once per session ─────────

  useEffect(() => { augmentPoolFromApi(); }, []);

  // ── Reload genre weights every time feed is focused (picks up reading sessions) ──

  useFocusEffect(useCallback(() => {
    loadFeedPrefs();
    loadUserInfo();
    reloadNotifs();
  }, []));

  // ── Load prefs + saved bookmarks on mount ────────────────────────────────

  useEffect(() => {
    loadFeedPrefs();
    loadUserInfo();
    reloadNotifs();
    AsyncStorage.getItem('@mangarecs_saved').then((val) => {
      if (!val) return;
      try {
        const saved = JSON.parse(val);
        const map = new Map(saved.map((s) => [s.id, s]));
        setSavedMap(map);
        setFeed((prev) => prev.map((item) => ({ ...item, bookmarked: map.has(item.id) })));
      } catch (_) {}
    });
    AsyncStorage.getItem('@mangarecs_liked_posts').then((val) => {
      try {
        const ids = val ? JSON.parse(val) : [];
        const localSet = new Set(ids);
        setLikedIds(localSet);
        setFeed((prev) => prev.map((item) => ({ ...item, liked: localSet.has(item.id) })));
      } catch (_) {}
      // Merge server-side likes for cross-device restore
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user?.id) return;
        supabase.from('post_likes').select('series_title').eq('user_id', session.user.id).then(({ data }) => {
          if (!data?.length) return;
          const titleToId = {};
          MANGA_POOL.forEach((m) => { titleToId[m.title] = m.id; });
          const serverIds = new Set(data.map((r) => titleToId[r.series_title]).filter(Boolean));
          if (serverIds.size === 0) return;
          setLikedIds((prev) => {
            const merged = new Set([...prev, ...serverIds]);
            if (merged.size === prev.size) return prev;
            AsyncStorage.setItem('@mangarecs_liked_posts', JSON.stringify([...merged])).catch(() => {});
            return merged;
          });
          setFeed((prev) => prev.map((item) => ({
            ...item,
            liked: item.liked || serverIds.has(item.id),
          })));
        });
      });
    });
  }, []);

  // ── Initial feed load ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    // Offline-first: hydrate the last session's feed from disk instantly so a
    // cold start (or no network) never shows a blank screen. The live load
    // below replaces it as soon as it lands.
    AsyncStorage.getItem(FEED_CACHE_KEY).then((raw) => {
      if (!raw || cancelled) return;
      try {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          setFeed((prev) => (prev.length > 0 ? prev : cached));
          setInitialLoading(false);
        }
      } catch (_) {}
    });

    (async () => {
      try {
      // Read local saved/liked state first for immediate use
      let savedIds = new Set();
      let likedSet = new Set();
      try {
        const savedRaw = await AsyncStorage.getItem('@mangarecs_saved');
        if (savedRaw) (JSON.parse(savedRaw) || []).forEach((s) => savedIds.add(s.id));
        const likedRaw = await AsyncStorage.getItem('@mangarecs_liked_posts');
        if (likedRaw) (JSON.parse(likedRaw) || []).forEach((id) => likedSet.add(id));
      } catch (_) {}

      // Restore cross-device likes and set userId for the personalized RPC
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        _currentUserId = session.user.id;
        const { data: likedRows } = await supabase
          .from('user_likes')
          .select('manga_id')
          .eq('user_id', session.user.id);
        if (likedRows?.length) {
          likedRows.forEach((r) => likedSet.add(r.manga_id));
          setLikedIds(new Set(likedSet));
        }
      }

      // Primary: sectioned feed — Hot Picks → Trending → Popular → algo
      // The video pool loads alongside the queue rather than after it, so the
      // first batch can already carry video instead of only getting it once
      // the user scrolls far enough to trigger loadMore.
      await Promise.all([refillQueue(), loadVideoPool()]);
      let firstBatch = buildSectionedFeed(savedIds, likedSet);

      // Prepend creator series (max 3, before hot picks)
      try {
        const { data: creatorSeries } = await supabase
          .from('series')
          .select('id, title, description, genre, chapters, views, creator_id, created_at')
          .order('created_at', { ascending: false })
          .limit(3);
        if (creatorSeries?.length) {
          const converted = creatorSeries.map((s) => ({
            id: `creator-${s.id}`,
            creatorSeriesId: s.id,
            title: s.title,
            description: s.description || 'A new series from a MangaRecs creator.',
            genres: s.genre ? [s.genre] : ['Original'],
            rating: null,
            chapters: s.chapters || 1,
            readers: s.views ? `${s.views.toLocaleString()}` : '0',
            author: 'MangaRecs Creator',
            updated: 'just now',
            color: '#1A1633',
            likeCount: 0,
            commentCount: 0,
            isCreatorUpload: true,
            liked: false,
            bookmarked: false,
            _section: 'creator',
            feedKey: `creator-${s.id}_${++_feedCounter}`,
            status: 'Ongoing',
          }));
          firstBatch = [...converted, ...firstBatch];
        }
      } catch (_) {}

      if (cancelled) return;
      // Videos go in last, after the creator prepend, so the cadence counts
      // real feed positions rather than positions that later shift.
      firstBatch = interleaveVideos(firstBatch, 0);
      setFeed(firstBatch);
      setInitialLoading(false);
      syncLiveCounts(firstBatch);
      setupRealtimeSubscription();
      // Persist the top of the fresh feed for next launch / offline starts
      AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(firstBatch.slice(0, 12))).catch(() => {});
      } catch (_) {
        // Network failed — the cached feed (hydrated above) stays on screen
        if (!cancelled) setInitialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, []);

  // ── Live counts ───────────────────────────────────────────────────────────
  // Cards built from the local pool start at 0 — pull the real like/comment/
  // save/share counters from manga_pool for every card as soon as it enters
  // the feed, so counts are live without needing a tap. Realtime keeps them
  // fresh afterwards.
  async function syncLiveCounts(items) {
    // Video cards carry no manga_pool row — their ids would just be 120 misses
    // on every batch.
    const ids = [...new Set(items.filter((i) => i && !i.isCreatorUpload && i.kind !== 'video').map((i) => i.id))];
    if (ids.length === 0) return;
    const { data, error } = await supabase
      .from('manga_pool')
      .select('id, likes, comment_count, bookmark_count, share_count')
      .in('id', ids);
    if (error || !data?.length) return;
    const byId = new Map(data.map((r) => [r.id, r]));
    setFeed((prev) => prev.map((item) => {
      const r = byId.get(item.id);
      if (!r) return item;
      return {
        ...item,
        likeCount:     r.likes          ?? item.likeCount,
        likes:         r.likes          ?? item.likes,
        commentCount:  r.comment_count  ?? item.commentCount,
        bookmarkCount: r.bookmark_count ?? item.bookmarkCount,
        shareCount:    r.share_count    ?? item.shareCount,
      };
    }));
  }

  // ── Feed actions ──────────────────────────────────────────────────────────

  function handleOpenReader(item) {
    if (item.comingSoon) {
      showAppToast(t('toast.notReleased', { title: item.title }), 'info');
      return;
    }
    const isMangaDexUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
    const mangaId = item.mangaId || (isMangaDexUuid ? item.id : undefined);
    const searchQuery = isMangaDexUuid ? item.title : (item.searchKey || item.title);
    setLastRead({
      title: item.title,
      searchKey: item.title,
      chapter: 1,
      chapterLabel: null,
      color: item.color || '#1A1A2E',
      lang: item.lang || 'ja',
      chapters: item.chapters || 999,
      rating: item.rating,
    });
    if (item.creatorSeriesId) {
      navigation.navigate('Reader', {
        creatorSeriesId: item.creatorSeriesId,
        title: item.title,
        lang: item.lang || 'ja',
      });
    } else {
      navigation.navigate('Reader', {
        searchQuery,
        title: item.title,
        chapters: item.chapters || 1,
        mangaId,
        lang: item.lang || 'ja',
      });
    }
    if (currentUserId) syncReadOpen(currentUserId, item.title);
    // Opening a series is the strongest taste signal — weight it double vs a like
    if (item.genres?.length) {
      trackGenreInteraction(item.genres);
      trackGenreInteraction(item.genres);
    }
  }

  // FeedCard calls handleLike(id, isNowLiked) — card already updated its own
  // liked/likeCount state optimistically, but that lives in local card state
  // only. The feed list uses windowSize/removeClippedSubviews, so a card can
  // unmount and remount as the user scrolls, re-initializing from whatever
  // `feed` still has — patch it here too so the count survives that.
  function handleLike(id, isNowLiked) {
    const item = feed.find((i) => i.id === id);
    if (isNowLiked && item?.genres?.length) trackGenreInteraction(item.genres);

    setFeed((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const count = Math.max(0, (i.likeCount ?? i.likes ?? 0) + (isNowLiked ? 1 : -1));
      return { ...i, liked: isNowLiked, likeCount: count, likes: count };
    }));

    setLikedIds((prev) => {
      const next = new Set(prev);
      isNowLiked ? next.add(id) : next.delete(id);
      AsyncStorage.setItem('@mangarecs_liked_posts', JSON.stringify([...next])).catch(() => {});
      return next;
    });

    if (currentUserId && item) {
      // user_likes table (authoritative per-user record)
      if (isNowLiked) {
        supabase.from('user_likes')
          .upsert({ user_id: currentUserId, manga_id: id }, { onConflict: 'user_id,manga_id', ignoreDuplicates: true })
          .then(() => {});
      } else {
        supabase.from('user_likes').delete()
          .eq('user_id', currentUserId).eq('manga_id', id).then(() => {});
      }
      // manga_pool aggregate counter (realtime broadcasts this back to all clients)
      supabase.rpc('increment_manga_likes', { p_manga_id: id, p_delta: isNowLiked ? 1 : -1 }).then(() => {});
      // genre preference weights for ForYouScreen
      if (item.genres?.length) {
        item.genres.forEach((genre) => {
          supabase.rpc('upsert_genre_weight', { p_user_id: currentUserId, p_genre: genre, p_delta: isNowLiked ? 2 : -1 }).then(() => {});
        });
      }
      // keep post_likes for backwards compat with existing comment counts
      const op = isNowLiked
        ? supabase.from('post_likes').upsert({ user_id: currentUserId, series_title: item.title })
        : supabase.from('post_likes').delete().eq('user_id', currentUserId).eq('series_title', item.title);
      op.then(() => {});
    }
  }

  function showSaveToast() {
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  // FeedCard calls handleBookmark(id, isNowSaved) — card already updated its
  // own bookmarked state locally, but (same reasoning as handleLike above)
  // that's lost on remount unless it's also mirrored into `feed`.
  function handleBookmark(id, isNowSaved) {
    const item = feed.find((i) => i.id === id);
    if (!item) return;

    // Reading is free; keeping is what needs an account. A guest saving here
    // would build a library tied to an anonymous session that dies with the
    // install — so this is the moment the signup ask actually justifies itself.
    if (isNowSaved) {
      requireAccount({
        what: 'save this series',
        onSignUp: () => navigation.navigate('Profile', { screen: 'Settings' }),
        action: () => applyBookmark(id, item, true),
      });
      return;
    }
    applyBookmark(id, item, false);
  }

  function applyBookmark(id, item, isNowSaved) {

    setFeed((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const count = Math.max(0, (i.bookmarkCount ?? i.bookmark_count ?? 0) + (isNowSaved ? 1 : -1));
      return { ...i, bookmarked: isNowSaved, bookmarkCount: count, bookmark_count: count };
    }));

    setSavedMap((prev) => {
      const next = new Map(prev);
      isNowSaved ? next.set(id, { ...item, bookmarked: true }) : next.delete(id);
      AsyncStorage.setItem('@mangarecs_saved', JSON.stringify([...next.values()])).catch(() => {});
      return next;
    });

    supabase.rpc('increment_manga_bookmarks', { p_manga_id: id, p_delta: isNowSaved ? 1 : -1 }).then(() => {});

    if (isNowSaved) {
      showSaveToast();
      trackGenreInteraction(item.genres);
      if (currentUserId) {
        syncLibraryWrite(() => supabase.from('reading_progress').upsert({
          user_id: currentUserId,
          series_title: item.title,
          status: 'bookmarked',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
      }
    } else if (currentUserId) {
      syncLibraryWrite(() => supabase.from('reading_progress').delete()
        .eq('user_id', currentUserId).eq('series_title', item.title).eq('status', 'bookmarked'), 'remove bookmark');
    }
  }

  function handleCommentOpen(item) {
    light();
    setActiveItem(item);
    setCommentsOpen(true);
    setCommentSpoiler(false);
    loadPostComments(item);
  }

  async function handleShareOpen(item) {
    light();
    // Persist the share for the live counter (matches the optimistic +1 on
    // tap) and mirror it into `feed` — same reasoning as handleLike/
    // handleBookmark above, the card's own local count doesn't survive a
    // scroll-triggered unmount/remount on its own.
    if (item?.id) {
      supabase.rpc('increment_manga_shares', { p_manga_id: item.id, p_delta: 1 }).then(() => {});
      setFeed((prev) => prev.map((i) => {
        if (i.id !== item.id) return i;
        const count = (i.shareCount ?? i.share_count ?? 0) + 1;
        return { ...i, shareCount: count, share_count: count };
      }));
    }
    setActiveItem(item);
    setShareProgress(0);
    setShareChapter(1);
    setSendSentTo({});
    setSendFriends([]);
    setFriendSearchOpen(false);
    setFriendSearchQuery('');
    setShareSheetOpen(true);
    Promise.all([Linking.canOpenURL('sms:'), Linking.canOpenURL('mailto:')])
      .then(([sms, email]) => setDestAvailable({ sms, email }))
      .catch(() => {});
    // Load share progress and friends list in parallel
    const progressQuery = currentUserId && item?.title && item?.chapters > 0
      ? supabase.from('reading_progress').select('current_chapter').eq('user_id', currentUserId).eq('series_title', item.title).maybeSingle()
      : Promise.resolve({ data: null });
    const friendsQuery = currentUserId
      ? supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`).eq('status', 'accepted')
      : Promise.resolve({ data: null });
    const [{ data: progressData }, { data: rows }] = await Promise.all([progressQuery, friendsQuery]);
    if (progressData?.current_chapter) {
      setShareProgress(Math.min(1, progressData.current_chapter / item.chapters));
      setShareChapter(progressData.current_chapter);
    }
    if (rows?.length > 0) {
      const friendIds = rows.map((f) => f.requester_id === currentUserId ? f.addressee_id : f.requester_id);
      const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, color, avatar_url, streak_count').in('id', friendIds);
      if (profiles) {
        setSendFriends(profiles.map((p) => ({ id: p.id, name: p.display_name || p.username || 'Friend', color: p.color, avatarUrl: p.avatar_url, streak: p.streak_count || 0 })));
      }
    }
  }

  // Opens the real OS share sheet — the same grid of installed-app icons
  // TikTok/Instagram themselves hand off to for anything beyond their own
  // in-app "send to a friend" row, which is what this list already covers.
  async function handleNativeShare() {
    if (!activeItem) return;
    setShareSheetOpen(false);
    try {
      await Share.share({
        message: `Check out ${activeItem.title} on MangaRecs! 📚\nhttps://mangarecs.net/catalog/title/${activeItem.id || ''}`,
      });
    } catch (_) {}
  }

  function getShareText() {
    const link = `https://mangarecs.net/catalog/title/${activeItem?.id || ''}`;
    const blurb = `Check out ${activeItem?.title || 'this manga'} on MangaRecs! 📚`;
    return { link, blurb, full: `${blurb}\n${link}` };
  }

  async function handleCopyLink() {
    try {
      await Share.share({ message: getShareText().full });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (_) {}
  }

  function shareViaSMS() {
    const sep = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${sep}body=${encodeURIComponent(getShareText().full)}`).catch(() => {});
  }

  function shareViaEmail() {
    const { blurb, link } = getShareText();
    Linking.openURL(`mailto:?subject=${encodeURIComponent('Check this out on MangaRecs')}&body=${encodeURIComponent(`${blurb}\n${link}`)}`).catch(() => {});
  }

  function shareViaWhatsApp() {
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(getShareText().full)}`).catch(() => {});
  }

  function shareViaFacebook() {
    Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareText().link)}`).catch(() => {});
  }

  async function handleSendRecommendation(friend) {
    if (!currentUserId || !activeItem) return;
    setSendSentTo((prev) => ({ ...prev, [friend.id]: 'sending' }));
    const mangaData = {
      title: activeItem.title,
      searchKey: activeItem.searchKey || activeItem.title,
      lang: activeItem.lang || 'ja',
      chapters: activeItem.chapters,
      genres: activeItem.genres,
      rating: activeItem.rating,
      color: activeItem.color,
    };
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: currentUserId,
      recipient_id: friend.id,
      message_type: 'recommendation',
      manga_data: mangaData,
    });
    setSendSentTo((prev) => ({ ...prev, [friend.id]: error ? 'error' : 'sent' }));
    if (!error) {
      supabase.from('notifications').insert({
        user_id: friend.id,
        actor_id: currentUserId,
        type: 'direct_message',
        data: { message_type: 'recommendation', manga_title: activeItem.title },
      }).then(() => {});
    }
  }

  // ── Comment actions ───────────────────────────────────────────────────────

  function handleCommentLike(commentId) {
    if (!activeItem) return;
    setComments((prev) => ({
      ...prev,
      [activeItem.id]: prev[activeItem.id]?.map((c) =>
        c.id === commentId
          ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
          : c
      ) || [],
    }));
    if (currentUserId) {
      supabase.rpc('toggle_comment_like', { p_comment_id: commentId }).then(() => {});
    }
  }

  function toggleSpoiler(commentId) {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      next.has(commentId) ? next.delete(commentId) : next.add(commentId);
      return next;
    });
  }

  async function handleSendComment() {
    const text = commentInput.trim();
    if (!text || !activeItem) return;
    if (containsBlockedLanguage(text)) {
      showAppToast(t('toast.badLanguage'));
      return;
    }
    const isSpoiler = commentSpoiler;
    const optimistic = {
      id: `opt-${Date.now()}`,
      user: currentUsername,
      avatar: currentUsername.charAt(0).toUpperCase(),
      avatarUrl: currentUserAvatarUrl,
      color: currentUserColor,
      time: 'Just now',
      text,
      likes: 0,
      liked: false,
      spoiler: isSpoiler,
      replyCount: 0,
    };
    setComments((prev) => ({ ...prev, [activeItem.id]: [optimistic, ...(prev[activeItem.id] || [])] }));
    // Optimistically increment the card's comment count
    setFeed((prev) => prev.map((item) =>
      item.id === activeItem.id ? { ...item, commentCount: (item.commentCount || 0) + 1 } : item
    ));
    setCommentInput('');
    setCommentSpoiler(false);
    light();
    if (currentUserId) {
      await supabase.from('comments').insert({ user_id: currentUserId, series_title: activeItem.title, text, spoiler: isSpoiler });
      // No profile lookup needed — notify-user resolves both the commenter's
      // name and the series owner server-side from the caller's JWT.
      sendCommentPush(activeItem.title).catch(() => {});
    }
  }

  // ── Post comments (Supabase) ──────────────────────────────────────────────

  // `append` pages the comment sheet. The sheet used to stop dead at 30 with no
  // way to see any further, which on a popular series means most of the
  // conversation is unreachable.
  async function loadPostComments(item, { append = false } = {}) {
    if (append) setCommentLoadingMore(true); else setCommentFetching(true);
    const offset = append ? (comments[item.id]?.length || 0) : 0;

    // Fetch real counts so the displayed numbers reflect actual DB state
    const [{ count: realCommentCount }, { count: realLikeCount }] = await Promise.all([
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('series_title', item.title).is('parent_id', null),
      supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('series_title', item.title),
    ]);
    // Real counts are shown in the modal header; card face shows counts from initial load.

    const { data, error } = await supabase
      .from('comments')
      .select('id, user_id, text, likes, spoiler, created_at, author:user_id(username, display_name, avatar_url, color)')
      .eq('series_title', item.title)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + FEED_COMMENT_PAGE_SIZE - 1);
    if (error || !data || data.length === 0) {
      if (!append) setComments((prev) => ({ ...prev, [item.id]: [] }));
      setHasMoreComments(false);
      setCommentFetching(false);
      setCommentLoadingMore(false);
      return;
    }
    setHasMoreComments(data.length === FEED_COMMENT_PAGE_SIZE);

    // Fetch reply counts and liked set in parallel
    const parentIds = data.map((c) => c.id);
    const [likedResult, repliesResult] = await Promise.all([
      currentUserId
        ? supabase.from('comment_likes').select('comment_id').eq('user_id', currentUserId).in('comment_id', parentIds)
        : Promise.resolve({ data: [] }),
      supabase.from('comments').select('parent_id').in('parent_id', parentIds),
    ]);
    const likedSet = new Set((likedResult.data || []).map((l) => l.comment_id));
    const replyCountMap = {};
    (repliesResult.data || []).forEach((r) => {
      if (r.parent_id) replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] || 0) + 1;
    });

    const now = Date.now();
    const mapped = data.map((row) => {
      const diffMs = now - new Date(row.created_at).getTime();
      const m = Math.floor(diffMs / 60000);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      const time = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'Just now';
      const name = row.author?.display_name || row.author?.username || 'Reader';
      return {
        id: row.id, user: name, avatar: name.charAt(0).toUpperCase(),
        avatarUrl: row.author?.avatar_url || null, color: row.author?.color || null,
        time, text: row.text, likes: row.likes || 0, liked: likedSet.has(row.id),
        spoiler: row.spoiler || false, replyCount: replyCountMap[row.id] || 0,
      };
    });
    setComments((prev) => {
      if (!append) return { ...prev, [item.id]: mapped };
      const existing = prev[item.id] || [];
      const seen = new Set(existing.map((c) => c.id));
      return { ...prev, [item.id]: [...existing, ...mapped.filter((c) => !seen.has(c.id))] };
    });
    setCommentFetching(false);
    setCommentLoadingMore(false);
  }

  // ── Notification panel ────────────────────────────────────────────────────

  function openNotif() {
    setNotifOpen(true);
    Animated.parallel([
      Animated.spring(notifY,    { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280, mass: 0.9 }),
      Animated.timing(notifFade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function closeNotif() {
    // Panel was open, so everything in it has been seen — clear the bell badge
    // (pending friend requests stay unread so their Accept button survives)
    markAllSeen();
    Animated.parallel([
      Animated.timing(notifY,    { toValue: -metrics.notifH, duration: 260, useNativeDriver: true }),
      Animated.timing(notifFade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setNotifOpen(false));
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  function handleGo() {
    if (!siteInput) return;
    const url = siteInput.startsWith('http') ? siteInput : `https://${siteInput}`;
    setSiteInput('');
    setSearchOpen(false);
    navigation.navigate('Reader', { url, title: siteInput });
  }

  // ── Tab-icon tap → refresh ────────────────────────────────────────────────
  useEffect(() => {
    if (route.params?.refreshAt) { logoRef.current?.spin(); onRefresh(); }
  }, [route.params?.refreshAt]);

  function setupRealtimeSubscription() {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    const channel = supabase
      .channel(`manga-pool-likes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'manga_pool' }, (payload) => {
        if (payload.new?.id) {
          const n = payload.new;
          setFeed((prev) => prev.map((item) =>
            item.id === n.id
              ? {
                  ...item,
                  likeCount:     n.likes ?? item.likeCount,
                  likes:         n.likes ?? item.likes,
                  commentCount:  n.comment_count  ?? item.commentCount,
                  bookmarkCount: n.bookmark_count ?? item.bookmarkCount,
                  shareCount:    n.share_count    ?? item.shareCount,
                }
              : item
          ));
        }
      })
      .subscribe();
    realtimeRef.current = channel;
  }

  async function loadMore() {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const savedIds = new Set(savedMap.keys());
    const batch = dequeueItems(BATCH_SIZE, savedIds).map((item) => ({
      ...item, liked: likedIds.has(item.id),
    }));
    // Offset by what's already above so the one-in-five cadence carries across
    // pages instead of restarting at each seam. Computed out here, not inside
    // the updater below: interleaveVideos advances the pool's rotation cursor,
    // and a state updater has to be pure — React is free to call it twice.
    const withVideos = interleaveVideos(batch, feed.length);
    setFeed((prev) => {
      const next = [...prev, ...withVideos];
      return next.length > MAX_FEED_LENGTH ? next.slice(TRIM_BATCH) : next;
    });
    syncLiveCounts(batch);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadFeedPrefs();
    // Clear seen IDs so the refresh pulls a fresh feed
    _seenIds.clear();
    _feedQueue = [];
    // Retries the video pool too when a previous load failed (table missing,
    // network blip) — otherwise pulling to refresh brings back manga only.
    await Promise.all([refillQueue(), loadVideoPool()]);
    const savedIds = new Set(savedMap.keys());
    const batch = interleaveVideos(buildSectionedFeed(savedIds, likedIds), 0);
    setFeed(batch);
    syncLiveCounts(batch);
    setRefreshing(false);
  }

  const activeComments = activeItem ? (comments[activeItem.id] || []) : [];

  const toastTranslateY = toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  if (initialLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <StarLogo ref={logoRef} size={38} />
        </View>
        <SkeletonFeed />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <StarLogo ref={logoRef} size={38} />
        <View style={styles.headerRight}>
          <TouchableOpacity ref={searchCoachTarget} style={styles.headerBtn} onPress={() => setSearchOpen(true)} accessibilityRole="button" accessibilityLabel={t('common.search')}>
            <Ionicons name="search-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openNotif}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
            <Ionicons name="notifications-outline" size={24} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                {/* The badge is a hard 16x16 circle, so this is one of the few
                    places where unbounded scaling genuinely breaks: at 200% the
                    digits spill outside the dot. The count is also spoken in
                    the button's accessibilityLabel above, so the number here is
                    a glance cue and can stay bounded. */}
                <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed */}
      <AnimatedFlatList
        data={feed}
        keyExtractor={(item) => item.feedKey}
        renderItem={({ item, index }) => (
          item.kind === 'video' ? (
            <ShortVideoCard
              item={item}
              height={metrics.height}
              isActive={index === activeIndex}
              tabBarHeight={tabBarHeight}
            />
          ) : (
            <FeedCard
              item={item}
              index={index}
              scrollY={scrollY}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onComment={handleCommentOpen}
              onShare={handleShareOpen}
              onOpen={handleOpenReader}
            />
          )
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={metrics.height}
        snapToAlignment="start"
        decelerationRate="fast"
        overScrollMode="always"
        bounces={true}
        onScroll={onFeedScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onFeedMomentumEnd}
        getItemLayout={(_, index) => ({ length: metrics.height, offset: metrics.height * index, index })}
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        updateCellsBatchingPeriod={100}
        onEndReached={loadMore}
        onEndReachedThreshold={4}
        ListFooterComponent={
          loadingMore ? (
            <View style={[styles.loadingMore, { height: metrics.height }]}>
              <Text style={styles.loadingMoreDot}>· · ·</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      />

      {/* Save-to-library toast */}
      <Animated.View
        pointerEvents="none"
        style={[styles.saveToast, { opacity: toastAnim, transform: [{ translateY: toastTranslateY }] }]}>
        <Ionicons name="bookmark" size={14} color="#A09CE0" />
        <Text style={styles.saveToastText}>{t('feed.savedToLibrary')}</Text>
      </Animated.View>

      {/* TikTok-style Comments */}
      <Modal visible={commentsOpen} animationType="slide" transparent onRequestClose={() => setCommentsOpen(false)}>
        <KeyboardAvoidingView
          style={styles.commentsWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCommentsOpen(false)}  accessibilityElementsHidden importantForAccessibility="no"/>

          <View style={[styles.commentsSheet, { height: metrics.commentsH, backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={[styles.commentsHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.commentsTitle, { color: colors.text }]}>
                {(activeItem?.commentCount ?? 0) > 0 ? `${formatCount(activeItem.commentCount)} Comments` : 'Comments'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    setCommentsOpen(false);
                    navigation.navigate('Discussion', {
                      title: activeItem?.title,
                      searchKey: activeItem?.searchKey || activeItem?.title,
                      lang: activeItem?.lang,
                      color: activeItem?.color,
                      latestChapter: activeItem?.chapters,
                      discussing: activeItem?.commentCount,
                    });
                  }}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('feed.fullDiscussion')}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={HIT_SLOP}
                  style={[styles.commentsCloseBtn, { backgroundColor: colors.inputBg }]}
                  onPress={() => setCommentsOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={activeComments}
              keyExtractor={(c) => c.id}
              style={styles.commentsList}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <CommentItem
                  item={item}
                  onLike={handleCommentLike}
                  onReveal={toggleSpoiler}
                  revealed={revealedSpoilers.has(item.id)}
                  onReply={(name) => {
                    setCommentInput(`@${name} `);
                    setTimeout(() => commentInputRef.current?.focus(), 80);
                  }}
                  colors={colors}
                />
              )}
              onEndReached={() => { if (activeItem && hasMoreComments && !commentLoadingMore) loadPostComments(activeItem, { append: true }); }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                commentLoadingMore ? (
                  <View style={styles.commentsEmpty}>
                    <ActivityIndicator size="small" color={colors.muted} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.commentsEmpty}>
                  {commentFetching
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={[styles.commentsEmptyText, { color: colors.muted }]}>{t('feed.noComments')}</Text>}
                </View>
              }
            />

            <View style={[styles.commentInputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.commentInputAvatar, { backgroundColor: themeColor(currentUserColor) }]}>
                {currentUserAvatarUrl
                  ? <Image source={{ uri: currentUserAvatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <Text style={styles.commentAvatarText}>{currentUsername.charAt(0).toUpperCase()}</Text>}
              </View>
              <TextInput
                ref={commentInputRef}
                style={[styles.commentInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={commentInput}
                onChangeText={setCommentInput}
                placeholder={commentSpoiler ? 'Add spoiler comment...' : 'Add comment...'}
                placeholderTextColor={colors.muted}
                multiline
                maxLength={300}
              
                accessibilityLabel={commentSpoiler ? t('a11y.spoilerCommentInput') : t('a11y.commentInput')}/>
              <TouchableOpacity hitSlop={HIT_SLOP}
                style={[
                  styles.commentSpoilerBtn,
                  { backgroundColor: colors.inputBg },
                  commentSpoiler && styles.commentSpoilerBtnActive,
                ]}
                onPress={() => setCommentSpoiler((v) => !v)}
                accessibilityLabel="Mark comment as spoiler"
                accessibilityState={{ selected: commentSpoiler }}>
                <Ionicons name={commentSpoiler ? 'eye-off' : 'eye-off-outline'} size={16} color={commentSpoiler ? '#FF3B30' : colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={HIT_SLOP}
                style={[styles.commentSendBtn, { opacity: commentInput.trim() ? 1 : 0.35 }]}
                onPress={handleSendComment}
                disabled={!commentInput.trim()} accessibilityRole="button" accessibilityLabel={t('a11y.sendComment')}>
                <Ionicons name="send" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Combined Share bottom sheet */}
      <Modal visible={shareSheetOpen} animationType="slide" transparent onRequestClose={() => setShareSheetOpen(false)}>
        <TouchableOpacity style={feedSendStyles.overlay} activeOpacity={1} onPress={() => setShareSheetOpen(false)}>
          <View style={[feedShareStyles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[feedSendStyles.handle, { backgroundColor: colors.border }]} />

            {/* Header: search · title · close — Snapchat-style "Send to" bar */}
            <View style={feedSendStyles.headerRow}>
              <TouchableOpacity hitSlop={HIT_SLOP}
                style={feedSendStyles.headerIconBtn}
                onPress={() => setFriendSearchOpen((o) => !o)}
                activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.searchFriends')}>
                <Ionicons name="search" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={[feedSendStyles.headerTitle, { color: colors.text }]}>{t('feed.sendTo')}</Text>
              <TouchableOpacity hitSlop={HIT_SLOP}
                style={feedSendStyles.headerIconBtn}
                onPress={() => setShareSheetOpen(false)}
                activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {activeItem ? (
              <Text style={[feedSendStyles.mangaName, { color: colors.muted }]} numberOfLines={1}>{activeItem.title}</Text>
            ) : null}
            {friendSearchOpen ? (
              <View style={[feedSendStyles.searchBox, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="search" size={14} color={colors.muted} />
                <TextInput
                  style={[feedSendStyles.searchInput, { color: colors.text }]}
                  placeholder={t('placeholder.searchFriends')}
                  placeholderTextColor={colors.muted}
                  value={friendSearchQuery}
                  onChangeText={setFriendSearchQuery}
                  autoFocus
                
                  accessibilityLabel={t('placeholder.searchFriends')}/>
              </View>
            ) : null}

            {/* Friends row — tap an avatar to send directly, like a Snap send */}
            {sendFriends.length === 0 ? (
              <View style={feedSendStyles.noFriends}>
                <Ionicons name="people-outline" size={28} color={colors.muted} />
                <Text style={[feedSendStyles.noFriendsText, { color: colors.muted }]}>
                  {t('feed.addFriendsFirst')}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={feedSendStyles.friendsRow}>
                {sendFriends
                  .filter((f) => f.name.toLowerCase().includes(friendSearchQuery.trim().toLowerCase()))
                  .map((friend) => {
                    const status = sendSentTo[friend.id];
                    const accent = profileAccent(friend.color);
                    return (
                      <TouchableOpacity
                        key={friend.id}
                        style={feedSendStyles.friendItem}
                        onPress={() => !status && handleSendRecommendation(friend)}
                        disabled={!!status}
                        activeOpacity={0.75}>
                        <View style={[feedSendStyles.avatarCircle, { backgroundColor: accent }]}>
                          {friend.avatarUrl
                            ? <Image source={{ uri: friend.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            : <Text style={feedSendStyles.avatarText}>{(friend.name || '?').charAt(0).toUpperCase()}</Text>}
                          {(status === 'sending' || status === 'sent') && (
                            <View style={[StyleSheet.absoluteFill, feedSendStyles.avatarStatusOverlay]}>
                              {status === 'sending'
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="checkmark-circle" size={22} color="#1D9E75" />}
                            </View>
                          )}
                        </View>
                        <Text style={[feedSendStyles.friendNameSmall, { color: colors.text }]} numberOfLines={1}>{friend.name}</Text>
                        {friend.streak > 0 ? (
                          <View style={feedSendStyles.streakRow}>
                            <Ionicons name="flame" size={10} color={friend.streak >= 30 ? '#FF5C7A' : '#EF9F27'} />
                            <Text style={feedSendStyles.streakText}>{friend.streak}</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            )}

            <View style={[feedShareStyles.divider, { backgroundColor: colors.border }]} />
            <Text style={[feedShareStyles.sectionTitle, { color: colors.muted }]}>{t('feed.shareTo')}</Text>

            {/* External destinations — individual deep links where we can hand off
                a pre-filled message, plus a catch-all "More" to the real OS share
                sheet for everything else installed */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={feedSendStyles.destRow}>
              <TouchableOpacity
                style={feedSendStyles.destItem}
                onPress={() => { setShareSheetOpen(false); setCardShareOpen(true); }}
                activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="albums-outline" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>{t('feed.card')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={feedSendStyles.destItem} onPress={handleCopyLink} activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#4A90D9' }]}>
                  <Ionicons name={linkCopied ? 'checkmark' : 'link'} size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>{linkCopied ? 'Copied!' : 'Copy Link'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={feedSendStyles.destItem} onPress={shareViaWhatsApp} activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#25D366' }]}>
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={feedSendStyles.destItem} onPress={shareViaFacebook} activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#1877F2' }]}>
                  <Ionicons name="logo-facebook" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[feedSendStyles.destItem, !destAvailable.sms && feedSendStyles.destItemDisabled]}
                onPress={shareViaSMS}
                disabled={!destAvailable.sms}
                activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#3AC1E8' }]}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[feedSendStyles.destItem, !destAvailable.email && feedSendStyles.destItemDisabled]}
                onPress={shareViaEmail}
                disabled={!destAvailable.email}
                activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#5C8DE8' }]}>
                  <Ionicons name="mail" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>{t('feed.destEmail')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={feedSendStyles.destItem} onPress={handleNativeShare} activeOpacity={0.75}>
                <View style={[feedSendStyles.destIcon, { backgroundColor: '#3A3A42' }]}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                </View>
                <Text style={[feedSendStyles.destLabel, { color: colors.muted }]}>{t('feed.more')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share-as-card sub-modal */}
      <ShareCard
        open={cardShareOpen}
        onClose={() => setCardShareOpen(false)}
        series={activeItem}
        chapter={shareChapter}
        progress={shareProgress}
      />

      {/* Notification panel (slides from top) */}
      <Modal visible={notifOpen} transparent animationType="none" onRequestClose={closeNotif}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)', opacity: notifFade }]}
        />
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { top: metrics.notifH }]}
          activeOpacity={1}
          onPress={closeNotif}
         accessibilityElementsHidden importantForAccessibility="no"/>
        <Animated.View style={[styles.notifPanel, { height: metrics.notifH, transform: [{ translateY: notifY }] }]}>
          <View style={[styles.notifInner, { paddingTop: insets.top + 14 }]}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifHeaderTitle}>{t('notifications.title')}</Text>
              <TouchableOpacity hitSlop={HIT_SLOP} style={styles.notifCloseBtn} onPress={closeNotif} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={16} color="#9B9AA3" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={notifications}
              keyExtractor={(n) => n.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
              renderItem={({ item: n }) => (
                <View style={[styles.notifRow, !n.read && styles.notifRowUnread]}>
                  <View style={styles.notifAvatarWrap}>
                    <View style={styles.notifAvatar}>
                      <Text style={styles.notifAvatarTxt}>{n.avatar}</Text>
                    </View>
                    <View style={[styles.notifTypeBadge, { backgroundColor: notifIconBg(n.type) }]}>
                      <Ionicons name={notifIconName(n.type)} size={8} color={notifIconColor(n.type, colors)} />
                    </View>
                  </View>
                  <View style={styles.notifContent}>
                    <Text style={styles.notifTxt} numberOfLines={3}>
                      <Text style={styles.notifUser}>{n.user}</Text>
                      <Text style={styles.notifAction}> {n.text}</Text>
                    </Text>
                    {n.seriesTitle && (
                      <TouchableOpacity
                        style={styles.notifMeta}
                        activeOpacity={0.75}
                        onPress={() => {
                          closeNotif();
                          navigation.navigate('Reader', {
                            searchQuery: n.seriesTitle,
                            title: n.seriesTitle,
                            chapters: 999,
                          });
                        }}>
                        <View style={styles.notifMetaCover}>
                          <Ionicons name="play" size={10} color="rgba(255,255,255,0.7)" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.notifMetaTitle}>{n.seriesTitle}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.35)" />
                      </TouchableOpacity>
                    )}
                    <Text style={styles.notifTime}>{n.time}</Text>
                    {n.type === 'friend_request' && !n.read && n.friendshipId && (
                      <TouchableOpacity
                        style={styles.notifAcceptBtn}
                        onPress={() => acceptFriendRequest(n.friendshipId)}>
                        <Text style={styles.notifAcceptBtnText}>{t('messages.accept')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {!n.read && <View style={styles.unreadDot} />}
                </View>
              )}
            />

            <View style={styles.notifFooter}>
              <TouchableOpacity onPress={() => { closeNotif(); navigation.navigate('Notifications'); }}>
                <Text style={styles.notifViewAll}>{t('feed.viewOlder')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.notifClearBtn} onPress={handleClearAllNotif}>
                <Ionicons name="checkmark-done-outline" size={13} color={colors.primary} />
                <Text style={styles.notifClearBtnText}>{t('notifications.clearAll')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Modal>

      {/* Search modal */}
      <Modal visible={searchOpen} animationType="fade" transparent onRequestClose={() => setSearchOpen(false)}>
        <TouchableOpacity style={styles.searchOverlay} activeOpacity={1} onPress={() => setSearchOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.searchPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.searchRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={16} color={colors.muted} />
              <TextInput
                value={siteInput}
                onChangeText={setSiteInput}
                onSubmitEditing={handleGo}
                placeholder={t('placeholder.enterUrl')}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchField, { color: colors.text }]}
              
                accessibilityLabel={t('placeholder.enterUrl')}/>
              {siteInput ? (
                <TouchableOpacity onPress={handleGo} style={styles.searchGoBtn}>
                  <Text style={styles.searchGoBtnText}>Go</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={[styles.searchLabel, { color: colors.muted }]}>{t('feed.recommendedSites')}</Text>
            <View style={styles.bookmarksGrid}>
              {BOOKMARKS.map((b) => (
                <TouchableOpacity
                  key={b.name}
                  style={[styles.bookmarkCard, { backgroundColor: colors.inputBg }]}
                  onPress={() => { setSearchOpen(false); navigation.navigate('Reader', { url: b.url, title: b.name }); }}>
                  <Image source={{ uri: getFaviconUrl(b.url) }} style={styles.bookmarkFavicon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bookmarkName, { color: colors.text }]}>{b.name}</Text>
                    <Text style={[styles.bookmarkDesc, { color: colors.muted }]} numberOfLines={1}>{b.desc}</Text>
                  </View>
                  <Ionicons name="open-outline" size={11} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },

  // Header
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  logo: { color: '#7858FF', fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  headerRight: { flexDirection: 'row' },
  headerBtn: { position: 'relative', marginLeft: 16 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3B30', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // Feed card
  burstWrap: { alignItems: 'center', justifyContent: 'center' },
  card: { position: 'relative' },
  cardBgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  cardBgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,3,14,0.72)' },
  cardLayout: {
    flex: 1,
    paddingTop: 70,
    // paddingBottom is applied inline from useBottomTabBarHeight()
    paddingLeft: 18,
    paddingRight: 74,
  },
  coverSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(160,156,224,0.65)',
    shadowColor: '#7858FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 22,
    elevation: 18,
  },
  coverImg: { borderRadius: 18 },
  coverFallback: { borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  nsfwGateOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)', gap: 4 },
  nsfwGateText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  coverFallbackText: { fontSize: 72, fontWeight: '800', color: 'rgba(255,255,255,0.25)' },
  feedComingSoonOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', paddingVertical: 10, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  feedComingSoonChip: { backgroundColor: 'rgba(120, 88, 255,0.5)', borderWidth: 1, borderColor: 'rgba(160,156,224,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4 },
  feedComingSoonLabel: { color: '#A09CE0', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  feedComingSoonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sideActions: { position: 'absolute', right: 14, bottom: 110, alignItems: 'center', justifyContent: 'space-between', height: 220 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', width: 44 },
  actionCount: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardInfo: { paddingTop: 14, width: '100%', alignSelf: 'center' },
  sectionBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 8, borderWidth: 1, gap: 5 },
  sectionBadgeHot:      { backgroundColor: 'rgba(255, 86, 24, 0.27)', borderColor: 'rgba(255, 81, 1, 0.57)' },
  sectionBadgeTrending: { backgroundColor: 'rgba(46, 31, 212, 0.49)',  borderColor: 'rgba(10, 0, 104, 0.81)' },
  sectionBadgePopular:  { backgroundColor: 'rgba(255, 217, 0, 0.25)',  borderColor: 'rgba(255, 217, 0, 0.55)' },
  sectionBadgeCreator:  { backgroundColor: 'rgba(120, 88, 255,0.22)',  borderColor: 'rgba(160,156,224,0.45)' },
  sectionBadgeIcon: { fontSize: 11 },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  genres: { flexDirection: 'row', marginBottom: 8, flexWrap: 'wrap' },
  genreTag: {
    backgroundColor: 'rgba(120, 88, 255,0.42)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(160,156,224,0.45)',
    marginRight: 7,
    marginBottom: 5,
  },
  genreText: { color: '#D0CEFF', fontSize: 11, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6, lineHeight: 30, letterSpacing: -0.4 },
  description: { color: 'rgba(210,208,242,0.88)', fontSize: 13, lineHeight: 20, marginBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' },
  metaText: { color: 'rgba(255,255,255,0.58)', fontSize: 12, marginLeft: 4 },
  author: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontStyle: 'italic' },

  // Save toast
  loadingMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D12' },
  loadingMoreDot: { color: '#7858FF', fontSize: 32, letterSpacing: 8 },
  saveToast: { position: 'absolute', bottom: 100, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30,28,50,0.92)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(160,156,224,0.35)' },
  saveToastText: { color: '#A09CE0', fontSize: 13, fontWeight: '600', marginLeft: 7, paddingRight: 2 },

  // Comments sheet (TikTok style)
  commentsWrap: { flex: 1, justifyContent: 'flex-end' },
  commentsSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  commentsTitle: { fontSize: 16, fontWeight: '700' },
  commentsCloseBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  commentsList: { flex: 1 },
  commentsEmpty: { paddingVertical: 56, alignItems: 'center' },
  commentsEmptyText: { fontSize: 13 },

  // Comment row (TikTok layout)
  commentRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'flex-start' },
  commentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(120, 88, 255,0.45)', alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0, overflow: 'hidden' },
  commentAvatarText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  commentContent: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 5 },
  commentUser: { fontSize: 13, fontWeight: '700' },
  commentTime: { fontSize: 11 },
  spoilerBadge: { backgroundColor: 'rgba(255,59,48,0.16)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  spoilerBadgeText: { color: '#FF3B30', fontSize: 9, fontWeight: 'bold' },
  spoilerReveal: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start', marginBottom: 4 },
  spoilerRevealText: { fontSize: 12 },
  commentText: { fontSize: 14, lineHeight: 21 },
  commentFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 },
  replyBtn: {},
  replyBtnText: { fontSize: 12, fontWeight: '600' },
  repliesBtnText: { color: '#7858FF', fontSize: 12, fontWeight: '600' },
  commentLikeCol: { paddingTop: 2, paddingLeft: 8, alignItems: 'center', flexShrink: 0 },
  commentLikeBtn: { alignItems: 'center' },
  commentLikeCount: { fontSize: 11, fontWeight: '600', marginTop: 3 },

  // Reply thread
  replyThread: { marginTop: 8, paddingLeft: 4 },
  replyItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  replyAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(120, 88, 255,0.3)', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0, overflow: 'hidden' },
  replyAvatarText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  replyName: { fontSize: 12, fontWeight: '700' },
  replyTime: { fontSize: 10 },
  replyText: { fontSize: 13, lineHeight: 18 },

  // Comment input
  commentInputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderTopWidth: 1 },
  commentInputAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(120, 88, 255,0.45)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  commentInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 80 },
  commentSpoilerBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentSpoilerBtnActive: { backgroundColor: 'rgba(255,59,48,0.16)' },
  commentSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#7858FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Notification panel
  notifPanel: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden' },
  notifInner: { flex: 1, backgroundColor: 'rgba(14,14,20,0.97)' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
  notifHeaderTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: 'bold' },
  notifCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(155,154,163,0.16)', alignItems: 'center', justifyContent: 'center' },
  notifViewAll: { color: '#9B9AA3', fontSize: 12, fontWeight: '500' },
  notifFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  notifClearBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(120, 88, 255,0.14)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(120, 88, 255,0.35)' },
  notifClearBtnText: { color: '#A09CE0', fontSize: 12, fontWeight: '600' },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 13, marginHorizontal: 8, borderRadius: 12, marginBottom: 2 },
  notifRowUnread: { backgroundColor: 'rgba(120, 88, 255,0.08)' },
  notifAvatarWrap: { position: 'relative', marginRight: 12, flexShrink: 0 },
  notifAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(120, 88, 255,0.55)', alignItems: 'center', justifyContent: 'center' },
  notifAvatarTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  notifTypeBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTxt: { lineHeight: 18 },
  notifUser: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  notifAction: { color: '#9B9AA3', fontSize: 13 },
  notifMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 7, padding: 9, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)' },
  notifMetaCover: { width: 28, height: 36, borderRadius: 5, marginRight: 9, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(120, 88, 255,0.3)' },
  notifMetaTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  notifMetaGenre: { color: '#9B9AA3', fontSize: 10, marginTop: 2 },
  notifTime: { color: '#9B9AA3', fontSize: 10, marginTop: 5 },
  notifAcceptBtn: { alignSelf: 'flex-start', marginTop: 7, backgroundColor: 'rgba(120, 88, 255,0.2)', borderWidth: 1, borderColor: 'rgba(120, 88, 255,0.45)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  notifAcceptBtnText: { color: '#A09CE0', fontSize: 11, fontWeight: '600' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7858FF', marginTop: 5, flexShrink: 0 },

  // Search
  searchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' },
  searchPanel: { marginTop: 90, marginHorizontal: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  searchField: { flex: 1, fontSize: 13, marginLeft: 8 },
  searchGoBtn: { backgroundColor: '#7858FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginLeft: 6 },
  searchGoBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  searchLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  bookmarksGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  bookmarkCard: { width: '48%', flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 10 },
  bookmarkFavicon: { width: 28, height: 28, borderRadius: 6, marginRight: 8, backgroundColor: '#2A2A2F' },
  bookmarkName: { fontSize: 12, fontWeight: '600' },
  bookmarkDesc: { fontSize: 10, marginTop: 1 },
});

const feedShareStyles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, maxHeight: '72%' },
  divider: { height: 1, marginHorizontal: 20, marginVertical: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, marginBottom: 10 },
});

const feedSendStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, maxHeight: '72%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headerIconBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  mangaName: { fontSize: 13, textAlign: 'center', marginTop: 2, marginBottom: 12, paddingHorizontal: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  noFriends: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 },
  noFriendsText: { fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 18 },
  friendsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 14 },
  friendItem: { alignItems: 'center', width: 66 },
  avatarCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  avatarStatusOverlay: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderRadius: 29 },
  friendNameSmall: { fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  streakText: { fontSize: 10, fontWeight: '700', color: '#EF9F27' },
  destRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 16 },
  destItem: { alignItems: 'center', width: 60 },
  destItemDisabled: { opacity: 0.35 },
  destIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  destLabel: { fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
});
