import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  TextInput, Modal, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { BADGE_GRADES, ALL_BADGES, computeEarnedBadgeIds, profileToBadgeStats } from '../utils/badges';
import { useTheme } from '../utils/ThemeContext';
import { useProfile } from '../utils/ProfileContext';
import { MangaCover } from '../utils/mangaCovers';
import BadgeIcon from '../components/BadgeIcon';
import { getMergedDailyLog, calculateStreak, localDateKey } from '../utils/readerUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const PROFILE_THEMES = [
  { id: 'default', label: 'Default', ring: '#534AB7', gradient: ['#534AB7', '#1D9E75'], banner: ['#534AB7', '#0D0D0F'] },
  { id: 'rose',    label: 'Rose',    ring: '#D4537E', gradient: ['#D4537E', '#993556'], banner: ['#D4537E', '#0D0D0F'] },
  { id: 'sky',     label: 'Sky',     ring: '#378ADD', gradient: ['#378ADD', '#185FA5'], banner: ['#378ADD', '#0D0D0F'] },
  { id: 'emerald', label: 'Emerald', ring: '#1D9E75', gradient: ['#1D9E75', '#0F6E56'], banner: ['#1D9E75', '#0D0D0F'] },
  { id: 'amber',   label: 'Amber',   ring: '#EF9F27', gradient: ['#EF9F27', '#BA7517'], banner: ['#EF9F27', '#0D0D0F'] },
  { id: 'violet',  label: 'Violet',  ring: '#7F77DD', gradient: ['#7F77DD', '#D4537E'], banner: ['#7F77DD', '#0D0D0F'] },
];

const BIO_SUGGESTIONS = [
  'Manga enthusiast. Dark fantasy lover. 🌙',
  "Here for the plot twists. 📖✨",
  "Webtoon addict. Can't stop, won't stop. 🎨",
  'Reading between the panels. 🖤',
];

const FAVES_KEY = '@mangarecs_favorites';

const fmtHrs = (h) => {
  if (!h || h <= 0) return '0m';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h)}h`;
};

const LIBRARY_SERIES = [
  { id: 'ls1', title: 'Solo Leveling',                  searchKey: 'Solo Leveling',      lang: 'ko', genre: 'Action, Fantasy',        chapters: 179, color: '#0D1B2A' },
  { id: 'ls2', title: 'Chainsaw Man',                   searchKey: 'Chainsaw Man',       lang: 'ja', genre: 'Action, Horror',          chapters: 163, color: '#2D0A0A' },
  { id: 'ls3', title: 'Spy x Family',                   searchKey: 'Spy x Family',       lang: 'ja', genre: 'Comedy, Action',          chapters: 105, color: '#1A2210' },
  { id: 'ls4', title: 'Jujutsu Kaisen',                 searchKey: 'Jujutsu Kaisen',     lang: 'ja', genre: 'Action, Supernatural',    chapters: 264, color: '#0A0A2D' },
  { id: 'ls5', title: 'Attack on Titan',                searchKey: 'Shingeki no Kyojin', lang: 'ja', genre: 'Action, Drama',           chapters: 139, color: '#2D1B0A' },
  { id: 'ls6', title: 'Tower of God',                   searchKey: 'Tower of God',       lang: 'ko', genre: 'Fantasy, Action',         chapters: 590, color: '#1A0D2D' },
  { id: 'ls7', title: 'Omniscient Reader',              searchKey: 'Omniscient Reader',  lang: 'ko', genre: 'Fantasy, Action',         chapters: 210, color: '#2D1A0D' },
  { id: 'ls8', title: "Frieren: Beyond Journey's End",  searchKey: 'Frieren',            lang: 'ja', genre: 'Fantasy, Slice of Life',  chapters: 121, color: '#0D2230' },
];

const GRADE_RANK = { mythic: 0, gold: 1, purple: 2, indigo: 3, blue: 4, green: 5, grey: 6 };

// ── Badge pop scale — grade-aware overshoot ────────────────────────────────

function getBadgeScale(anim, grade) {
  if (grade === 'mythic') return anim.interpolate({ inputRange: [0, 0.50, 0.75, 1], outputRange: [0, 1.65, 0.82, 1], extrapolate: 'clamp' });
  if (grade === 'gold')   return anim.interpolate({ inputRange: [0, 0.52, 0.76, 1], outputRange: [0, 1.48, 0.86, 1], extrapolate: 'clamp' });
  if (grade === 'purple') return anim.interpolate({ inputRange: [0, 0.55, 0.78, 1], outputRange: [0, 1.32, 0.91, 1], extrapolate: 'clamp' });
  if (grade === 'indigo') return anim.interpolate({ inputRange: [0, 0.57, 0.79, 1], outputRange: [0, 1.26, 0.93, 1], extrapolate: 'clamp' });
  if (grade === 'blue')   return anim.interpolate({ inputRange: [0, 0.58, 0.80, 1], outputRange: [0, 1.22, 0.94, 1], extrapolate: 'clamp' });
  return anim.interpolate({ inputRange: [0, 0.62, 0.84, 1], outputRange: [0, 1.12, 0.97, 1], extrapolate: 'clamp' });
}

// ── StatCard ───────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, anim }) {
  const { colors } = useTheme();
  const scale      = anim.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: [0.78, 1.06, 0.97, 1], extrapolate: 'clamp' });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <Animated.View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: anim, transform: [{ scale }, { translateY }] }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </Animated.View>
  );
}

// ── StreakCalendar ─────────────────────────────────────────────────────────

function StreakCalendar({ dailyLog }) {
  const WEEKS = 10;
  const DAYS  = 7;

  // 70-day window ending today, oldest first
  const cells = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arr = [];
    for (let i = WEEKS * DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      arr.push(dailyLog[localDateKey(d)] || 0);
    }
    return arr;
  })();

  function getColor(hours) {
    if (hours <= 0)   return '#0D0D0F';
    if (hours < 0.25) return '#2D2872';
    if (hours < 0.75) return '#3D3580';
    if (hours < 1.5)  return '#4A40A0';
    return '#534AB7';
  }

  // Columns = weeks (left = oldest, right = most recent)
  // Rows = days within the week (top to bottom)
  return (
    <View style={styles.streakGrid}>
      {Array.from({ length: WEEKS }).map((_, week) => (
        <View key={week} style={styles.streakWeekCol}>
          {Array.from({ length: DAYS }).map((_, day) => (
            <View key={day} style={[styles.streakCell, { backgroundColor: getColor(cells[week * DAYS + day]) }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── PeopleRow (Friends / Followers / Following) ─────────────────────────────

export function PeopleRow({ friends = [], followers = [], following = [], colors, onOpen }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="people-outline" size={14} color={colors.muted} />
          <Text style={[styles.sectionTitleText, { color: colors.text }]}>People</Text>
        </View>
      </View>

      <View style={styles.peopleStatsRow}>
        <TouchableOpacity style={styles.peopleStatCell} activeOpacity={0.7} onPress={() => onOpen('friends')}>
          <Text style={[styles.peopleStatValue, { color: colors.text }]}>{friends.length}</Text>
          <Text style={[styles.peopleStatLabel, { color: colors.muted }]}>Friends</Text>
        </TouchableOpacity>
        <View style={[styles.peopleStatDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={styles.peopleStatCell} activeOpacity={0.7} onPress={() => onOpen('followers')}>
          <Text style={[styles.peopleStatValue, { color: colors.text }]}>{followers.length}</Text>
          <Text style={[styles.peopleStatLabel, { color: colors.muted }]}>Followers</Text>
        </TouchableOpacity>
        <View style={[styles.peopleStatDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={styles.peopleStatCell} activeOpacity={0.7} onPress={() => onOpen('following')}>
          <Text style={[styles.peopleStatValue, { color: colors.text }]}>{following.length}</Text>
          <Text style={[styles.peopleStatLabel, { color: colors.muted }]}>Following</Text>
        </TouchableOpacity>
      </View>

      {friends.length === 0 ? (
        <Text style={[styles.emptyFriendsText, { color: colors.muted }]}>No friends yet — find people on Social</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {friends.slice(0, 12).map((friend) => (
            <TouchableOpacity
              key={friend.id}
              style={styles.friendItem}
              activeOpacity={0.75}
              onPress={() => onOpen('friends')}>
              <View style={[styles.friendAvatar, friend.online && styles.friendAvatarOnline]}>
                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatarImg} />
                ) : (
                  <Text style={styles.friendAvatarText}>{friend.avatar}</Text>
                )}
              </View>
              <Text style={[styles.friendName, { color: colors.muted }]} numberOfLines={1}>{friend.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── PeopleListModal ──────────────────────────────────────────────────────────

export function PeopleListModal({ visible, title, people = [], colors, onClose, onOpenPerson }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.peopleModalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.peopleModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.peopleModalHeader}>
            <Text style={[styles.peopleModalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {people.length === 0 ? (
            <Text style={[styles.peopleModalEmptyText, { color: colors.muted }]}>Nobody here yet</Text>
          ) : (
            <FlatList
              data={people}
              keyExtractor={(p) => String(p.id)}
              style={styles.peopleModalList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.peopleModalRow} activeOpacity={0.7} onPress={() => onOpenPerson?.(item)}>
                  <View style={[styles.friendAvatar, item.online && styles.friendAvatarOnline]}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.friendAvatarImg} />
                    ) : (
                      <Text style={styles.friendAvatarText}>{item.avatar}</Text>
                    )}
                  </View>
                  <Text style={[styles.peopleModalName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  {item.online && <View style={styles.peopleModalOnlineDot} />}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets     = useSafeAreaInsets();
  const scrollRef  = useRef(null);
  useScrollToTop(scrollRef);

  const { profile, userId, uploadAvatar, updateProfile, refreshProfile } = useProfile();
  const username = profile?.username || 'InkReader';

  const [themeId, setThemeId]             = useState('default');
  const [avatarUri, setAvatarUri]         = useState(null);
  const [bannerUri, setBannerUri]         = useState(null);
  const [bio, setBio]                     = useState('');
  const [editingBio, setEditingBio]       = useState(false);
  const [bioDraft, setBioDraft]           = useState('');
  const [showThemes, setShowThemes]       = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [friends, setFriends]             = useState([]);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [showPeople, setShowPeople]       = useState(null); // null | 'friends' | 'followers' | 'following'
  const [joinDate, setJoinDate]           = useState('');
  const [favorites, setFavorites]         = useState([]);
  const [showAddFave, setShowAddFave]     = useState(false);
  const [faveSearch, setFaveSearch]       = useState('');
  const [faveTab, setFaveTab]             = useState('library');
  const [dailyLog, setDailyLog]           = useState({});
  const [entriesRead, setEntriesRead]     = useState(0);
  const [libraryItems, setLibraryItems]   = useState(LIBRARY_SERIES);
  const [searchResults, setSearchResults] = useState([]);

  const theme = PROFILE_THEMES.find((t) => t.id === themeId) || PROFILE_THEMES[0];

  const earnedIds = useMemo(
    () => profile ? computeEarnedBadgeIds(profileToBadgeStats(profile)) : new Set(),
    [profile]
  );
  const earnedBadges = useMemo(
    () => ALL_BADGES
      .filter((b) => earnedIds.has(b.id))
      .sort((a, b) => (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9))
      .slice(0, 12),
    [earnedIds]
  );
  const badgeGroups = useMemo(
    () => Object.keys(BADGE_GRADES).map((gradeKey) => ({
      gradeKey,
      grade: BADGE_GRADES[gradeKey],
      badges: ALL_BADGES.filter((b) => b.grade === gradeKey && (earnedIds.has(b.id) || (b.grade === 'grey' && !b.hidden))),
    })).filter((g) => g.badges.length > 0),
    [earnedIds]
  );
  const badgeFlatData = useMemo(() => {
    const rows = [];
    for (const { gradeKey, grade, badges } of badgeGroups) {
      rows.push({ key: `hdr_${gradeKey}`, _t: 'h', grade });
      for (let i = 0; i < badges.length; i += 2) {
        rows.push({ key: badges[i].id, _t: 'r', grade, left: badges[i], right: badges[i + 1] || null });
      }
    }
    return rows;
  }, [badgeGroups]);

  const userIdRef = useRef(userId);
  const profileRef = useRef(profile);
  const earnedBadgesLenRef = useRef(earnedBadges.length);
  const refreshProfileRef = useRef(refreshProfile);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { earnedBadgesLenRef.current = earnedBadges.length; }, [earnedBadges.length]);
  useEffect(() => { refreshProfileRef.current = refreshProfile; }, [refreshProfile]);

  // ── Animation refs ───────────────────────────────────────────────────────

  const headerAnim  = useRef(new Animated.Value(0)).current;
  const bannerAnim  = useRef(new Animated.Value(0)).current;
  const stat0Anim   = useRef(new Animated.Value(0)).current;
  const stat1Anim   = useRef(new Animated.Value(0)).current;
  const stat2Anim   = useRef(new Animated.Value(0)).current;
  const friendsAnim = useRef(new Animated.Value(0)).current;
  const streakAnim  = useRef(new Animated.Value(0)).current;
  const creatorAnim = useRef(new Animated.Value(0)).current;
  const badgeAnims  = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const settingsRot = useRef(new Animated.Value(0)).current;
  const settingsSpin = settingsRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  // ── Load local images + favorites on mount ───────────────────────────────

  useEffect(() => {
    AsyncStorage.multiGet(['@mangarecs_avatar', '@mangarecs_banner', FAVES_KEY]).then(([[, av], [, bn], [, fv]]) => {
      if (av) setAvatarUri(av);
      if (bn) setBannerUri(bn);
      if (fv) { try { setFavorites(JSON.parse(fv)); } catch (_) {} }
    });
  }, []);

  // ── Sync profile data once when profile first loads ──────────────────────

  useEffect(() => {
    if (!profile) return;
    setBio(profile.bio || 'Manga enthusiast. Dark fantasy lover. 🌙');
    setThemeId(profile.color || 'default');
    if (profile.avatar_url) setAvatarUri((prev) => prev || profile.avatar_url);
    if (profile.banner_url) setBannerUri((prev) => prev || profile.banner_url);
    // Seed local favorites from cloud if local storage is empty (fresh install / new device)
    if (profile.favorites?.length) {
      // Cloud has data — seed local if it's empty (fresh install / new device)
      setFavorites((prev) => prev.length > 0 ? prev : profile.favorites);
    } else {
      // Cloud is empty — push local favorites up so friends can see them
      AsyncStorage.getItem(FAVES_KEY).then((raw) => {
        if (!raw) return;
        try {
          const local = JSON.parse(raw);
          if (local.length > 0) {
            setFavorites(local);
            updateProfile({ favorites: local });
          }
        } catch (_) {}
      });
    }
  }, [profile?.id]);

  // ── Load join date from auth ─────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (user?.created_at) {
        const d = new Date(user.created_at);
        setJoinDate(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      }
    }).catch(() => {});
  }, []);

  // ── Load user's reading library for the favorites picker ────────────────

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('reading_progress')
      .select('series_title, current_chapter, total_chapters, status, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data?.length) return;
        setLibraryItems(data.map((r, i) => ({
          id: `rp-${r.series_title}-${i}`,
          title: r.series_title,
          searchKey: r.series_title,
          lang: 'ja',
          genre: r.status === 'completed' ? 'Completed' : 'Reading',
          chapters: r.total_chapters || r.current_chapter || 0,
          color: '#1A1A2E',
        })));
      })
      .catch(() => {});
  }, [userId]);

  // ── Search manga_pool when user types in the fave picker ─────────────────

  useEffect(() => {
    const query = faveSearch.trim();
    if (!query) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      supabase
        .from('manga_pool')
        .select('title, genres, lang')
        .ilike('title', `%${query}%`)
        .limit(15)
        .then(({ data }) => {
          if (!data) return;
          setSearchResults(data.map((m) => ({
            id: `mp-${m.title}`,
            title: m.title,
            searchKey: m.title,
            lang: m.lang || 'ja',
            genre: Array.isArray(m.genres) ? m.genres.slice(0, 2).join(', ') : (m.genres || ''),
            chapters: 0,
            color: '#1A1A2E',
          })));
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [faveSearch]);

  // ── Load friends list ────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted')
      .then(async ({ data: rows, error }) => {
        if (error || !rows || rows.length === 0) { setFriends([]); return; }
        const friendIds = rows.map(f =>
          f.requester_id === userId ? f.addressee_id : f.requester_id
        );
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, online')
          .in('id', friendIds);
        if (!profiles) return;
        const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
        setFriends(
          friendIds.map(id => {
            const p = byId[id];
            if (!p) return null;
            return { id: p.id, name: p.username || '?', avatar: (p.username || '?').slice(0, 1).toUpperCase(), avatarUrl: p.avatar_url || null, online: p.online || false };
          }).filter(Boolean)
        );
      });
  }, [userId]);

  // ── Load followers / following ───────────────────────────────────────────

  function toPerson(p) {
    return { id: p.id, name: p.username || '?', avatar: (p.username || '?').slice(0, 1).toUpperCase(), avatarUrl: p.avatar_url || null, online: !!p.online };
  }

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('followers')
      .select('follower:follower_id(id, username, avatar_url, online)')
      .eq('followed_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFollowersList((data || []).map(r => r.follower).filter(Boolean).map(toPerson));
      });
    supabase
      .from('followers')
      .select('followed:followed_id(id, username, avatar_url, online)')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFollowingList((data || []).map(r => r.followed).filter(Boolean).map(toPerson));
      });
  }, [userId]);

  // ── Replay all entrance animations on every focus ────────────────────────

  useFocusEffect(
    useCallback(() => {
      // Pull latest profile so favorite_genre and hours_read are always current
      refreshProfileRef.current?.();

      // Merge local + cloud daily_log so total hours is accurate across devices / reinstalls
      getMergedDailyLog(profileRef.current?.daily_log).then((log) => {
        setDailyLog(log);
        const streak = calculateStreak(log);
        if (userIdRef.current && profileRef.current) {
          const totalHours = Math.round(Object.values(log).reduce((s, h) => s + h, 0) * 100) / 100;
          updateProfile({
            streak_count: streak,
            hours_read: totalHours,
            daily_log: log,
          });
        }
      });

      // Count distinct entries where user has read ≥50% or completed (no duplicates)
      if (userIdRef.current) {
        supabase
          .from('reading_progress')
          .select('series_title, current_chapter, total_chapters, status')
          .eq('user_id', userIdRef.current)
          .then(({ data }) => {
            if (!data) return;
            const read = new Set();
            data.forEach((r) => {
              if (r.status === 'completed') {
                read.add(r.series_title);
              } else if (r.total_chapters > 0 && r.current_chapter / r.total_chapters >= 0.5) {
                read.add(r.series_title);
              }
            });
            setEntriesRead(read.size);
          })
          .catch(() => {});
      }

      const all = [headerAnim, bannerAnim, stat0Anim, stat1Anim, stat2Anim, friendsAnim, streakAnim, creatorAnim, ...badgeAnims];
      all.forEach((a) => a.setValue(0));
      settingsRot.setValue(0);

      const t = (a, delay, duration = 220) =>
        Animated.timing(a, { toValue: 1, duration, delay, useNativeDriver: true });

      const badgeCount = earnedBadgesLenRef.current;
      Animated.parallel([
        t(headerAnim,  0,   180),
        t(bannerAnim,  40,  260),
        t(stat0Anim,   90,  280),
        t(stat1Anim,   130, 280),
        t(stat2Anim,   170, 280),
        t(friendsAnim, 150, 240),
        t(streakAnim,  200, 260),
        ...badgeAnims.slice(0, badgeCount).map((a, i) => t(a, 240 + i * 35, 300)),
        t(creatorAnim, 280 + Math.min(badgeCount, 12) * 12, 260),
      ]).start();
    }, [])
  );

  // ── Derived animation values ─────────────────────────────────────────────

  const headerY       = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });
  const bannerScale   = bannerAnim.interpolate({ inputRange: [0, 0.6, 0.85, 1], outputRange: [0.88, 1.03, 0.98, 1], extrapolate: 'clamp' });
  const friendsSlideX = friendsAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const streakScale   = streakAnim.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: [0.94, 1.02, 0.99, 1], extrapolate: 'clamp' });
  const creatorSlideY = creatorAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const creatorScale  = creatorAnim.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: [0.9, 1.04, 0.98, 1], extrapolate: 'clamp' });

  // ── Handlers ────────────────────────────────────────────────────────────

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      const { url } = await uploadAvatar(uri, 'avatar');
      if (url) {
        await AsyncStorage.setItem('@mangarecs_avatar', url);
        setAvatarUri(url);
      }
    }
  }

  async function pickBanner() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setBannerUri(uri);
      const { url } = await uploadAvatar(uri, 'banner');
      if (url) {
        await AsyncStorage.setItem('@mangarecs_banner', url);
        setBannerUri(url);
      }
    }
  }

  async function saveBio() {
    setBio(bioDraft);
    setEditingBio(false);
    await updateProfile({ bio: bioDraft });
  }

  function handleSettingsPress() {
    settingsRot.setValue(0);
    Animated.timing(settingsRot, { toValue: 1, duration: 340, useNativeDriver: true }).start();
    navigation.navigate('Settings');
  }

  async function addFave(series) {
    if (favorites.length >= 5) return;
    const next = [...favorites, series];
    setFavorites(next);
    setShowAddFave(false);
    setFaveSearch('');
    await AsyncStorage.setItem(FAVES_KEY, JSON.stringify(next));
    updateProfile({ favorites: next });
  }

  async function removeFave(titleOrId) {
    const next = favorites.filter((f) => f.id !== titleOrId && f.title !== titleOrId);
    setFavorites(next);
    await AsyncStorage.setItem(FAVES_KEY, JSON.stringify(next));
    updateProfile({ favorites: next });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">

        {/* Header */}
        <Animated.View style={[styles.topHeader, { opacity: headerAnim, transform: [{ translateY: headerY }] }]}>
          <Text style={[styles.topHeaderTitle, { color: colors.text }]}>Profile</Text>
          <TouchableOpacity onPress={handleSettingsPress}>
            <Animated.View style={{ transform: [{ rotate: settingsSpin }] }}>
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        {/* Banner + avatar card */}
        <Animated.View style={[styles.bannerCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: bannerAnim, transform: [{ scale: bannerScale }] }]}>
          <TouchableOpacity onPress={pickBanner} activeOpacity={0.9}>
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={styles.bannerImage} />
            ) : (
              <LinearGradient colors={[theme.banner[0], theme.banner[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerImage} />
            )}
            <View style={styles.bannerChangeBtn}>
              <Ionicons name="image-outline" size={11} color="rgba(255,255,255,0.8)" />
              <Text style={styles.bannerChangeText}>Change</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.bannerInfoArea}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarWrap}>
                <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatar, { borderColor: theme.ring }]}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>{username.slice(0, 2).toUpperCase()}</Text>
                  )}
                </LinearGradient>
                <TouchableOpacity style={styles.cameraBtn} onPress={pickAvatar}>
                  <Ionicons name="camera" size={11} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.nameBioBlock}>
                <Text style={[styles.username, { color: colors.text }]}>{username}</Text>
                {editingBio ? (
                  <View>
                    <TextInput
                      style={[styles.bioInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                      value={bioDraft}
                      onChangeText={setBioDraft}
                      multiline
                      maxLength={100}
                      placeholder="Write your bio..."
                      placeholderTextColor={colors.muted}
                      autoFocus
                    />
                    {BIO_SUGGESTIONS.filter((s) => s !== bioDraft).slice(0, 2).map((s) => (
                      <TouchableOpacity key={s} onPress={() => setBioDraft(s)}>
                        <Text style={styles.bioSuggestion}>✦ {s}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={styles.bioEditActions}>
                      <TouchableOpacity style={styles.bioSaveBtn} onPress={saveBio}>
                        <Ionicons name="checkmark" size={11} color="#fff" />
                        <Text style={styles.bioSaveText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.bioCancelBtn} onPress={() => { setBioDraft(bio); setEditingBio(false); }}>
                        <Ionicons name="close" size={14} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setBioDraft(bio); setEditingBio(true); }}>
                    <Text style={[styles.bioText, { color: colors.muted }]}>{bio}</Text>
                    <Text style={styles.bioEditHint}>tap to edit bio</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={[styles.handle, { color: colors.muted }]}>@{username.toLowerCase()} · Joined {joinDate || 'Dec 2024'}</Text>

            <TouchableOpacity style={styles.themeToggle} onPress={() => setShowThemes((v) => !v)}>
              <Ionicons name="color-palette-outline" size={12} color={colors.muted} />
              <Text style={[styles.themeToggleText, { color: colors.muted }]}>Profile Theme</Text>
              <Text style={styles.themeToggleValue}>· {theme.label}</Text>
            </TouchableOpacity>

            {showThemes && (
              <View style={styles.themeOptionsRow}>
                {PROFILE_THEMES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.themeChip, { borderColor: colors.border }, themeId === t.id && { borderColor: t.ring, backgroundColor: 'rgba(83,74,183,0.12)' }]}
                    onPress={() => { setThemeId(t.id); setShowThemes(false); updateProfile({ color: t.id }); }}>
                    <View style={[styles.themeChipDot, { backgroundColor: t.gradient[0] }]} />
                    <Text style={[styles.themeChipText, { color: colors.muted }, themeId === t.id && { color: t.ring }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard icon="book"   label="Read" value={String(entriesRead)} color="#534AB7" anim={stat0Anim} />
          <StatCard icon="time"   label="Time Read" value={fmtHrs(Object.keys(dailyLog).length > 0 ? Math.round(Object.values(dailyLog).reduce((s, h) => s + h, 0) * 100) / 100 : (profile?.hours_read ?? 0))} color="#1D9E75" anim={stat1Anim} />
          <StatCard icon="trophy" label="Fav. Genre" value={profile?.favorite_genre || '—'} color="#FFD700" anim={stat2Anim} />
        </View>

        {/* Friends · Followers · Following */}
        <Animated.View style={{ opacity: friendsAnim, transform: [{ translateX: friendsSlideX }] }}>
          <PeopleRow
            friends={friends}
            followers={followersList}
            following={followingList}
            colors={colors}
            onOpen={(key) => setShowPeople(key)}
          />
        </Animated.View>

        <PeopleListModal
          visible={!!showPeople}
          title={showPeople === 'followers' ? 'Followers' : showPeople === 'following' ? 'Following' : 'Friends'}
          people={showPeople === 'followers' ? followersList : showPeople === 'following' ? followingList : friends}
          colors={colors}
          onClose={() => setShowPeople(null)}
          onOpenPerson={(p) => {
            setShowPeople(null);
            navigation.navigate('FriendProfile', { id: p.id });
          }}
        />

        {/* Reading Streak + Faves — scales up */}
        <Animated.View style={[styles.streakSection, { backgroundColor: colors.card, borderColor: colors.border, opacity: streakAnim, transform: [{ scale: streakScale }] }]}>
          <Text style={[styles.streakTitle, { color: colors.text }]}>Reading Streak</Text>

          {/* Heatmap + Faves side by side */}
          <View style={styles.streakBody}>
            <View style={styles.streakLeft}>
              <View style={styles.streakBadges}>
                <View style={styles.todayBadge}>
                  <Ionicons name="time" size={11} color="#534AB7" />
                  <Text style={styles.todayBadgeText}>{(() => {
                    const hrs = dailyLog[localDateKey()] || 0;
                    if (hrs <= 0) return 'Start reading';
                    if (hrs < 1)  return `${Math.round(hrs * 60)}m today`;
                    return `${Math.floor(hrs)}h ${Math.round((hrs % 1) * 60)}m Today `;
                  })()}</Text>
                </View>
                <View style={styles.fireBadge}>
                  <Text style={styles.fireEmoji}>🔥</Text>
                  <Text style={styles.fireBadgeText}>{calculateStreak(dailyLog)}d</Text>
                </View>
              </View>
              <StreakCalendar dailyLog={dailyLog} />
              <View style={styles.streakLegend}>
                {[{ bg: colors.background, label: 'None' }, { bg: '#4A40A0', label: 'Some' }, { bg: '#534AB7', label: 'Lots' }].map(({ bg, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: bg }]} />
                    <Text style={[styles.legendText, { color: colors.muted }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Faves panel */}
            <View style={[styles.favesPanel, { borderColor: colors.border }]}>
              <View style={styles.favesPanelHead}>
                <Ionicons name="star" size={11} color="#FFD700" />
                <Text style={styles.favesPanelHeadText}>Favorite</Text>
              </View>

              {favorites.length === 0 ? (
                <TouchableOpacity style={[styles.favesEmptyCard, { borderColor: 'rgba(83,74,183,0.25)' }]} onPress={() => setShowAddFave(true)}>
                  <Ionicons name="add" size={16} color="rgba(83,74,183,0.5)" />
                  <Text style={styles.favesEmptyText}>save </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.faveFeatCard}>
                  <MangaCover title={favorites[0].title} searchKey={favorites[0].searchKey} lang={favorites[0].lang} color={favorites[0].color} style={styles.faveFeatGrad}>
                    <LinearGradient
                      colors={['transparent', 'rgba(0, 0, 0, 0.88)']}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, justifyContent: 'flex-end', padding: 8 }}>
                      <Text style={styles.faveFeatTitle} numberOfLines={3}>{favorites[0].title}</Text>
                    </LinearGradient>
                  </MangaCover>
                </View>
              )}

              <View style={styles.favesPanelFoot}>
                {favorites.length > 0 && (
                  <TouchableOpacity onPress={() => removeFave(favorites[0].id)} style={styles.favesRemoveBtn}>
                    <Ionicons name="close" size={9} color="#fff" />
                  </TouchableOpacity>
                )}
                <Text style={[styles.favesCountText, { color: colors.muted }]}>{favorites.length}/5</Text>
                {favorites.length < 5 && (
                  <TouchableOpacity onPress={() => setShowAddFave(true)} style={styles.favesAddBtn}>
                    <Ionicons name="add" size={13} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitleText, { color: colors.text }]}>Badges Earned</Text>
            <Text style={[styles.badgeCountText, { color: colors.muted }]}>{earnedIds.size} / {ALL_BADGES.length}</Text>
          </View>
          <View style={styles.badgeGrid}>
            {earnedBadges.map((badge, i) => {
              const grade = BADGE_GRADES[badge.grade];
              const anim  = badgeAnims[i];
              const scale = getBadgeScale(anim, badge.grade);
              return (
                <Animated.View key={badge.id} style={[styles.badgeOuter, { opacity: anim, transform: [{ scale }] }]}>
                  <TouchableOpacity
                    style={[styles.badgeCard, { borderColor: grade.border }]}
                    onPress={() => setShowAllBadges(true)}
                    activeOpacity={0.8}>
                    <BadgeIcon badge={badge} size={52} />
                    <Text style={[styles.badgeName, { color: grade.color, marginTop: 4 }]} numberOfLines={2}>{badge.name}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          <TouchableOpacity style={styles.seeAllBadgesBtn} onPress={() => setShowAllBadges(true)}>
            <Text style={styles.seeAllBadgesText}>See all {earnedIds.size} earned badges</Text>
          </TouchableOpacity>
        </View>

        {/* Creator card */}
        <Animated.View style={[styles.section, { opacity: creatorAnim, transform: [{ translateY: creatorSlideY }, { scale: creatorScale }] }]}>
          <TouchableOpacity style={styles.creatorCard} onPress={() => navigation.navigate('Creator')} activeOpacity={0.85}>
            <View style={styles.creatorIconWrap}>
              <Ionicons name="create-outline" size={18} color="#534AB7" />
            </View>
            <View style={styles.creatorInfo}>
              <Text style={[styles.creatorTitle, { color: colors.text }]}>Creator Dashboard</Text>
              <Text style={[styles.creatorSub, { color: colors.muted }]}>Upload manga · Manage series · View stats</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 88 }} />
      </ScrollView>

      {/* All badges modal */}
      <Modal visible={showAllBadges} animationType="none" transparent onRequestClose={() => setShowAllBadges(false)}>
        {showAllBadges && (
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAllBadges(false)}>
            <View style={[styles.badgesModalSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={styles.badgesModalHeader}>
                <View>
                  <Text style={[styles.badgesModalTitle, { color: colors.text }]}>Achievement Badges</Text>
                  <Text style={[styles.badgesModalSub, { color: colors.muted }]}>{earnedIds.size} earned · {ALL_BADGES.length - earnedIds.size} locked</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAllBadges(false)}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.gradeLegendRow}>
                {Object.entries(BADGE_GRADES).map(([key, g]) => (
                  <View key={key} style={[styles.gradeLegendChip, { backgroundColor: g.bg, borderColor: g.border }]}>
                    <Text style={[styles.gradeLegendText, { color: g.color }]}>{g.label}</Text>
                  </View>
                ))}
              </View>
              <FlatList
                data={badgeFlatData}
                keyExtractor={(item) => item.key}
                style={styles.badgesScrollArea}
                contentContainerStyle={{ paddingBottom: 30 }}
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                renderItem={({ item }) => {
                  if (item._t === 'h') {
                    return (
                      <Text style={[styles.gradeGroupTitle, { color: item.grade.color, marginTop: 12 }]}>
                        {item.grade.label}
                      </Text>
                    );
                  }
                  return (
                    <View style={styles.gradeBadgeGrid}>
                      {[item.left, item.right].map((badge, idx) => {
                        if (!badge) return <View key={idx} style={styles.fullBadgeCard} />;
                        const earned = earnedIds.has(badge.id);
                        return (
                          <View
                            key={badge.id}
                            style={[
                              styles.fullBadgeCard,
                              { borderColor: earned ? item.grade.border : colors.border },
                              !earned && styles.fullBadgeCardLocked,
                            ]}>
                            <View style={{ marginRight: 10, marginTop: 2 }}>
                              <BadgeIcon badge={badge} size={44} locked={!earned} />
                            </View>
                            <View style={styles.fullBadgeInfo}>
                              <Text style={[styles.fullBadgeName, { color: earned ? item.grade.color : colors.muted }]}>{badge.name}</Text>
                              <Text style={[styles.fullBadgeDesc, { color: colors.muted }]}>{badge.desc}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        )}
      </Modal>

      {/* Add Favorite modal */}
      <Modal visible={showAddFave} animationType="slide" transparent onRequestClose={() => { setShowAddFave(false); setFaveSearch(''); setSearchResults([]); }}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setShowAddFave(false); setFaveSearch(''); setSearchResults([]); }} />
          <View style={[styles.addFaveSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.addFaveHeaderRow}>
              <Text style={[styles.addFaveTitle, { color: colors.text }]}>Add Favorites </Text>
              <TouchableOpacity onPress={() => { setShowAddFave(false); setFaveSearch(''); setSearchResults([]); }}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.addFaveTabs}>
              <TouchableOpacity
                style={[styles.addFaveTab, faveTab === 'library' && styles.addFaveTabActive]}
                onPress={() => setFaveTab('library')}>
                <Text style={[styles.addFaveTabText, { color: faveTab === 'library' ? '#fff' : colors.muted }]}>From Library </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.addFaveSearchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={14} color={colors.muted} />
              <TextInput
                style={[styles.addFaveSearchInput, { color: colors.text }]}
                placeholder="Search title..."
                placeholderTextColor={colors.muted}
                value={faveSearch}
                onChangeText={setFaveSearch}
              />
            </View>

            <ScrollView style={styles.addFaveList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {(() => {
                const alreadyFaved = new Set(favorites.map((f) => f.title));
                const q = faveSearch.trim().toLowerCase();
                let items;
                if (!q) {
                  // Suggested: library items capped at 15
                  items = libraryItems.filter((s) => !alreadyFaved.has(s.title)).slice(0, 15);
                } else {
                  // Merge library matches + manga_pool results, dedupe by title, cap at 15
                  const libMatches = libraryItems.filter(
                    (s) => !alreadyFaved.has(s.title) && s.title.toLowerCase().includes(q)
                  );
                  const seen = new Set(libMatches.map((s) => s.title));
                  const poolMatches = searchResults.filter(
                    (s) => !alreadyFaved.has(s.title) && !seen.has(s.title)
                  );
                  items = [...libMatches, ...poolMatches].slice(0, 15);
                }
                return items.map((series) => (
                  <TouchableOpacity
                    key={series.id}
                    style={[styles.addFaveItem, { borderBottomColor: colors.border }]}
                    onPress={() => addFave(series)}>
                    <MangaCover title={series.title} searchKey={series.searchKey} lang={series.lang} color={series.color} style={styles.addFaveItemThumb} />
                    <View style={styles.addFaveItemInfo}>
                      <Text style={[styles.addFaveItemTitle, { color: colors.text }]}>{series.title}</Text>
                      <Text style={[styles.addFaveItemMeta, { color: colors.muted }]}>{series.genre}{series.chapters > 0 ? ` · ${series.chapters} ch` : ''}</Text>
                    </View>
                    <Ionicons name="add" size={20} color={colors.muted} />
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  topHeaderTitle: { fontSize: 28, fontWeight: 'bold' },
  uploadDisclaimer: { color: '#9B9AA3', fontSize: 10, textAlign: 'center', marginTop: 4, paddingHorizontal: 4 },
  bannerCard: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 16 },
  bannerImage: { width: '100%', height: 80 },
  bannerChangeBtn: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  bannerChangeText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginLeft: 4, paddingRight: 2 },
  bannerInfoArea: { padding: 16, paddingTop: 0 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -32 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  cameraBtn: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#534AB7', borderRadius: 12, padding: 5 },
  nameBioBlock: { flex: 1, marginLeft: 12, marginTop: 36 },
  username: { fontSize: 16, fontWeight: 'bold' },
  bioText: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  bioEditHint: { color: 'rgba(83,74,183,0.6)', fontSize: 9, marginTop: 2 },
  bioInput: { borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 12, marginTop: 4, minHeight: 44 },
  bioSuggestion: { color: 'rgba(83,74,183,0.8)', fontSize: 10, marginTop: 4 },
  bioEditActions: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  bioSaveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#534AB7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginRight: 8 },
  bioSaveText: { color: '#fff', fontSize: 11, fontWeight: '500', marginLeft: 4, paddingRight: 2 },
  bioCancelBtn: { padding: 5 },
  handle: { fontSize: 10, marginTop: 4 },
  themeToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  themeToggleText: { fontSize: 11, marginLeft: 6 },
  themeToggleValue: { color: '#534AB7', fontSize: 11, fontWeight: '500', marginLeft: 4 },
  themeOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  themeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginRight: 8, marginBottom: 8 },
  themeChipDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  themeChipText: { fontSize: 11, fontWeight: '500', paddingRight: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1 },
  statValue: { fontSize: 18, fontWeight: 'bold', marginTop: 6, marginBottom: 2 },
  statLabel: { fontSize: 10, textAlign: 'center' },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitleText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  seeAllRow: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: { color: '#534AB7', fontSize: 11, fontWeight: '500', marginRight: 2 },
  emptyFriendsText: { fontSize: 12, fontStyle: 'italic' },
  friendItem: { alignItems: 'center', marginRight: 16, width: 64 },
  friendAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(83,74,183,0.5)', alignItems: 'center', justifyContent: 'center' },
  friendAvatarOnline: { borderWidth: 2, borderColor: '#1D9E75' },
  friendAvatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  friendName: { fontSize: 10, marginTop: 6, textAlign: 'center' },
  friendAvatarImg: { width: '100%', height: '100%', borderRadius: 24 },

  // People stats row (Friends / Followers / Following)
  peopleStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  peopleStatCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  peopleStatValue: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  peopleStatLabel: { fontSize: 11 },
  peopleStatDivider: { width: 1, height: 24 },

  // People list modal
  peopleModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  peopleModalCard: { width: '100%', maxWidth: 420, maxHeight: '70%', borderRadius: 16, borderWidth: 1, padding: 16 },
  peopleModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  peopleModalTitle: { fontSize: 16, fontWeight: '600' },
  peopleModalEmptyText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  peopleModalList: { maxHeight: '100%' },
  peopleModalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  peopleModalName: { fontSize: 14, fontWeight: '500', marginLeft: 12, flex: 1 },
  peopleModalOnlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1D9E75' },

  // Streak + Faves
  streakSection: { marginHorizontal: 20, borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1 },
  streakTitle: { fontSize: 16, fontWeight: '600', marginBottom: 14 },
  streakBadges: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  todayBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(83,74,183,0.1)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, marginRight: 6 },
  todayBadgeText: { color: '#534AB7', fontSize: 12, fontWeight: '600', marginLeft: 4, paddingRight: 2 },
  fireBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,149,0,0.12)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  fireEmoji: { fontSize: 12 },
  fireBadgeText: { color: '#FF9500', fontSize: 12, fontWeight: '600', marginLeft: 4, paddingRight: 2 },
  streakBody: { flexDirection: 'row', alignItems: 'flex-start' },
  streakLeft: { flex: 1 },
  streakGrid: { flexDirection: 'row', marginBottom: 10 },
  streakWeekCol: { marginRight: 3 },
  streakCell: { width: 11, height: 11, borderRadius: 2, marginBottom: 3 },
  streakLegend: { flexDirection: 'row', alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  legendDot: { width: 11, height: 11, borderRadius: 2, marginRight: 5 },
  legendText: { fontSize: 11 },

  // Faves panel
  favesPanel: { width: 120, marginLeft: 14, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden' },
  favesPanelHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 },
  favesPanelHeadText: { color: '#FFD700', fontSize: 13, fontWeight: '700', marginLeft: 4 },
  faveFeatCard: { marginHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  faveFeatGrad: { height: 126 },
  faveFeatTitle: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  favesEmptyCard: { marginHorizontal: 6, height: 126, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  favesEmptyText: { color: 'rgba(83,74,183,0.5)', fontSize: 10, textAlign: 'center', marginTop: 4 },
  favesPanelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  favesRemoveBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#E5534B', alignItems: 'center', justifyContent: 'center' },
  favesCountText: { fontSize: 11, fontWeight: '500' },
  favesAddBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#534AB7', alignItems: 'center', justifyContent: 'center' },


  // Badges
  badgeCountText: { fontSize: 10 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeOuter: { width: '22%', margin: '1.5%' },
  badgeCard: { paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, alignItems: 'center', minHeight: 80, backgroundColor: 'rgba(255,255,255,0.04)' },
  badgeIcon: { fontSize: 24, marginBottom: 5 },
  badgeName: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13, paddingHorizontal: 2 },
  seeAllBadgesBtn: { paddingVertical: 8, alignItems: 'center' },
  seeAllBadgesText: { color: '#534AB7', fontSize: 11, fontWeight: '500' },

  // Creator
  creatorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(83,74,183,0.08)', borderWidth: 1, borderColor: 'rgba(83,74,183,0.3)', borderRadius: 16, padding: 16 },
  creatorIconWrap: { backgroundColor: 'rgba(83,74,183,0.2)', borderRadius: 20, padding: 8 },
  creatorInfo: { flex: 1, marginLeft: 12 },
  creatorTitle: { fontSize: 14, fontWeight: '600' },
  creatorSub: { fontSize: 11, marginTop: 2 },

  // Modals shared
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },

  // All-badges modal
  badgesModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, maxHeight: '85%' },
  badgesModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  badgesModalTitle: { fontSize: 15, fontWeight: 'bold' },
  badgesModalSub: { fontSize: 10, marginTop: 3 },
  gradeLegendRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, flexWrap: 'wrap' },
  gradeLegendChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginRight: 6, marginBottom: 6 },
  gradeLegendText: { fontSize: 10, fontWeight: '600', paddingRight: 2 },
  badgesScrollArea: { paddingHorizontal: 20, paddingBottom: 30 },
  gradeGroup: { marginBottom: 20 },
  gradeGroupTitle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  gradeBadgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  fullBadgeCard: { width: '48%', margin: '1%', padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start' },
  fullBadgeCardLocked: { backgroundColor: 'rgba(255,255,255,0.02)' },
  fullBadgeIcon: { fontSize: 22, marginRight: 8, marginTop: 1 },
  fullBadgeInfo: { flex: 1 },
  fullBadgeName: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  fullBadgeDesc: { fontSize: 10, marginTop: 2, lineHeight: 14 },
  fullBadgeLocked: { fontSize: 9, marginTop: 4 },

  // Add Fave modal
  addFaveSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, maxHeight: '72%' },
  addFaveHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  addFaveTitle: { fontSize: 17, fontWeight: 'bold' },
  addFaveTabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 14 },
  addFaveTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  addFaveTabActive: { backgroundColor: '#534AB7' },
  addFaveTabText: { fontSize: 13, fontWeight: '600' },
  addFaveSearchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  addFaveSearchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  addFaveList: { paddingHorizontal: 20, paddingBottom: 24 },
  addFaveItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  addFaveItemThumb: { width: 44, height: 44, borderRadius: 8 },
  addFaveItemInfo: { flex: 1, marginLeft: 12 },
  addFaveItemTitle: { fontSize: 14, fontWeight: '600' },
  addFaveItemMeta: { fontSize: 11, marginTop: 2 },
});
