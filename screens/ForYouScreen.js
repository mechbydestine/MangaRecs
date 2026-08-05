import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl, Animated, PanResponder,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { MangaCover, AI_REC_KEY, prewarmCoverCache, NSFW_KEY } from '../utils/mangaCovers';
import AgeGateModal, { AGE_VERIFIED_KEY } from '../components/AgeGateModal';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers';
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '../utils/ProfileContext';
import { supabase } from '../supabase';
import { syncLibraryWrite } from '../utils/readerUtils';
import { showAppToast } from '../utils/appToast';
import { MANGA_POOL } from '../utils/mangaPool';
import { augmentPoolFromApi } from './FeedScreen';
import { GENRES } from '../utils/genres';
import { useResponsive } from '../utils/responsive';

// Icon map for all genre labels used in the radar and mood pickers
const MOOD_ICON_MAP = {};
// populated after MOODS is defined below

const DEFAULT_RADAR_GENRES = ['Action', 'Fantasy', 'Romance', 'Horror', 'Sci-Fi', 'Comedy', 'Thriller', 'Adventure'];
const TASTE_PROFILE = DEFAULT_RADAR_GENRES.map((genre) => ({ genre, value: 0 }));

// Mood chips = the canonical genre list (same labels + icons everywhere),
// plus the age-gated Adult chip which is a feed filter, not a real genre.
const MOODS = [
  ...GENRES.map((g) => ({ icon: g.icon, iconActive: g.iconActive, label: g.label })),
  { icon: 'flame-outline', iconActive: 'flame', label: 'Adult' },
];

// Populate icon map once MOODS is defined
MOODS.forEach((m) => { MOOD_ICON_MAP[m.label] = m.icon; });
// Genres that appear in series data but aren't chips of their own — radar axes
// built from reading history still deserve an accurate icon, not the book fallback
Object.assign(MOOD_ICON_MAP, {
  'Dark Fantasy':  'moon-outline',
  'Supernatural':  'thunderstorm-outline',
  'Historical':    'library-outline',
  'Regression':    'refresh-circle-outline',
  'Reincarnation': 'refresh-circle-outline',
});

// Moods that don't map to a single genre tag — matched against several tags
// plus description keywords instead of a plain genres-contains query.
const MOOD_OR_FILTER = {
  'Murim': 'genres.ov.{Murim,"Martial Arts"},description.ilike.%murim%',
  'Regression/Reincarnation': 'genres.ov.{Regression,Reincarnation},description.ilike.%regress%,description.ilike.%reincarnat%',
};


// ── Radar chart ────────────────────────────────────────────────────────────

const RADAR_SVG = 250;
const RADAR_CENTER = RADAR_SVG / 2;
const RADAR_MAX_R = 82;
const RADAR_ICON_R = 106;
const RADAR_ICON_SIZE = 20;

function RadarChart({ tasteProfile, onGenreTap }) {
  const { colors } = useTheme();
  const t = useT();
  const n = tasteProfile.length;
  const angleStep = (Math.PI * 2) / n;
  const levels = 4;

  function getPoint(index, value, radius = RADAR_MAX_R) {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return { x: RADAR_CENTER + r * Math.cos(angle), y: RADAR_CENTER + r * Math.sin(angle) };
  }

  function getIconCenter(index) {
    const angle = angleStep * index - Math.PI / 2;
    return {
      x: RADAR_CENTER + RADAR_ICON_R * Math.cos(angle),
      y: RADAR_CENTER + RADAR_ICON_R * Math.sin(angle),
    };
  }

  const dataPoints = tasteProfile.map((t, i) => getPoint(i, t.value));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const gridLevels = Array.from({ length: levels }, (_, i) => {
    const r = (RADAR_MAX_R / levels) * (i + 1);
    return tasteProfile.map((_, idx) => getPoint(idx, 100, r)).map((p) => `${p.x},${p.y}`).join(' ');
  });

  return (
    <View style={{ width: RADAR_SVG, height: RADAR_SVG, position: 'relative' }}>
      <Svg width={RADAR_SVG} height={RADAR_SVG} viewBox={`0 0 ${RADAR_SVG} ${RADAR_SVG}`}>
        {gridLevels.map((points, i) => (
          <Polygon key={i} points={points} fill="none" stroke={colors.border} strokeWidth={1} />
        ))}
        {tasteProfile.map((_, i) => {
          const outer = getPoint(i, 100);
          return <Line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={outer.x} y2={outer.y} stroke={colors.border} strokeWidth={1} />;
        })}
        <Polygon points={polygonPoints} fill={colors.primary} fillOpacity={0.25} stroke={colors.primary} strokeWidth={2} />
        {/* Dotted endpoints where the web meets its outer ring — the data
            polygon itself stays clean, no vertex dots */}
        {tasteProfile.map((_, i) => {
          const outer = getPoint(i, 100);
          return <Circle key={`end-${i}`} cx={outer.x} cy={outer.y} r={1.6} fill={colors.muted} fillOpacity={0.7} />;
        })}
      </Svg>

      {tasteProfile.map((t, i) => {
        const { x, y } = getIconCenter(i);
        const iconName = MOOD_ICON_MAP[t.genre] || 'book-outline';
        const active = t.value > 0;
        return (
          <TouchableOpacity
            key={t.genre}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              position: 'absolute',
              left: x - RADAR_ICON_SIZE / 2,
              top: y - RADAR_ICON_SIZE / 2,
              width: RADAR_ICON_SIZE,
              height: RADAR_ICON_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => onGenreTap(t.genre)}
            accessibilityRole="button"
            accessibilityLabel={t.genre}
            accessibilityState={{ selected: active }}>
            <Ionicons name={iconName} size={RADAR_ICON_SIZE} color={active ? colors.primary : colors.muted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Radar card — replays on focusKey change ────────────────────────────────

function RadarCard({ colors, focusKey, tasteProfile }) {
  const t = useT();
  const scale   = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [selectedGenre, setSelectedGenre] = useState(null);

  useEffect(() => {
    scale.setValue(0.72);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 13,
        stiffness: 130,
        mass: 0.8,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [focusKey]);

  function handleGenreTap(genre) {
    setSelectedGenre((prev) => (prev === genre ? null : genre));
  }

  return (
    <Animated.View style={[styles.tasteCard, { opacity, transform: [{ scale }] }]}>
      <View style={styles.tasteTitleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tasteTitle, { color: colors.text }]}>{t('forYou.yourTaste')}</Text>
        </View>
        {selectedGenre && (
          <View style={[styles.genrePill, { flexShrink: 0 }]}>
            <Ionicons name={MOOD_ICON_MAP[selectedGenre] || 'book-outline'} size={13} color={colors.primary} />
            <Text style={styles.genrePillText} numberOfLines={1}>{selectedGenre}</Text>
          </View>
        )}
      </View>
      <View style={styles.radarWrap}>
        <RadarChart tasteProfile={tasteProfile} onGenreTap={handleGenreTap} />
      </View>
    </Animated.View>
  );
}

// ── Section title — replays on focusKey change ─────────────────────────────

function SectionTitle({ children, colors, delay, focusKey }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateX.setValue(-10);
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 320, delay: delay ?? 0, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 320, delay: delay ?? 0, useNativeDriver: true }),
    ]).start();
  }, [focusKey]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{children}</Text>
    </Animated.View>
  );
}

// ── Mood button with spring press ──────────────────────────────────────────

function MoodButton({ mood, active, onPress }) {
  const { colors } = useTheme();
  const t = useT();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 22, bounciness: 8 }),
    ]).start();
    onPress();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.moodBtn,
          { backgroundColor: colors.card, borderColor: colors.border },
          active && styles.moodBtnActive,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={mood.label}
        accessibilityState={{ selected: active }}>
        <Ionicons name={active ? (mood.iconActive || mood.icon) : mood.icon} size={15} color={active ? '#A09CE0' : colors.muted} style={{ marginRight: 6 }} />
        <Text style={[styles.moodLabel, { color: colors.muted }, active && styles.moodLabelActive]}>
          {mood.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Rec card — stagger entrance, replays on animKey change ─────────────────

// Gmail-style swipeable row: slide right to save to Library, slide left to
// remove ("not interested"). Tap still opens the reader.
function RecCard({ series, reason, onDismiss, onSave, index, animKey }) {
  const { colors } = useTheme();
  const t = useT();
  const { width: screenW } = useResponsive();
  const navigation = useNavigation();

  function openDetail() {
    navigation.navigate('MangaDetail', {
      title: series.title,
      searchKey: series.searchKey,
      lang: series.lang,
      color: series.color,
      mangaId: series.fromApi ? series.id : undefined,
      chapters: series.chapters,
    });
  }
  const anim  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  // PanResponder is created once — route callbacks through refs so it always
  // sees the latest props (they close over userId etc. from each render)
  const onDismissRef = useRef(onDismiss); onDismissRef.current = onDismiss;
  const onSaveRef    = useRef(onSave);    onSaveRef.current    = onSave;

  useEffect(() => {
    anim.setValue(0);
    translateX.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      delay: Math.min(index, 7) * 55,
      useNativeDriver: true,
    }).start();
  }, [animKey]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        const threshold = screenW * 0.28;
        if (g.dx < -threshold && onDismissRef.current) {
          // Swipe left — slide the row out, then remove it
          Animated.timing(translateX, { toValue: -screenW, duration: 180, useNativeDriver: true }).start(() => {
            onDismissRef.current?.();
          });
        } else if (g.dx > threshold && onSaveRef.current) {
          // Swipe right — bookmark, then spring back into place
          onSaveRef.current?.();
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
      },
    })
  ).current;

  function handlePress() {
    if (series.comingSoon) {
      showAppToast(`${series.title} hasn't been released yet — check back soon`, 'info');
      return;
    }
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    // Every tap on a rec — cover, title, whole card — opens the detail
    // screen first, same as everywhere else; reading directly from here
    // skipped it entirely.
    openDetail();
  }

  const opacity    = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const saveOpacity   = translateX.interpolate({ inputRange: [0, 56],  outputRange: [0, 1], extrapolate: 'clamp' });
  const removeOpacity = translateX.interpolate({ inputRange: [-56, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }], marginBottom: 8 }}>
      {/* Swipe action underlays */}
      <Animated.View style={[styles.swipeUnder, styles.swipeUnderSave, { opacity: saveOpacity }]}>
        <Ionicons name="bookmark" size={18} color="#fff" />
        <Text style={styles.swipeUnderText}>{t('common.save')}</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeUnder, styles.swipeUnderRemove, { opacity: removeOpacity }]}>
        <Text style={styles.swipeUnderText}>{t('common.remove')}</Text>
        <Ionicons name="trash" size={18} color="#fff" />
      </Animated.View>

      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }, { scale }] }}>
        <TouchableOpacity
          style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 0 }]}
          onPress={handlePress}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={series.title}
          accessibilityHint={t('forYou.openSeriesHint')}>
          <MangaCover title={series.title} searchKey={series.searchKey} lang={series.lang} color={series.color} contentRating={series.contentRating} nsfw={series.nsfw} style={styles.recCover}>
            <View style={styles.coverLetterWrap}>
              <Text style={styles.coverLetterText}>{(series.title || '?').charAt(0).toUpperCase()}</Text>
            </View>
            {series.comingSoon && (
              <View style={styles.comingSoonOverlay}>
                <Text style={styles.comingSoonLabel}>{t('forYou.unreleased')}</Text>
                <Text style={styles.comingSoonText}>{t('forYou.comingSoon')}</Text>
              </View>
            )}
          </MangaCover>
          <View style={styles.recInfo}>
            {reason && <Text style={styles.recReason}>{reason}</Text>}
            <Text style={[styles.recTitle, { color: colors.text }]} numberOfLines={1}>{series.title}</Text>
            <Text style={[styles.recDesc, { color: colors.muted }]} numberOfLines={1}>{series.description}</Text>
            <View style={styles.recMeta}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={[styles.recMetaText, { color: colors.muted }]}>{series.rating}</Text>
              <Text style={[styles.recMetaText, { color: colors.muted }]}>{series.chapters} ch</Text>
              <Text style={[styles.recMetaText, { color: colors.muted }]}>{series.readers}</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.muted} />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ── Hot card ───────────────────────────────────────────────────────────────

const HotCard = memo(function HotCard({ series, onPress }) {
  const { colors } = useTheme();
  const t = useT();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    if (series.comingSoon) {
      showAppToast(`${series.title} hasn't been released yet — check back soon`, 'info');
      return;
    }
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onPress();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.hotCard}
        accessibilityRole="button"
        accessibilityLabel={series.title}>
        <MangaCover title={series.title} searchKey={series.searchKey} lang={series.lang} color={series.color} contentRating={series.contentRating} nsfw={series.nsfw} style={styles.hotCover}>
          <View style={styles.hotLetterWrap}>
            <Text style={styles.hotLetterText}>{(series.title || '?').charAt(0).toUpperCase()}</Text>
          </View>
          {series.comingSoon && (
            <View style={styles.comingSoonOverlay}>
              <Text style={styles.comingSoonLabel}>{t('forYou.unreleased')}</Text>
              <Text style={styles.comingSoonText}>{t('forYou.comingSoon')}</Text>
            </View>
          )}
        </MangaCover>
        <Text style={[styles.hotTitle, { color: colors.text }]} numberOfLines={2}>{series.title}</Text>
        <Text style={styles.hotReaders}>🔥 {series.readers}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Screen ─────────────────────────────────────────────────────────────────

function buildTasteProfile(weights) {
  // Pick top genres user has engaged with, fill to 8 from MOODS defaults
  const weighted = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([g]) => g);
  const filled = [...weighted];
  for (const m of MOODS) {
    if (filled.length >= 8) break;
    // Long combined labels (e.g. Regression/Reincarnation) don't fit radar axes
    if (m.label.length > 12) continue;
    if (!filled.includes(m.label)) filled.push(m.label);
  }
  const genres = filled.length >= 3 ? filled : DEFAULT_RADAR_GENRES;
  return genres.map((genre) => ({
    genre,
    value: Math.min(95, Math.round(Math.sqrt(weights[genre] || 0) * 4)),
  }));
}

function parseReaders(str) {
  const n = parseFloat(str || '0');
  if ((str || '').includes('M')) return n * 1_000_000;
  if ((str || '').includes('K')) return n * 1_000;
  return n;
}

// Interleaves items 4:1 (non-ja : ja) for the default display ratio.
function applyContentRatio(items) {
  const nonJa = items.filter((s) => s.lang !== 'ja');
  const ja    = items.filter((s) => s.lang === 'ja');
  const result = [];
  let ni = 0, ji = 0;
  while (ni < nonJa.length || ji < ja.length) {
    for (let i = 0; i < 4 && ni < nonJa.length; i++) result.push(nonJa[ni++]);
    if (ji < ja.length) result.push(ja[ji++]);
  }
  return result;
}

export default function ForYouScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isTablet: IS_TABLET } = useResponsive();
  const DISMISSED_KEY = '@mangarecs_dismissed_recs';
  const [activeMood, setActiveMood] = useState(null);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);

  // Restore dismissed recommendations so "not interested" sticks across sessions
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((raw) => {
      if (!raw) return;
      try { setDismissedIds(new Set(JSON.parse(raw))); } catch (_) {}
    }).catch(() => {});
  }, []);

  // Live MangaDex titles augment the shared MANGA_POOL — trigger this here
  // too, since ForYou may be opened before the Feed tab ever mounts.
  useEffect(() => { augmentPoolFromApi(); }, []);

  function dismissRec(series) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(series.id);
      // Cap so the list doesn't grow forever
      const arr = [...next].slice(-300);
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(arr)).catch(() => {});
      return new Set(arr);
    });
    // Negative taste signal — dismissals should teach the algorithm
    if (userId && series.genres?.length) {
      series.genres.forEach((genre) => {
        supabase.rpc('upsert_genre_weight', { p_user_id: userId, p_genre: genre, p_delta: -2 }).then(() => {});
      });
    }
  }

  // Swipe-right action: bookmark the rec into the Library (mirrors FeedScreen's
  // save flow) and give the algorithm a positive taste signal
  async function saveRec(series) {
    try {
      const raw = await AsyncStorage.getItem('@mangarecs_saved');
      const saved = raw ? JSON.parse(raw) : [];
      if (!saved.find((s) => s.id === series.id)) {
        saved.push({ ...series, bookmarked: true });
        await AsyncStorage.setItem('@mangarecs_saved', JSON.stringify(saved));
      }
    } catch (_) {}
    supabase.rpc('increment_manga_bookmarks', { p_manga_id: series.id, p_delta: 1 }).then(() => {});
    if (userId) {
      syncLibraryWrite(() => supabase.from('reading_progress').upsert({
        user_id: userId,
        series_title: series.title,
        status: 'bookmarked',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
      if (series.genres?.length) {
        series.genres.forEach((genre) => {
          supabase.rpc('upsert_genre_weight', { p_user_id: userId, p_genre: genre, p_delta: 2 }).then(() => {});
        });
      }
    }
    showAppToast(t('toast.savedToLibrary'), 'success');
  }
  const [focusKey, setFocusKey] = useState(0);
  const [genreWeights, setGenreWeights] = useState({});
  const [tasteProfile, setTasteProfile] = useState(TASTE_PROFILE);
  const [aiRecEnabled, setAiRecEnabled] = useState(true);
  const [allowNsfw, setAllowNsfw] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [creatorSeries, setCreatorSeries] = useState([]);
  const [supabaseRecs, setSupabaseRecs] = useState([]);
  const [becauseYouReadRecs, setBecauseYouReadRecs] = useState([]);
  const [becauseYouReadGenre, setBecauseYouReadGenre] = useState('');
  const { profile, updateProfile, userId } = useProfile();
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY       = useRef(new Animated.Value(-14)).current;

  // Prewarm in-memory cover cache from the static pre-baked URL map so
  // MangaCover's getCachedCoverUrl() returns a URL on the very first render.
  useEffect(() => {
    const idToItem = {};
    MANGA_POOL.forEach((m) => { idToItem[m.id] = m; });
    Object.entries(POOL_COVER_URLS).forEach(([id, url]) => {
      const item = idToItem[id];
      if (item && url) prewarmCoverCache(item.searchKey || item.title, item.lang, url);
    });
  }, []);

  function fetchBecauseYouRead(weights) {
    const topGenre = Object.entries(weights).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (!topGenre) return;
    setBecauseYouReadGenre(topGenre);
    supabase.from('manga_pool')
      .select('id, title, description, genres, rating, chapters, readers, author, cover_url, color, likes, comment_count, status, lang, search_key')
      .contains('genres', [topGenre])
      .eq('nsfw', false)
      .order('likes', { ascending: false, nullsFirst: false })
      .limit(10)
      .then(({ data }) => {
        if (!data?.length) return;
        setBecauseYouReadRecs(data.map((m) => ({
          ...m,
          searchKey: m.search_key,
          likeCount: m.likes || 0,
          commentCount: m.comment_count || 0,
          status: m.status === 'completed' ? 'Completed' : 'Ongoing',
        })));
      })
      .catch(() => {});
  }

  // Fetch Supabase manga when mood changes
  useEffect(() => {
    if (!activeMood) { setSupabaseRecs([]); return; }
    const isAdult = activeMood === 'Adult';
    // Don't fetch adult content if the feature isn't enabled
    if (isAdult && !(ageVerified && allowNsfw)) { setSupabaseRecs([]); return; }
    let q = supabase.from('manga_pool')
      .select('id, title, description, genres, rating, chapters, readers, author, cover_url, color, likes, comment_count, status, lang, search_key, nsfw')
      .order('likes', { ascending: false, nullsFirst: false })
      .limit(20);
    if (isAdult) {
      q = q.eq('nsfw', true);
    } else if (MOOD_OR_FILTER[activeMood]) {
      q = q.or(MOOD_OR_FILTER[activeMood]).eq('nsfw', false);
    } else {
      q = q.contains('genres', [activeMood]).eq('nsfw', false);
    }
    q.then(({ data }) => {
        if (!data?.length) { setSupabaseRecs([]); return; }
        setSupabaseRecs(data.map((m) => ({
          ...m,
          searchKey: m.search_key,
          likeCount: m.likes || 0,
          commentCount: m.comment_count || 0,
          status: m.status === 'completed' ? 'Completed' : 'Ongoing',
        })));
      })
      .catch(() => setSupabaseRecs([]));
  }, [activeMood, ageVerified, allowNsfw]);

  // Replay all animations and reload genre prefs every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
      headerOpacity.setValue(0);
      headerY.setValue(-14);
      Animated.parallel([
        Animated.timing(headerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(headerY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }),
      ]).start();

      AsyncStorage.multiGet([AI_REC_KEY, '@mangarecs_genre_prefs', AGE_VERIFIED_KEY, NSFW_KEY]).then(
        ([[, aiRaw], [, genreRaw], [, ageRaw], [, nsfwRaw]]) => {
          const aiOn = aiRaw === null ? true : aiRaw === 'true';
          setAiRecEnabled(aiOn);
          setAgeVerified(ageRaw === 'true');
          if (nsfwRaw !== null) setAllowNsfw(nsfwRaw === 'true');

          if (!aiOn) return;

          function applyWeights(weights) {
            setGenreWeights(weights);
            setTasteProfile(buildTasteProfile(weights));
          }

          // Apply local cache immediately to avoid blank state
          if (genreRaw) {
            try {
              const cached = JSON.parse(genreRaw);
              applyWeights(cached);
              fetchBecauseYouRead(cached);
            } catch (_) {}
          }

          // Always sync from Supabase user_genre_preferences (cross-device source of truth)
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session?.user?.id) return;
            supabase.from('user_genre_preferences')
              .select('genre, weight')
              .eq('user_id', session.user.id)
              .order('weight', { ascending: false })
              .then(({ data }) => {
                if (data?.length) {
                  const weights = {};
                  data.forEach(({ genre, weight }) => { weights[genre] = weight; });
                  applyWeights(weights);
                  AsyncStorage.setItem('@mangarecs_genre_prefs', JSON.stringify(weights)).catch(() => {});
                  fetchBecauseYouRead(weights);
                } else if (!genreRaw) {
                  // Final fallback: profiles.genre_weights (legacy path)
                  supabase.from('profiles').select('genre_weights').eq('id', session.user.id).maybeSingle()
                    .then(({ data: pd }) => {
                      const weights = pd?.genre_weights;
                      if (!weights || Object.keys(weights).length === 0) return;
                      applyWeights(weights);
                      AsyncStorage.setItem('@mangarecs_genre_prefs', JSON.stringify(weights)).catch(() => {});
                      fetchBecauseYouRead(weights);
                    });
                }
              });
          });
        }
      ).catch(() => {});

      // Community discovery: creator-uploaded series
      supabase.from('series')
        .select('id, title, description, genre, chapters, views')
        .order('views', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (!data?.length) return;
          setCreatorSeries(data.map((s) => ({
            id: s.id,
            creatorSeriesId: s.id,
            title: s.title,
            searchKey: s.title,
            description: s.description || '',
            genres: s.genre ? [s.genre] : [],
            lang: 'ja',
            chapters: s.chapters || 0,
            color: '#16213E',
            rating: 4.5,
            readers: s.views > 0 ? (s.views >= 1000 ? `${(s.views / 1000).toFixed(1)}K` : String(s.views)) : 'New',
          })));
        })
        .catch(() => {});
    }, [])
  );

  const fullPool = MANGA_POOL;

  const sortedRec = useMemo(() => {
    const hasWeights = aiRecEnabled && Object.keys(genreWeights).length > 0;

    function sortByWeights(arr) {
      if (!hasWeights) return arr;
      return [...arr].sort((a, b) => {
        const scoreA = (a.genres || []).reduce((sum, g) => sum + (genreWeights[g] || 0), 0);
        const scoreB = (b.genres || []).reduce((sum, g) => sum + (genreWeights[g] || 0), 0);
        return scoreB - scoreA;
      });
    }

    // "Adult" is not a genre — it's the nsfw flag, and the Supabase query
    // above filters on `nsfw` for exactly that reason. Matching it against
    // genre names (there is no genre called "Adult") meant this local path
    // always returned zero, so whenever the Supabase fetch came back short
    // the whole shelf fell through to general recommendations.
    if (activeMood === 'Adult') {
      return sortByWeights(fullPool.filter((s) => s.nsfw === true)).slice(0, 10);
    }
    if (activeMood) {
      const filtered = fullPool.filter((s) =>
        !s.nsfw && (s.genres || []).some((g) => g.toLowerCase().includes(activeMood.toLowerCase()))
      );
      return sortByWeights(filtered).slice(0, 10);
    }
    if (aiRecEnabled) {
      return sortByWeights(fullPool.filter((s) => !s.nsfw));
    }
    return fullPool.filter((s) => !s.nsfw);
  }, [activeMood, aiRecEnabled, genreWeights, fullPool]);

  const displayRecs = useMemo(() => {
    // Supabase real-time mood results take priority
    if (supabaseRecs.length > 0) return supabaseRecs;
    const hasPersonalHistory = aiRecEnabled && Object.keys(genreWeights).length > 0;
    // Never backfill the Adult shelf from the general pool — doing so
    // rendered ordinary all-ages titles under an "18+ picks for you"
    // heading. An honest empty state is the correct outcome here.
    if (activeMood === 'Adult') return sortedRec;
    const base = sortedRec.length > 0 ? sortedRec : fullPool.filter((s) => !s.nsfw).slice(0, 5);
    return hasPersonalHistory ? base : applyContentRatio(base);
  }, [aiRecEnabled, genreWeights, sortedRec, fullPool, supabaseRecs, activeMood]);

  // Hot Right Now — sorted by genre weight score, capped at 30, rotates hourly
  const hotRightNow = useMemo(() => {
    const hasWeights = aiRecEnabled && Object.keys(genreWeights).length > 0;
    const hourSeed = Math.floor(Date.now() / 3_600_000);
    const scored = fullPool.map((s) => {
      const weightScore = hasWeights
        ? (s.genres || []).reduce((sum, g) => sum + (genreWeights[g] || 0), 0)
        : 0;
      // small pseudo-random tie-breaker that shifts each hour for freshness
      const tieBreaker = ((s.id?.charCodeAt?.(0) || 0) + hourSeed * 7) % 100;
      return { ...s, _hotScore: weightScore * 1000 + tieBreaker };
    });
    return scored
      .filter((s) => !dismissedIds.has(s.id))
      .sort((a, b) => b._hotScore - a._hotScore)
      .slice(0, 30);
  }, [fullPool, aiRecEnabled, genreWeights, dismissedIds]);

  const recAnimKey = `${focusKey}-${activeMood || 'all'}`;

  const hasWeightsForReason = aiRecEnabled && Object.keys(genreWeights).length > 0;
  function buildReason(series) {
    if (hasWeightsForReason) {
      const topGenre = (series.genres || [])
        .filter((g) => genreWeights[g] > 0)
        .sort((a, b) => (genreWeights[b] || 0) - (genreWeights[a] || 0))[0];
      if (topGenre) return `Because you love ${topGenre}`;
    }
    return series.readers ? `${series.readers} readers` : undefined;
  }

  // Every card tap opens the detail screen first, same as everywhere else in
  // the app — HotCard used to jump straight into the reader instead.
  const openHotDetail = useCallback((series) => {
    if (series.comingSoon) return;
    const isMangaDexUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(series.id);
    navigation.navigate('MangaDetail', {
      title: series.title,
      searchKey: series.searchKey || series.title,
      lang: series.lang || 'ja',
      color: series.color,
      mangaId: series.mangaId || (isMangaDexUuid ? series.id : undefined),
      chapters: series.chapters,
    });
  }, [navigation]);

  function onRefresh() {
    setRefreshing(true);
    setFocusKey((k) => k + 1);
    setSupabaseRecs([]);

    AsyncStorage.multiGet([AI_REC_KEY, '@mangarecs_genre_prefs']).then(
      ([[, aiRaw], [, genreRaw]]) => {
        const aiOn = aiRaw === null ? true : aiRaw === 'true';
        setAiRecEnabled(aiOn);
        if (aiOn && genreRaw) {
          try {
            const weights = JSON.parse(genreRaw);
            setGenreWeights(weights);
            setTasteProfile(buildTasteProfile(weights));
            fetchBecauseYouRead(weights);
          } catch (_) {}
        }
        // Always sync from Supabase on pull-to-refresh
        if (aiOn) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session?.user?.id) return;
            supabase.from('user_genre_preferences')
              .select('genre, weight')
              .eq('user_id', session.user.id)
              .order('weight', { ascending: false })
              .then(({ data }) => {
                if (!data?.length) return;
                const weights = {};
                data.forEach(({ genre, weight }) => { weights[genre] = weight; });
                setGenreWeights(weights);
                setTasteProfile(buildTasteProfile(weights));
                AsyncStorage.setItem('@mangarecs_genre_prefs', JSON.stringify(weights)).catch(() => {});
                fetchBecauseYouRead(weights);
              });
          });
        }
      }
    ).catch(() => {});

    supabase.from('series')
      .select('id, title, description, genre, chapters, views')
      .order('views', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data?.length) {
          setCreatorSeries(data.map((s) => ({
            id: s.id,
            creatorSeriesId: s.id,
            title: s.title,
            searchKey: s.title,
            description: s.description || '',
            genres: s.genre ? [s.genre] : [],
            lang: 'ja',
            chapters: s.chapters || 0,
            color: '#16213E',
            rating: 4.5,
            readers: s.views > 0 ? (s.views >= 1000 ? `${(s.views / 1000).toFixed(1)}K` : String(s.views)) : 'New',
          })));
        }
        setRefreshing(false);
      })
      .catch(() => setRefreshing(false));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

        <View style={IS_TABLET ? styles.tabletWrap : null}>
        <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('forYou.title')}</Text>
        </Animated.View>
        <Animated.Text style={[styles.headerSub, { color: colors.muted, opacity: headerOpacity }]}>
          {t('forYou.subtitle')}
        </Animated.Text>

        {aiRecEnabled && Object.keys(genreWeights).length === 0 && (
          <View style={[styles.newUserHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="compass-outline" size={16} color={colors.primary} />
            <Text style={[styles.newUserHintText, { color: colors.muted }]}>
              Your taste profile is empty — like, save, or read a few series and
              recommendations here will start matching your taste.
            </Text>
          </View>
        )}

        {aiRecEnabled ? (
          <RadarCard colors={colors} focusKey={focusKey} tasteProfile={tasteProfile} />
        ) : (
          <TouchableOpacity
            style={[styles.aiOffBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Settings' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('forYou.goToSettings')}>
            <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
            <Text style={[styles.aiOffText, { color: colors.muted }]}>
              AI Recommendations are off — showing popular picks.{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('forYou.enableInSettings')}</Text>
            </Text>
          </TouchableOpacity>
        )}

        <SectionTitle colors={colors} delay={120} focusKey={focusKey}>🔥 Hot right now</SectionTitle>
        <FlatList
          horizontal
          data={hotRightNow}
          keyExtractor={(item) => `hot-${item.id}`}
          renderItem={({ item }) => <HotCard series={item} onPress={() => openHotDetail(item)} />}
          showsHorizontalScrollIndicator={false}
          style={styles.hotRow}
          contentContainerStyle={{ paddingRight: 20 }}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={80}
          windowSize={10}
          removeClippedSubviews={true}
          getItemLayout={(_, index) => ({ length: 130, offset: 130 * index, index })}
        />

        {creatorSeries.length > 0 && (
          <>
            <SectionTitle colors={colors} delay={160} focusKey={focusKey}>✨ From MangaRecs Creators</SectionTitle>
            <FlatList
              horizontal
              data={creatorSeries}
              keyExtractor={(item) => `creator-${item.id}`}
              renderItem={({ item }) => <HotCard series={item} onPress={() => openHotDetail(item)} />}
              showsHorizontalScrollIndicator={false}
              style={styles.hotRow}
              contentContainerStyle={{ paddingRight: 20 }}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
            />
          </>
        )}

        <SectionTitle colors={colors} delay={180} focusKey={focusKey}>{t('forYou.whatsYourMood')}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moodRow}>
          {MOODS.map((mood) => (
            <MoodButton
              key={mood.label}
              mood={mood}
              active={activeMood === mood.label}
              onPress={() => {
                if (mood.label === 'Adult') {
                  if (!ageVerified) { setShowAgeGate(true); return; }
                }
                setActiveMood(activeMood === mood.label ? null : mood.label);
              }}
            />
          ))}
        </ScrollView>

        {becauseYouReadRecs.length > 0 && becauseYouReadGenre && !activeMood && (
          <>
            <SectionTitle colors={colors} delay={200} focusKey={focusKey}>
              ✨ Because you love {becauseYouReadGenre}
            </SectionTitle>
            <FlatList
              horizontal
              data={becauseYouReadRecs.filter((s) => !dismissedIds.has(s.id))}
              keyExtractor={(item) => `byr-${item.id}`}
              renderItem={({ item }) => <HotCard series={item} onPress={() => openHotDetail(item)} />}
              showsHorizontalScrollIndicator={false}
              style={styles.hotRow}
              contentContainerStyle={{ paddingRight: 20 }}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
            />
          </>
        )}

        <SectionTitle colors={colors} delay={220} focusKey={focusKey}>
          {activeMood === 'Adult' ? '18+ picks for you' : activeMood ? `${activeMood} picks for you` : aiRecEnabled ? 'Recommended for you' : 'Popular picks'}
        </SectionTitle>

        {activeMood === 'Adult' && ageVerified && !allowNsfw ? (
          <View style={[styles.adultLock, { backgroundColor: colors.card, marginHorizontal: 20, borderRadius: 16 }]}>
            <Ionicons name="lock-closed" size={32} color={colors.primary} />
            <Text style={[styles.adultLockTitle, { color: colors.text }]}>{t('forYou.adultOff')}</Text>
            <Text style={[styles.adultLockSub, { color: colors.muted }]}>
              You're verified but adult content is disabled. Enable it in Settings → Content.
            </Text>
            <TouchableOpacity
              style={styles.adultLockBtn}
              onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Settings' })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('forYou.goToSettings')}>
              <Text style={styles.adultLockBtnText}>{t('forYou.goToSettings')} </Text>
            </TouchableOpacity>
          </View>
        ) : displayRecs.filter((s) => !dismissedIds.has(s.id)).length === 0 ? (
          <View style={[styles.adultLock, { backgroundColor: colors.card, marginHorizontal: 20, borderRadius: 16 }]}>
            <Ionicons name="albums-outline" size={30} color={colors.muted} />
            <Text style={[styles.adultLockTitle, { color: colors.text }]}>{t('library.nothingHere')}</Text>
            <Text style={[styles.adultLockSub, { color: colors.muted }]}>
              {activeMood === 'Adult'
                ? "There aren't many 18+ titles in the catalog yet — more are being added."
                : `No ${activeMood || ''} titles in the catalog yet. Try another mood.`}
            </Text>
          </View>
        ) : (
          <View style={styles.recList}>
            {displayRecs.filter((s) => !dismissedIds.has(s.id)).slice(0, 10).map((series, index) => (
              <RecCard
                key={series.id}
                series={series}
                animKey={recAnimKey}
                index={index}
                reason={buildReason(series)}
                onDismiss={() => dismissRec(series)}
                onSave={() => saveRec(series)}
              />
            ))}
          </View>
        )}

        <View style={{ height: tabBarHeight + 8 }} />
        </View>
      </ScrollView>

      <AgeGateModal
        visible={showAgeGate}
        onVerified={() => { setAgeVerified(true); setShowAgeGate(false); setActiveMood('Adult'); }}
        onDismiss={() => setShowAgeGate(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  newUserHint: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  newUserHintText: { flex: 1, fontSize: 12, lineHeight: 17 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
  headerSub: { fontSize: 10, paddingHorizontal: 20, marginBottom: 20 },
  tasteCard: { marginHorizontal: 20, paddingHorizontal: 16, marginBottom: 24 },
  tasteTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  tasteTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  tasteSub: { fontSize: 11 },
  genrePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(123,92,255,0.14)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5 },
  genrePillText: { fontSize: 12, fontWeight: '600', color: '#7B5CFF' },
  radarWrap: { alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, marginBottom: 12 },
  moodRow: { paddingLeft: 20, marginBottom: 24 },
  moodBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  moodBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  moodIcon: { marginRight: 6 },
  moodLabel: { fontSize: 12, fontWeight: '500', paddingRight: 2 },
  moodLabelActive: { color: '#fff' },
  aiOffBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 20, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  aiOffText: { flex: 1, fontSize: 12, lineHeight: 18 },
  recList: { paddingHorizontal: 20, marginBottom: 24 },
  recCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  swipeUnder: { ...StyleSheet.absoluteFillObject, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  swipeUnderSave: { backgroundColor: '#1D9E75', justifyContent: 'flex-start', paddingLeft: 18 },
  swipeUnderRemove: { backgroundColor: '#E5534B', justifyContent: 'flex-end', paddingRight: 18 },
  swipeUnderText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recCover: { width: 64, height: 80, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recInfo: { flex: 1 },
  recReason: { color: '#1D9E75', fontSize: 10, fontWeight: '600', marginBottom: 2 },
  recTitle: { fontSize: 14, fontWeight: '600' },
  recDesc: { fontSize: 11, marginTop: 2 },
  recMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  recMetaText: { fontSize: 10, marginLeft: 4, marginRight: 8 },
  hotRow: { paddingLeft: 20, marginBottom: 24 },
  hotCard: { width: 132, marginRight: 12 },
  hotCover: { width: 132, height: 178, borderRadius: 10, marginBottom: 7 },
  hotLetterWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hotLetterText: { color: 'rgba(255,255,255,0.15)', fontSize: 48, fontWeight: '800' },
  coverLetterWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coverLetterText: { color: 'rgba(255,255,255,0.15)', fontSize: 22, fontWeight: '800' },
  hotTitle: { fontSize: 11, fontWeight: '600', lineHeight: 15, marginBottom: 3 },
  hotReaders: { fontSize: 10, color: '#FF6B35', fontWeight: '500' },
  comingSoonOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', paddingVertical: 6 },
  comingSoonLabel: { color: '#A09CE0', fontSize: 8, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  comingSoonText: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 1 },
  adultLock: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 40 },
  adultLockTitle: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  adultLockSub: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  adultLockBtn: { backgroundColor: '#7B5CFF', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  adultLockBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
