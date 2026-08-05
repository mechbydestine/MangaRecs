import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Easing, RefreshControl,
} from 'react-native';
import { profileAccent } from '../utils/profileThemes';
// expo-image rather than RN's Image: these are remote avatars/covers and
// RN's Android disk cache is effectively absent, so they re-downloaded on
// every render. cachePolicy defaults to 'disk'.
import { Image } from 'expo-image';

import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigation, useRoute, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { supabase } from '../supabase';
import { sendFriendRequestPush } from '../utils/pushNotifications';
import { showAppToast } from '../utils/appToast';
import { getBlockedIds } from '../utils/blocking';
import { MangaCover } from '../utils/mangaCovers';
import { ALL_BADGES, BADGE_GRADES, computeEarnedBadgeIds, profileToBadgeStats } from '../utils/badges';
import { fetchPopularManga } from '../utils/mangaDexApi';
import { prewarmCoverCache } from '../utils/mangaCovers';
import StarLogo from '../components/StarLogo';
import BadgeIcon from '../components/BadgeIcon';
import { computePresenceStatus, PRESENCE_COLORS, PRESENCE_LABELS } from '../utils/presence';
import { light } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useResponsive } from '../utils/responsive';
import { HIT_SLOP } from '../utils/tokens';

// Persisted map of partnerId → last time the user opened that DM thread.
// Survives restarts so unread badges stay cleared even if the server-side
// read_at write raced or failed.
const DM_OPENED_KEY = '@mangarecs_dm_opened_at';

const BLOCKED_DOMAINS = [
  'mega.nz', 'drive.google.com', 'mediafire.com', 'zippyshare.com',
  'uploaded.net', 'rapidgator.net', '4shared.com', 'wetransfer.com', 'sendspace.com',
];

function containsBlockedDomain(text) {
  const lower = (text || '').toLowerCase();
  return BLOCKED_DOMAINS.some((d) => lower.includes(d));
}

const REPORT_REASONS = ['Piracy link', 'Copyrighted content', 'Harassment', 'Spam', 'Other'];

function formatTime(hours) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours)}h`;
}

// Profile color is stored as a theme ID ('default','rose',…), not a hex value
const themeColor = profileAccent;

// Strip known garbage values that get written to currently_reading
const JUNK_READING = /do not sell|privacy policy|terms of|cookie|gdpr|opt.out/i;
function sanitizeReading(title) {
  if (!title) return null;
  const t = title.trim();
  if (!t || t.startsWith('http')) return null;
  if (JUNK_READING.test(t)) return null;
  if (/\.(com|net|io|org|me|gg|pro|xyz|app|moe)\b/.test(t.toLowerCase())) return null;
  return t;
}

// Shared avatar circle — shows real image if available, else initials
function AvatarCircle({ username, avatarUrl, color, size = 40, style }) {
  const initial = (username || '?').charAt(0).toUpperCase();
  const bg = themeColor(color);
  const r = size / 2;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {avatarUrl
        ? <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: 'bold' }}>{initial}</Text>}
    </View>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return 'now';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RareBadge({ badgeId }) {
  const badge = ALL_BADGES.find(b => b.id === badgeId);
  if (!badge) return null;
  if (!['purple', 'gold', 'mythic'].includes(badge.grade)) return null;
  // The shield already carries the tier color — no pill wrapper needed
  return (
    <View style={{ marginRight: 3, marginTop: 2 }}>
      <BadgeIcon badge={badge} size={16} />
    </View>
  );
}

// Highest-tier badge a user has earned — mythic > gold > purple > indigo > blue > green > grey
const LB_GRADE_RANK = { mythic: 0, gold: 1, purple: 2, indigo: 3, blue: 4, green: 5, grey: 6 };
function topBadgeFor(badgeIds) {
  if (!badgeIds?.length) return null;
  let best = null;
  for (const id of badgeIds) {
    const badge = ALL_BADGES.find((b) => b.id === id);
    if (!badge) continue;
    if (!best || (LB_GRADE_RANK[badge.grade] ?? 9) < (LB_GRADE_RANK[best.grade] ?? 9)) best = badge;
  }
  return best;
}

// Pinned showcase shields per leaderboard row — the user's chosen badges,
// falling back to their single highest-tier badge when nothing is pinned.
// Plain shields, no pill wrapper: the shield IS the badge shape.
function FeaturedBadgeStat({ entry }) {
  let badges = (entry?.showcase || [])
    .map((id) => ALL_BADGES.find((b) => b.id === id))
    .filter(Boolean);
  if (badges.length === 0) {
    const top = topBadgeFor(entry?.badges);
    if (top) badges = [top];
  }
  if (badges.length === 0) return null;
  return (
    <View style={lbFeaturedStyles.row}>
      {badges.map((b) => <BadgeIcon key={b.id} badge={b} size={24} />)}
    </View>
  );
}
const lbFeaturedStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

// Friend avatar with a corner presence dot — tap to peek status/reading via
// toast, long-press to open their profile. Replaces the old always-expanded
// "Friends Reading" list with a compact strip that scales to any friend count.
function FriendAvatarStatus({ friend, onPeek, onOpenProfile }) {
  const { colors } = useTheme();
  const t = useT();
  const scale = useRef(new Animated.Value(1)).current;
  const status = friend.presenceStatus;
  const dotColor = PRESENCE_COLORS[status];

  function handlePress() {
    light();
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 10 }),
    ]).start();
    onPeek(friend);
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={() => onOpenProfile(friend)}
      delayLongPress={380}
      activeOpacity={0.85}
      style={styles.friendAvatarItem}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.friendAvatarWrap}>
          <AvatarCircle username={friend.name} avatarUrl={friend.avatarUrl} color={friend.color} size={54} />
          <View style={[styles.presenceDot, { backgroundColor: dotColor, borderColor: colors.background }]}>
            {status === 'busy' && <Ionicons name="close" size={8} color="#fff" style={{ fontWeight: '900' }} />}
          </View>
        </View>
      </Animated.View>
      <Text style={[styles.friendAvatarName, { color: colors.text }]} numberOfLines={1}>{friend.name}</Text>
    </TouchableOpacity>
  );
}

// Animates its own fill width whenever `pct` changes, so results settle in
// smoothly instead of snapping — the poll card's own bars, plus the ones on
// AllDiscussionsScreen reuse the same easing for consistency.
function PollOptionBar({ opt, pct, count, hasVoted, isSelected, loading, onVote, colors }) {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: hasVoted ? Math.max(pct, 2) : 0,
      duration: 480,
      useNativeDriver: false,
    }).start();
  }, [pct, hasVoted]);

  function handlePress() {
    if (loading) return;
    light();
    Animated.sequence([
      Animated.spring(pressScale, { toValue: 0.98, useNativeDriver: true, speed: 90, bounciness: 0 }),
      Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
    onVote(opt.id);
  }

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        disabled={loading}
        style={[styles.pollOption, { borderColor: isSelected ? colors.primary : colors.border }]}
      >
        {hasVoted && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pollOptionFill,
              {
                width: fillAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: isSelected ? 'rgba(123,92,255,0.22)' : colors.inputBg,
              },
            ]}
          />
        )}
        <View style={styles.pollOptionContent}>
          {isSelected
            ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginRight: 10 }} />
            : <View style={[styles.pollDot, { borderColor: hasVoted ? colors.border : 'rgba(123,92,255,0.5)' }]} />
          }
          <Text style={[styles.pollOptionLabel, { color: isSelected ? '#A09CE0' : colors.text }]} numberOfLines={1}>
            {opt.label}
          </Text>
          {hasVoted && (
            <Text style={[styles.pollPct, { color: isSelected ? colors.primary : colors.muted }]}>{pct}%</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function PollCard({ poll, voteCounts, totalVotes, myVote, onVote, loading, justVoted }) {
  const { colors } = useTheme();
  const t = useT();
  const options = Array.isArray(poll?.options) ? poll.options : [];
  const hasVoted = myVote != null;
  const cardScale = useRef(new Animated.Value(0.97)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 160 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [poll?.id]);

  const hoursLeft = poll?.ends_at ? (new Date(poll.ends_at) - Date.now()) / 3600000 : 168;
  const daysLeft = Math.max(0, Math.ceil(hoursLeft / 24));
  const endingSoon = hoursLeft > 0 && hoursLeft < 24;
  const expiryText =
    hoursLeft <= 0 ? 'Poll ended' :
    endingSoon ? `${Math.max(1, Math.round(hoursLeft))}h left` :
    daysLeft === 1 ? 'Ends tomorrow' :
    `${daysLeft} days left`;

  return (
    <Animated.View style={[styles.pollCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
      <View style={[styles.pollHeader, { justifyContent: 'flex-end' }]}>
        {justVoted ? (
          <View style={[styles.liveChip, { backgroundColor: 'rgba(29,158,117,0.15)', borderColor: 'rgba(29,158,117,0.3)' }]}>
            <Ionicons name="checkmark-circle" size={11} color="#1D9E75" />
            <Text style={[styles.liveText, { color: '#1D9E75', marginLeft: 3 }]}>{t('community.voted')}</Text>
          </View>
        ) : (
          <View style={[styles.liveChip, endingSoon && { backgroundColor: 'rgba(239,159,39,0.15)', borderColor: 'rgba(239,159,39,0.3)' }]}>
            <View style={[styles.liveDot, endingSoon && { backgroundColor: '#EF9F27' }]} />
            <Text style={[styles.liveText, endingSoon && { color: '#EF9F27' }]}>{endingSoon ? expiryText.toUpperCase() : 'LIVE'}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.pollQuestion, { color: colors.text }]}>{poll.question}</Text>
      {!hasVoted && (
        <Text style={[styles.pollHint, { color: colors.muted }]}>{t('community.tapToVote')}</Text>
      )}

      {options.map((opt) => (
        <PollOptionBar
          key={opt.id}
          opt={opt}
          pct={totalVotes > 0 ? Math.round((voteCounts[opt.id] || 0) / totalVotes * 100) : 0}
          count={voteCounts[opt.id] || 0}
          hasVoted={hasVoted}
          isSelected={myVote === opt.id}
          loading={loading}
          onVote={onVote}
          colors={colors}
        />
      ))}

      <View style={styles.pollFooterRow}>
        <Ionicons name="people-outline" size={12} color={colors.muted} />
        <Text style={[styles.pollFooter, { color: colors.muted }]}>
          {totalVotes.toLocaleString()} {totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
        <View style={styles.pollFooterDot} />
        <Ionicons name="time-outline" size={12} color={endingSoon ? '#EF9F27' : colors.muted} />
        <Text style={[styles.pollFooter, { color: endingSoon ? '#EF9F27' : colors.muted }]}>{expiryText}</Text>
      </View>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

// One screen, two surfaces.
//
// The old Social tab mixed a public square (discussions, the weekly poll,
// leaderboard) with a private inbox (friend requests, friends, DMs). Those are
// different behaviours — a community space is browsed, an inbox is checked — and
// merging them made the unread badge ambiguous: you couldn't tell whether
// someone messaged you or a poll closed.
//
// They're now two destinations driven by `mode`, sharing one component because
// they share loaders, realtime channels and modals:
//   'community' (default) → the Community tab
//   'messages'            → pushed from the Home header's ✉ icon, and from Profile
export default function SocialScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isMessages = route?.params?.mode === 'messages';
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isTablet: IS_TABLET } = useResponsive();
  const scrollRef = useRef(null);
  const uidRef = useRef(null);
  const logoRef = useRef(null);
  // Per-partner timestamp of when the user last opened that DM thread — used
  // to clear unread badges instantly and to ignore the markRead race on focus
  const dmOpenedAtRef = useRef({});

  // Hydrate the opened-at map from storage (keeping the newest timestamp per
  // thread), then recount so badges for already-read threads don't reappear
  // after an app restart or after a DM was opened from a notification
  async function hydrateDmOpened() {
    try {
      const raw = await AsyncStorage.getItem(DM_OPENED_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      for (const [k, v] of Object.entries(stored)) {
        if (!dmOpenedAtRef.current[k] || v > dmOpenedAtRef.current[k]) dmOpenedAtRef.current[k] = v;
      }
    } catch (_) {}
  }

  useEffect(() => {
    hydrateDmOpened().then(() => { if (uidRef.current) loadDMConvos(uidRef.current); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recordDmOpened(partnerId) {
    dmOpenedAtRef.current[partnerId] = Date.now();
    AsyncStorage.setItem(DM_OPENED_KEY, JSON.stringify(dmOpenedAtRef.current)).catch(() => {});
  }
  useScrollToTop(scrollRef);

  // Content entrance — fade + rise on every focus for a polished feel
  const contentAnim = useRef(new Animated.Value(0)).current;

  // Tab-icon tap while already on this tab → same refresh + logo spin as pull-to-refresh
  useEffect(() => {
    if (route.params?.refreshAt) { logoRef.current?.spin(); onRefresh(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.refreshAt]);

  useFocusEffect(useCallback(() => {
    if (uidRef.current) {
      loadFriends(uidRef.current);
      hydrateDmOpened().then(() => loadDMConvos(uidRef.current));
    }
    contentAnim.setValue(0);
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []));

  const contentTranslateY = contentAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  // Existing state
  const [friends, setFriends] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState('global'); // 'global' | 'friends'
  const [leaderboardMetric, setLeaderboardMetric] = useState('hours'); // 'hours' | 'chapters' | 'streak'
  const [suggestedFriends, setSuggestedFriends] = useState([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [discussionSeries, setDiscussionSeries] = useState([]);
  const [reportItem, setReportItem] = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportToast, setReportToast] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [requestSentTo, setRequestSentTo] = useState({});

  // Poll state
  const [poll, setPoll] = useState(null);
  const [pollLoading, setPollLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [myVote, setMyVote] = useState(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [justVoted, setJustVoted] = useState(false);

  // DM conversations state
  const [dmConvos, setDmConvos] = useState([]);
  const [friendsError, setFriendsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [peekFriendId, setPeekFriendId] = useState(null);

  // AI-ranked trending discussions — recent comment velocity + total volume +
  // a boost for series matching the reader's own top genres. Falls back to
  // fetchPopularManga only if the RPC returns nothing (e.g. brand-new DB).
  async function loadDiscussions(uid) {
    try {
      const { data, error } = await supabase.rpc('get_trending_discussions', { p_user_id: uid, p_limit: 10 });
      if (!error && data?.length) {
        setDiscussionSeries(data.map((d) => ({
          id: `disc-${d.series_title}`,
          title: d.series_title,
          searchKey: d.search_key || d.series_title,
          lang: d.lang || 'ja',
          latestChapter: d.chapters || 0,
          discussing: Number(d.total_count) || 0,
          recentCount: Number(d.recent_count) || 0,
          color: d.color || '#1A1A2E',
        })));
        return;
      }
    } catch (_) {}

    // Fallback: popular + recently-read merge (pre-RPC behavior)
    try {
      const [popular, rpResult] = await Promise.all([
        fetchPopularManga({ limit: 20 }),
        uid
          ? supabase
              .from('reading_progress')
              .select('series_title, current_chapter, total_chapters')
              .eq('user_id', uid)
              .order('updated_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ]);

      const rpData = rpResult?.data || [];
      popular.forEach((m) => { if (m.coverUrl) prewarmCoverCache(m.title, m.lang, m.coverUrl); });

      const recentlyRead = rpData.map((r, i) => ({
        id: `rp-${r.series_title}-${i}`,
        title: r.series_title,
        searchKey: r.series_title,
        lang: 'ja',
        latestChapter: r.current_chapter || r.total_chapters || 0,
        discussing: 0,
        color: '#1A1A2E',
      }));

      const seenTitles = new Set(recentlyRead.map((r) => r.title.toLowerCase()));
      const fillFromPopular = popular
        .filter((m) => !seenTitles.has(m.title.toLowerCase()))
        .slice(0, Math.max(0, 10 - recentlyRead.length));

      const merged = [...recentlyRead, ...fillFromPopular].slice(0, 10);
      if (!merged.length) return;

      const titles = merged.map((s) => s.title);
      const { data: commentRows } = await supabase
        .from('comments')
        .select('series_title')
        .in('series_title', titles);

      if (commentRows && commentRows.length > 0) {
        const countMap = {};
        commentRows.forEach((c) => { countMap[c.series_title] = (countMap[c.series_title] || 0) + 1; });
        setDiscussionSeries(merged.map((s) => ({ ...s, discussing: countMap[s.title] || s.discussing || 0 })));
      } else {
        setDiscussionSeries(merged);
      }
    } catch (_) {}
  }

  useEffect(() => {
    let presenceChannel = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        const uid = session.user.id;
        uidRef.current = uid;
        setCurrentUserId(uid);
        loadFriends(uid);
        loadDMConvos(uid);
        loadPendingRequests(uid);
        loadLeaderboard(uid);
        loadSuggestedFriends(uid);
        loadPoll(uid);
        loadDiscussions(uid);
      } else {
        loadDiscussions(null);
      }
    });

    // Real-time online presence: update friends' online status when profiles change
    // Channel name must be unique per mount: supabase-js returns the existing
    // (already-subscribed) channel for a reused name, and adding postgres_changes
    // callbacks to it throws "cannot add callbacks ... after subscribe()".
    presenceChannel = supabase
      .channel(`social-presence-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const updated = payload.new;
        if (updated?.id) {
          setFriends((prev) =>
            prev.map((f) =>
              f.id === updated.id
                ? {
                    ...f,
                    online: updated.online ?? f.online,
                    reading: updated.currently_reading ?? f.reading,
                    chapter: updated.current_chapter ?? f.chapter,
                    presenceStatus: computePresenceStatus(updated),
                  }
                : f
            )
          );
        }
      })
      .subscribe();

    return () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
    };
  }, []);

  // Separate effect: realtime DM subscription — refreshes conversation list when messages arrive or are sent
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const dmChannel = supabase
      .channel(`social-dm-${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${uid}` },
        () => { loadDMConvos(uid); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${uid}` },
        () => { loadDMConvos(uid); }
      )
      .on(
        'postgres_changes',
        // read_at updates (messages marked read in DMScreen) — clears unread badges live
        { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${uid}` },
        () => { loadDMConvos(uid); }
      )
      .subscribe();
    return () => { supabase.removeChannel(dmChannel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Poll ────────────────────────────────────────────────────────────────────

  async function loadPoll(uid) {
    setPollLoading(true);
    try {
      const { data: pollData } = await supabase
        .rpc('get_or_create_weekly_poll')
        .maybeSingle();

      if (!pollData) { setPollLoading(false); return; }
      setPoll(pollData);

      const [votesRes, myVoteRes] = await Promise.all([
        supabase.from('poll_votes').select('option_id').eq('poll_id', pollData.id),
        uid
          ? supabase.from('poll_votes').select('option_id').eq('poll_id', pollData.id).eq('user_id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (votesRes.data) {
        const counts = {};
        votesRes.data.forEach(v => { counts[v.option_id] = (counts[v.option_id] || 0) + 1; });
        setVoteCounts(counts);
        setTotalVotes(votesRes.data.length);
      }

      if (myVoteRes.data?.option_id) setMyVote(myVoteRes.data.option_id);
    } catch (_) {}
    setPollLoading(false);
  }

  async function handleVote(optionId) {
    if (!currentUserId || !poll || voteSubmitting) return;
    setVoteSubmitting(true);

    const prevVote = myVote;
    const prevCounts = { ...voteCounts };
    const prevTotal = totalVotes;

    // Optimistic update
    const newCounts = { ...voteCounts };
    if (prevVote && prevVote !== optionId) {
      newCounts[prevVote] = Math.max(0, (newCounts[prevVote] || 0) - 1);
    }
    if (prevVote !== optionId) {
      newCounts[optionId] = (newCounts[optionId] || 0) + 1;
    }
    setMyVote(optionId);
    setVoteCounts(newCounts);
    if (!prevVote) setTotalVotes(t => t + 1);

    const { error } = await supabase.rpc('cast_poll_vote', {
      p_poll_id: poll.id,
      p_option_id: optionId,
    });

    if (error) {
      setMyVote(prevVote);
      setVoteCounts(prevCounts);
      setTotalVotes(prevTotal);
      showAppToast("Vote didn't go through — try again");
    } else {
      setJustVoted(true);
      setTimeout(() => setJustVoted(false), 2500);
      // Re-fetch for accuracy after server confirms
      const { data: freshVotes } = await supabase
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', poll.id);
      if (freshVotes) {
        const counts = {};
        freshVotes.forEach(v => { counts[v.option_id] = (counts[v.option_id] || 0) + 1; });
        setVoteCounts(counts);
        setTotalVotes(freshVotes.length);
      }
    }

    setVoteSubmitting(false);
  }

  // ── Friends ─────────────────────────────────────────────────────────────────

  async function loadSuggestedFriends(uid) {
    const { data, error } = await supabase.rpc('get_suggested_friends', {
      p_user_id: uid,
      p_limit: 5,
    });
    if (!error && data) {
      const blocked = await getBlockedIds(uid);
      setSuggestedFriends(data.filter((f) => !blocked.has(f.id)));
    }
  }

  async function loadFriends(userId) {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) { setFriendsError(true); setFriends([]); return; }
    setFriendsError(false);
    if (!rows || rows.length === 0) { setFriends([]); return; }

    const blocked = await getBlockedIds(userId);
    const friendIds = rows
      .map(f => f.requester_id === userId ? f.addressee_id : f.requester_id)
      .filter((fid) => !blocked.has(fid));
    if (friendIds.length === 0) { setFriends([]); return; }

    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, username, display_name, color, avatar_url, online, currently_reading, current_chapter, is_busy, last_active_at, show_activity')
      .in('id', friendIds);

    if (pErr) { setFriendsError(true); setFriends([]); return; }

    const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    setFriends(
      friendIds
        .map(id => {
          const p = byId[id];
          if (!p) return null;
          return {
            id: p.id,
            name: p.display_name || p.username || 'Unknown',
            avatarUrl: p.avatar_url || null,
            color: p.color || 'default',
            online: p.online || false,
            reading: p.currently_reading || null,
            chapter: p.current_chapter || 0,
            presenceStatus: computePresenceStatus(p),
          };
        })
        .filter(Boolean)
    );
  }

  async function loadDMConvos(uid) {
    const { data } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, message_type, manga_data, read_at, created_at')
      .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!data || data.length === 0) { setDmConvos([]); return; }

    // Group by conversation partner, keep most recent message per partner.
    // Messages older than the moment the user opened that thread count as read
    // even if read_at hasn't committed yet — the focus reload races DMScreen's
    // markRead write, and losing that race left stale unread badges behind.
    const byPartner = {};
    for (const msg of data) {
      const partnerId = msg.sender_id === uid ? msg.recipient_id : msg.sender_id;
      if (!byPartner[partnerId]) {
        byPartner[partnerId] = { lastMsg: msg, unread: 0 };
      }
      const seenLocally = new Date(msg.created_at).getTime() <= (dmOpenedAtRef.current[partnerId] || 0);
      if (msg.recipient_id === uid && !msg.read_at && !seenLocally) {
        byPartner[partnerId].unread++;
      }
    }

    const blocked = await getBlockedIds(uid);
    const partnerIds = Object.keys(byPartner).filter((pid) => !blocked.has(pid));
    if (!partnerIds.length) { setDmConvos([]); return; }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, color, avatar_url')
      .in('id', partnerIds);

    if (!profiles) return;
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));

    const convos = partnerIds
      .map((partnerId) => {
        const p = byId[partnerId];
        if (!p) return null;
        const { lastMsg, unread } = byPartner[partnerId];
        let preview;
        if (lastMsg.message_type === 'recommendation') {
          const t = lastMsg.manga_data?.title;
          preview = lastMsg.sender_id === uid
            ? `You: 📚 ${t || 'Manga recommendation'}`
            : `📚 ${t || 'Manga recommendation'}`;
        } else if (lastMsg.message_type === 'image') {
          preview = lastMsg.sender_id === uid ? 'You: 📷 Photo' : '📷 Photo';
        } else {
          preview = lastMsg.sender_id === uid
            ? `You: ${lastMsg.content || ''}`
            : lastMsg.content || '';
        }
        return {
          friendId: partnerId,
          friend: { name: p.display_name || p.username || 'Friend', color: p.color, avatarUrl: p.avatar_url },
          preview,
          lastTime: timeAgo(lastMsg.created_at),
          unread,
          sortKey: new Date(lastMsg.created_at).getTime(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.sortKey - a.sortKey);

    setDmConvos(convos);
  }

  const LB_METRIC_COL = { hours: 'hours_read', chapters: 'chapters_read', streak: 'streak_count' };
  const lbMetricMounted = useRef(false);

  useEffect(() => {
    if (!lbMetricMounted.current) { lbMetricMounted.current = true; return; }
    if (currentUserId) loadLeaderboard(currentUserId, leaderboardMetric);
  }, [leaderboardMetric]);

  async function loadLeaderboard(uid, metric = 'hours') {
    setLeaderboardLoading(true);
    const orderCol = LB_METRIC_COL[metric] || 'hours_read';
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, color, chapters_read, hours_read, streak_count, avatar_url, friends_count, comments_count, likes_given, series_count, completed_count, showcase_badges')
      .not('username', 'is', null)
      .neq('username', '')
      .or('hours_read.gt.0,chapters_read.gt.0')
      .order(orderCol, { ascending: false })
      .limit(50);
    if (!error && data) {
      const entries = data.map((p) => {
        const stats = profileToBadgeStats(p);
        const earnedSet = computeEarnedBadgeIds(stats);
        // Their pinned showcase, validated against what they actually earned
        const showcase = (Array.isArray(p.showcase_badges) ? p.showcase_badges : [])
          .filter((id) => earnedSet.has(id))
          .slice(0, 3);
        return {
          id: p.id,
          name: p.display_name || p.username || 'Reader',
          avatar: (p.display_name || p.username || '?').charAt(0).toUpperCase(),
          avatarUrl: p.avatar_url || null,
          color: p.color,
          hours: p.hours_read || 0,
          chapters: p.chapters_read || 0,
          streak: p.streak_count || 0,
          badges: Array.from(earnedSet),
          showcase,
          online: false,
          isMe: p.id === uid,
        };
      });
      setLeaderboard(entries);
    }
    setLeaderboardLoading(false);
  }

  async function loadPendingRequests(uid) {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, requester_id')
      .eq('addressee_id', uid)
      .eq('status', 'pending');
    if (error || !rows || rows.length === 0) { setPendingRequests([]); return; }

    const requesterIds = rows.map(r => r.requester_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, color, avatar_url, chapters_read, favorite_genre')
      .in('id', requesterIds);

    if (!profiles) return;
    const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    setPendingRequests(
      rows.map(r => {
        const p = byId[r.requester_id];
        if (!p) return null;
        return { friendshipId: r.id, ...p };
      }).filter(Boolean)
    );
  }

  async function handleAcceptRequest(friendshipId) {
    const req = pendingRequests.find((r) => r.friendshipId === friendshipId);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (!error) {
      setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      if (currentUserId) loadFriends(currentUserId);
      if (req?.id) {
        supabase.from('notifications').insert({
          user_id: req.id,
          actor_id: currentUserId,
          type: 'friend_accepted',
          data: {},
        }).then(() => {});
      }
    }
  }

  async function handleDeclineRequest(friendshipId) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (!error) {
      setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    }
  }

  async function handleSearch() {
    const q = searchQuery.trim().replace(/^@/, '');
    if (!q) return;
    setSearchLoading(true);
    setSearchError('');

    // Substring match (not just exact) so "des" finds "destinekene" — matching
    // usernames were previously only found by typing the complete username.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, chapters_read, favorite_genre, color, avatar_url, banner_url')
      .ilike('username', `%${q}%`)
      .not('username', 'is', null)
      .neq('username', '')
      .limit(8);

    setSearchLoading(false);
    if (error) { setSearchError('Search failed. Please try again.'); setSearchResults([]); return; }
    const results = (data || []).filter((u) => u.id !== currentUserId);
    if (results.length === 0) { setSearchError(`No users found for "@${q}"`); setSearchResults([]); return; }
    setSearchResults(results);
  }

  // Live, debounced search as the user types — the explicit search button
  // still works too (e.g. after a paste), this just removes the need to tap
  // it for the common case of typing a few letters and seeing matches.
  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, '');
    if (q.length < 2) { setSearchResults([]); setSearchError(''); return; }
    const timer = setTimeout(handleSearch, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function handleAddFriend(userId) {
    if (!currentUserId || !userId) return;

    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(requester_id.eq.${currentUserId},addressee_id.eq.${userId}),` +
        `and(requester_id.eq.${userId},addressee_id.eq.${currentUserId})`
      )
      .maybeSingle();

    if (existing) {
      setRequestSentTo((prev) => ({ ...prev, [userId]: existing.status }));
      return;
    }

    const { data: newFriendship, error } = await supabase
      .from('friendships')
      .insert({ requester_id: currentUserId, addressee_id: userId, status: 'pending' })
      .select('id')
      .maybeSingle();

    if (error) { setSearchError('Failed to send request. Please try again.'); return; }
    if (newFriendship?.id) {
      setRequestSentTo((prev) => ({ ...prev, [userId]: 'pending' }));
      loadSuggestedFriends(currentUserId);
      supabase.from('notifications').insert({
        user_id: userId,
        actor_id: currentUserId,
        type: 'friend_request',
        data: { friendship_id: newFriendship.id },
      }).then(() => {});
      // notify-user derives the requester's name from the JWT — no lookup needed.
      sendFriendRequestPush(userId).catch(() => {});
    }
  }

  function openDiscussion(item) {
    navigation.navigate('Discussion', {
      ...item,
      latestChapter: item.latestChapter ?? item.chapters,
      discussing: item.discussing ?? 0,
    });
  }

  // Short tap on a friend's avatar: peek what they're reading, or their status
  function handlePeekFriend(friend) {
    const validReading = sanitizeReading(friend.reading);
    if (friend.presenceStatus !== 'offline' && validReading) {
      showAppToast(`📖 ${friend.name} is reading ${validReading}${friend.chapter ? ` · Ch. ${friend.chapter}` : ''}`, 'info');
    } else {
      const emoji = friend.presenceStatus === 'online' ? '🟢' : friend.presenceStatus === 'idle' ? '🟡' : friend.presenceStatus === 'busy' ? '🔴' : '⚪';
      showAppToast(`${emoji} ${friend.name} is ${PRESENCE_LABELS[friend.presenceStatus]}`, 'info');
    }
  }

  function handleOpenFriendProfile(friend) {
    navigation.navigate('FriendProfile', { id: friend.id });
  }

  async function onRefresh() {
    setRefreshing(true);
    logoRef.current?.spin();
    const uid = uidRef.current;
    await Promise.all([
      loadFriends(uid),
      loadDMConvos(uid),
      loadPendingRequests(uid),
      loadPoll(uid),
      loadDiscussions(uid),
      loadSuggestedFriends(uid),
    ]);
    setRefreshing(false);
  }

  function closeAddFriend() {
    setShowAddFriend(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
  }

  function getAddLabel(userId) {
    const s = requestSentTo[userId];
    if (s === 'accepted') return 'Friends';
    if (s === 'pending') return 'Sent';
    return 'Add';
  }

  function openReader(series) {
    navigation.navigate('Reader', {
      searchQuery: series.searchKey || series.title,
      title: series.title,
      chapters: series.chapters || 1,
      lang: series.lang || 'ja',
    });
  }

  async function submitReport(reason) {
    if (!reportItem) return;
    setReportSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('reports').insert({
        reporter_id: user?.id || currentUserId,
        content_id: String(reportItem.id),
        content_type: 'series_discussion',
        content_snapshot: reportItem.title || '',
        reason,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}
    setReportSubmitting(false);
    setReportItem(null);
    setReportToast(true);
    setTimeout(() => setReportToast(false), 2000);
  }

  const friendIdSet = new Set(friends.map((f) => f.id));
  const LB_METRIC_KEY = { hours: 'hours', chapters: 'chapters', streak: 'streak' };
  const sortedLeaderboard = [...leaderboard]
    .filter((e) => leaderboardScope === 'global' || e.isMe || friendIdSet.has(e.id))
    .sort((a, b) => b[LB_METRIC_KEY[leaderboardMetric]] - a[LB_METRIC_KEY[leaderboardMetric]]);

  const totalDmUnread = dmConvos.reduce((n, c) => n + c.unread, 0);
  const dmFriendIdSet = new Set(dmConvos.map((c) => c.friendId));
  const friendsWithoutThread = friends.filter((f) => !dmFriendIdSet.has(f.id));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

        <Animated.View style={[IS_TABLET ? styles.tabletWrap : null, { opacity: contentAnim, transform: [{ translateY: contentTranslateY }] }]}>
        {/* Header. This was a tab root until the 4-tab restructure; it now opens
            as a pushed screen from Profile, so it needs its own way back. */}
        <View style={styles.header}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <StarLogo ref={logoRef} size={32} />
          )}
          <Text style={[styles.headerTitle, { color: colors.text }]}>{isMessages ? 'Messages' : 'Community'}</Text>
          <View style={styles.headerButtons}>
            {isMessages && (
            <TouchableOpacity style={styles.addFriendBtn} onPress={() => setShowAddFriend(true)}>
              <Ionicons name="person-add-outline" size={13} color={colors.primary} />
              <Text style={styles.addFriendText}>{t('community.addAFriend')}</Text>
            </TouchableOpacity>
            )}
            {!isMessages && (
            <TouchableOpacity style={styles.leaderboardBtn} onPress={() => setShowLeaderboard(true)}>
              <Ionicons name="trophy-outline" size={13} color="#FFD700" />
              <Text style={styles.leaderboardText}>{t('community.leaderboard')}</Text>
            </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Friend Requests — inbox, so Messages only */}
        {isMessages && pendingRequests.length > 0 && (
          <View style={styles.requestsSection}>
            <View style={styles.requestsHeader}>
              <Ionicons name="people" size={14} color={colors.primary} />
              <Text style={[styles.requestsTitle, { color: colors.text }]}>{t('messages.friendRequests')}</Text>
              <View style={styles.requestsBadge}>
                <Text style={styles.requestsBadgeText}>{pendingRequests.length}</Text>
              </View>
            </View>
            {pendingRequests.map((req) => (
              <View key={req.friendshipId} style={[styles.requestRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <AvatarCircle username={req.display_name || req.username} avatarUrl={req.avatar_url} color={req.color} size={36} style={{ marginRight: 10 }} />
                <View style={styles.requestInfo}>
                  <Text style={[styles.requestName, { color: colors.text }]}>{req.display_name || req.username}</Text>
                  <Text style={[styles.requestSub, { color: colors.muted }]}>
                    {req.chapters_read || 0} chapters · {req.favorite_genre || 'Reader'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptRequest(req.friendshipId)}>
                  <Ionicons name="checkmark" size={14} color="#1D9E75" />
                  <Text style={styles.acceptBtnText}>{t('messages.accept')}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={HIT_SLOP}
                  style={[styles.declineBtn, { borderColor: colors.border }]}
                  onPress={() => handleDeclineRequest(req.friendshipId)}
                  accessibilityRole="button"
                  accessibilityLabel="Decline friend request">
                  <Ionicons name="close" size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {friendsError && (
          <View style={[styles.errorBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.muted} />
            <Text style={[styles.errorBannerText, { color: colors.muted }]}>{t('messages.couldntLoadFriends')}</Text>
            <TouchableOpacity onPress={() => uidRef.current && loadFriends(uidRef.current)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.errorBannerRetry}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Friends ── inbox-side, so Messages only */}
        {isMessages && (<>
        {friends.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('messages.friends')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.friendStripRow}
              contentContainerStyle={{ paddingRight: 20 }}>
              {friends.map((friend) => (
                <FriendAvatarStatus
                  key={friend.id}
                  friend={friend}
                  onPeek={handlePeekFriend}
                  onOpenProfile={handleOpenFriendProfile}
                />
              ))}
            </ScrollView>
          </>
        ) : (!friendsError && (
          <TouchableOpacity
            style={[styles.noFriendsHint, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowAddFriend(true)}
            activeOpacity={0.8}>
            <Ionicons name="people-outline" size={18} color={colors.muted} />
            <Text style={[styles.noFriendsHintText, { color: colors.muted }]}>
              No friends yet — tap to find readers to follow
            </Text>
          </TouchableOpacity>
        ))}

        {/* ── Direct Messages ── listed inline, Discord-style. This screen IS
            the inbox, so hiding every thread behind one row and a bottom sheet
            cost a tap and buried the unread state that matters most. */}
        <View style={styles.dmSectionHeader}>
          <Text style={[styles.dmSectionTitle, { color: colors.muted }]}>{t('messages.directMessages')}</Text>
          {totalDmUnread > 0 && (
            <View style={styles.dmTotalBadge}>
              <Text style={styles.dmTotalBadgeText}>{totalDmUnread}</Text>
            </View>
          )}
        </View>

        <View style={styles.dmList}>
          {dmConvos.map((convo) => (
            <TouchableOpacity
              key={convo.friendId}
              style={styles.dmRow}
              onPress={() => {
                // Opening the thread — clear its unread badge immediately
                recordDmOpened(convo.friendId);
                setDmConvos((prev) => prev.map((c) => c.friendId === convo.friendId ? { ...c, unread: 0 } : c));
                navigation.navigate('DM', {
                  friendId: convo.friendId,
                  friendName: convo.friend.name,
                  friendColor: convo.friend.color,
                  friendAvatarUrl: convo.friend.avatarUrl || null,
                });
              }}
              activeOpacity={0.6}>
              <View>
                <AvatarCircle
                  username={convo.friend.name}
                  avatarUrl={convo.friend.avatarUrl}
                  color={convo.friend.color}
                  size={44}
                />
                {convo.unread > 0 && <View style={[styles.dmUnreadDot, { borderColor: colors.background }]} />}
              </View>
              <View style={styles.dmConvoContent}>
                <View style={styles.dmConvoTopRow}>
                  <Text style={[styles.dmConvoName, { color: colors.text }, convo.unread > 0 && styles.dmConvoNameBold]} numberOfLines={1}>
                    {convo.friend.name}
                  </Text>
                  <Text style={[styles.dmConvoTime, { color: colors.muted }]}>{convo.lastTime}</Text>
                </View>
                <Text
                  style={[styles.dmConvoPreview, { color: convo.unread > 0 ? colors.text : colors.muted }, convo.unread > 0 && styles.dmConvoPreviewBold]}
                  numberOfLines={1}>
                  {convo.preview}
                </Text>
              </View>
              {convo.unread > 0 && (
                <View style={styles.dmUnreadBadge}>
                  <Text style={styles.dmUnreadText}>{convo.unread > 9 ? '9+' : convo.unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Friends with no history yet, below the real threads. Without these
              a user with friends but no messages lands on an empty inbox and
              has no way out of it. */}
          {friendsWithoutThread.map((friend) => (
            <TouchableOpacity
              key={friend.id}
              style={styles.dmRow}
              onPress={() => navigation.navigate('DM', {
                friendId: friend.id,
                friendName: friend.name,
                friendColor: friend.color,
                friendAvatarUrl: friend.avatarUrl || null,
              })}
              activeOpacity={0.6}>
              <AvatarCircle username={friend.name} avatarUrl={friend.avatarUrl} color={friend.color} size={44} />
              <View style={styles.dmConvoContent}>
                <Text style={[styles.dmConvoName, { color: colors.text }]} numberOfLines={1}>{friend.name}</Text>
                <Text style={[styles.dmConvoPreview, { color: colors.muted }]} numberOfLines={1}>{t('messages.sayHello')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.border} />
            </TouchableOpacity>
          ))}

          {dmConvos.length === 0 && friendsWithoutThread.length === 0 && (
            <Text style={[styles.emptyHint, { color: colors.muted }]}>{t('messages.noMessages')}</Text>
          )}
        </View>

        </>)}

        {/* ── Discussions ── the seed content that makes Community feel alive on
            day one, rather than shipping an empty tab and waiting for events. */}
        {!isMessages && (<>
        <TouchableOpacity
          style={styles.discHeaderRow}
          onPress={() => navigation.navigate('AllDiscussions')}
          activeOpacity={0.7}>
          <View style={styles.actTitleRow}>
            <Ionicons name="chatbubbles" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 0, marginBottom: 0, marginLeft: 6 }]}>{t('community.discussions')} </Text>
          </View>
          <View style={styles.seeAllChip}>
            <Text style={styles.seeAllChipText}>{t('common.seeAll')}</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <View style={styles.discList}>
          {discussionSeries.slice(0, 3).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.discCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openDiscussion(item)}
              activeOpacity={0.82}>
              <TouchableOpacity onPress={() => openReader(item)} activeOpacity={0.82}>
                <MangaCover
                  title={item.title}
                  searchKey={item.searchKey}
                  lang={item.lang}
                  color={item.color}
                  style={styles.discCover}
                />
              </TouchableOpacity>
              <View style={styles.discInfo}>
                <Text style={[styles.discTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.discChap, { color: colors.muted }]}>Ch. {item.latestChapter} · Latest</Text>
                <View style={styles.discCountRow}>
                  <Ionicons name="chatbubble-ellipses" size={11} color={colors.primary} />
                  <Text style={styles.discCount}>{item.discussing.toLocaleString()} discussing</Text>
                </View>
              </View>
              <View style={styles.discActions}>
                <TouchableOpacity
                  style={styles.discReportBtn}
                  onPress={(e) => { e.stopPropagation(); setReportItem(item); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="flag-outline" size={13} color={colors.muted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Poll of the Week ── */}
        <View style={[styles.actHeaderRow, { marginBottom: 10, marginTop: 8 }]}>
          <View style={styles.actTitleRow}>
            <Ionicons name="bar-chart-outline" size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 0, marginBottom: 0, marginLeft: 6 }]}>
              {t('community.pollOfTheWeek')} </Text>
          </View>
        </View>

        {pollLoading ? (
          <View style={[styles.pollCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.primary} style={styles.actLoader} />
          </View>
        ) : poll ? (
          <PollCard
            poll={poll}
            voteCounts={voteCounts}
            totalVotes={totalVotes}
            myVote={myVote}
            onVote={handleVote}
            loading={voteSubmitting}
            justVoted={justVoted}
          />
        ) : null}
        </>)}

        <View style={{ height: tabBarHeight + 8 }} />
        </Animated.View>
      </ScrollView>

      {/* ── Add Friend Modal ── */}
      <Modal visible={showAddFriend} animationType="slide" transparent onRequestClose={closeAddFriend}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeAddFriend}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('community.addAFriend')}</Text>
              <TouchableOpacity hitSlop={HIT_SLOP} onPress={closeAddFriend} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: colors.muted }]}>{t('community.searchHint')}</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder={t('placeholder.username')}
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={(t) => { setSearchQuery(t); setSearchError(''); }}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                {searchLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="search" size={16} color="#fff" />}
              </TouchableOpacity>
            </View>

            {!!searchError && <Text style={styles.searchError}>{searchError}</Text>}

            {searchResults.map((result) => (
              <View key={result.id} style={[styles.resultCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <AvatarCircle username={result.display_name || result.username} avatarUrl={result.avatar_url} color={result.color} size={38} style={{ marginRight: 10 }} />
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultName, { color: colors.text }]}>{result.display_name || result.username}</Text>
                  <Text style={[styles.resultSub, { color: colors.muted }]} numberOfLines={1}>
                    @{result.username} · {result.chapters_read || 0} chapters · {result.favorite_genre || 'Reader'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => { closeAddFriend(); navigation.navigate('FriendProfile', { id: result.id }); }}>
                  <Text style={styles.viewBtnText}>{t('tabs.profile')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addBtn, requestSentTo[result.id] && styles.addBtnSent]}
                  onPress={() => handleAddFriend(result.id)}>
                  <Ionicons
                    name={requestSentTo[result.id] ? 'checkmark' : 'person-add'}
                    size={14}
                    color={requestSentTo[result.id] ? '#1D9E75' : colors.primary}
                  />
                  <Text style={[styles.addBtnText, requestSentTo[result.id] && styles.addBtnTextSent]}>
                    {getAddLabel(result.id)}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Text style={[styles.suggestedTitle, { color: colors.muted }]}>{t('community.suggested')}</Text>
            {suggestedFriends.map((f) => (
              <View key={f.id} style={styles.suggestedRow}>
                <AvatarCircle username={f.display_name || f.username} avatarUrl={f.avatar_url} color={f.color} size={40} />
                <Text style={[styles.suggestedName, { color: colors.text }]}>{f.display_name || f.username}</Text>
                <TouchableOpacity
                  style={[styles.suggestedProfileBtn, { borderColor: colors.border }]}
                  onPress={() => { closeAddFriend(); navigation.navigate('FriendProfile', { id: f.id }); }}>
                  <Text style={[styles.suggestedProfileText, { color: colors.muted }]}>{t('tabs.profile')}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={HIT_SLOP}
                  style={[styles.suggestedAddBtn, requestSentTo[f.id] && styles.suggestedAddBtnSent]}
                  onPress={() => handleAddFriend(f.id)}>
                  <Ionicons
                    name={requestSentTo[f.id] ? 'checkmark' : 'add'}
                    size={16}
                    color={requestSentTo[f.id] ? '#1D9E75' : colors.primary}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* ── Report Modal ── */}
      <Modal visible={!!reportItem} animationType="fade" transparent onRequestClose={() => setReportItem(null)}>
        <TouchableOpacity style={styles.reportOverlay} activeOpacity={1} onPress={() => setReportItem(null)}>
          <View style={[styles.reportSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reportTitle, { color: colors.text }]}>{t('community.reportContent')}</Text>
            <Text style={[styles.reportSub, { color: colors.muted }]}>{t('discussion.whyReport')}</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reportOption, { borderColor: colors.border }]}
                onPress={() => submitReport(reason)}
                disabled={reportSubmitting}
                activeOpacity={0.75}>
                <Text style={[styles.reportOptionText, { color: colors.text }]}>{reason}</Text>
                {reportSubmitting
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="chevron-forward" size={14} color={colors.muted} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Reported toast ── */}
      {reportToast && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#1D9E75" />
          <Text style={styles.toastText}>{t('community.reported')}</Text>
        </View>
      )}

      {/* ── Leaderboard Modal ── */}
      <Modal visible={showLeaderboard} animationType="slide" transparent onRequestClose={() => setShowLeaderboard(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLeaderboard(false)}>
          <View style={[styles.lbSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <View style={styles.lbHeader}>
              <View style={styles.lbHeaderLeft}>
                <Ionicons name="trophy" size={18} color="#FFD700" />
                <Text style={[styles.lbTitle, { color: colors.text }]}>{t('community.liveLeaderboard')}</Text>
                <View style={styles.liveChip}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{t('community.live')}</Text>
                </View>
              </View>
              <TouchableOpacity hitSlop={HIT_SLOP} onPress={() => setShowLeaderboard(false)} style={styles.lbCloseBtn} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.lbTabBar, { backgroundColor: colors.background }]}>
              <TouchableOpacity
                style={[styles.lbTab, leaderboardScope === 'global' && [styles.lbTabActive, { backgroundColor: colors.card }]]}
                onPress={() => setLeaderboardScope('global')}>
                <Ionicons name="globe-outline" size={11} color={leaderboardScope === 'global' ? colors.text : colors.muted} />
                <Text style={[styles.lbTabText, { color: leaderboardScope === 'global' ? colors.text : colors.muted }]}>{t('community.global')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.lbTab, leaderboardScope === 'friends' && [styles.lbTabActive, { backgroundColor: colors.card }]]}
                onPress={() => setLeaderboardScope('friends')}>
                <Ionicons name="people-outline" size={11} color={leaderboardScope === 'friends' ? colors.text : colors.muted} />
                <Text style={[styles.lbTabText, { color: leaderboardScope === 'friends' ? colors.text : colors.muted }]}>{t('messages.friends')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.lbMetricRow}>
              {[
                { key: 'hours', label: 'Hours', icon: 'time-outline' },
                { key: 'chapters', label: 'Chapters', icon: 'book-outline' },
                { key: 'streak', label: 'Streak', icon: 'flame-outline' },
              ].map((m) => {
                const active = leaderboardMetric === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.lbMetricPill, { borderColor: active ? '#FFD700' : colors.border }, active && { backgroundColor: 'rgba(255,215,0,0.12)' }]}
                    onPress={() => setLeaderboardMetric(m.key)}>
                    <Ionicons name={m.icon} size={11} color={active ? '#FFD700' : colors.muted} />
                    <Text style={[styles.lbMetricText, { color: active ? '#FFD700' : colors.muted }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.lbDivider, { backgroundColor: colors.border }]} />

            {leaderboardLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : sortedLeaderboard.length === 0 ? (
              <Text style={[styles.emptyHint, { textAlign: 'center', paddingVertical: 32 }]}>{t('community.noRankings')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28, paddingTop: 4 }}>
                {sortedLeaderboard.map((entry, idx) => (
                  <View
                    key={entry.id || idx}
                    style={[
                      styles.lbRow,
                      { borderColor: entry.isMe ? 'rgba(123,92,255,0.4)' : colors.border },
                      entry.isMe && styles.lbRowMe,
                    ]}>
                    <View style={styles.lbRankWrap}>
                      {idx < 3 ? (
                        <Text style={styles.lbMedal}>{['🥇','🥈','🥉'][idx]}</Text>
                      ) : (
                        <View style={[styles.lbRankNumWrap, { backgroundColor: colors.background }]}>
                          <Text style={[styles.lbRankNumText, { color: colors.muted }]}>{idx + 1}</Text>
                        </View>
                      )}
                    </View>
                    <View style={[
                      styles.lbAvatar,
                      { backgroundColor: themeColor(entry.color), overflow: 'hidden' },
                      entry.online && styles.lbAvatarOnline,
                    ]}>
                      {entry.avatarUrl
                        ? <Image source={{ uri: entry.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <Text style={styles.lbAvatarText}>{entry.avatar}</Text>}
                    </View>
                    <View style={styles.lbInfo}>
                      <View style={styles.lbNameRow}>
                        <Text style={[styles.lbName, { color: entry.isMe ? colors.primary : colors.text }]} numberOfLines={1}>
                          {entry.name}
                        </Text>
                        {entry.isMe && (
                          <View style={styles.youChip}>
                            <Text style={styles.youChipText}>YOU</Text>
                          </View>
                        )}
                        {entry.online && <View style={styles.lbOnlineDot} />}
                      </View>
                    </View>
                    <View style={styles.lbFeaturedStatGroup}>
                      <FeaturedBadgeStat entry={entry} />
                      <View style={styles.lbStat}>
                        <Text style={[styles.lbStatValue, { color: colors.text }]}>
                          {leaderboardMetric === 'hours' ? formatTime(entry.hours)
                            : leaderboardMetric === 'chapters' ? entry.chapters.toLocaleString()
                            : entry.streak.toLocaleString()}
                        </Text>
                        <Text style={[styles.lbStatLabel, { color: colors.muted }]}>
                          {leaderboardMetric === 'hours' ? 'read' : leaderboardMetric === 'chapters' ? 'chapters' : 'streak'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, padding: 10, borderRadius: 10, borderWidth: 1, gap: 8 },
  noFriendsHint: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  noFriendsHintText: { fontSize: 12.5, flexShrink: 1 },
  errorBannerText: { flex: 1, fontSize: 11 },
  errorBannerRetry: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: '700', marginLeft: 10, flex: 1 },
  headerButtons: { alignItems: 'flex-end' },
  addFriendBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(123,92,255,0.15)', borderWidth: 1, borderColor: 'rgba(123,92,255,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginBottom: 6 },
  addFriendText: { color: '#7B5CFF', fontSize: 11, fontWeight: '600', marginLeft: 5, paddingRight: 2 },
  leaderboardBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  leaderboardText: { color: '#FFD700', fontSize: 11, fontWeight: '600', marginLeft: 5, paddingRight: 2 },

  // Section titles
  sectionTitle: { fontSize: 14, fontWeight: '600', paddingHorizontal: 20, marginBottom: 12 },
  emptyHint: { paddingHorizontal: 20, marginBottom: 16, fontSize: 13 },

  // ── Activity Feed ──
  actHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
  actTitleRow: { flexDirection: 'row', alignItems: 'center' },
  actLoader: { paddingVertical: 28 },

  // ── Poll ──
  pollCard: { marginHorizontal: 20, marginBottom: 24, borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 16 },
  pollHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pollLabel: { color: '#7B5CFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  pollQuestion: { fontSize: 15, fontWeight: '700', lineHeight: 22, marginBottom: 14 },
  pollOption: { borderRadius: 10, borderWidth: 1, marginBottom: 8, overflow: 'hidden', height: 44, justifyContent: 'center' },
  pollOptionFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  pollOptionContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  pollDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(123,92,255,0.5)', marginRight: 10 },
  pollDotFilled: { backgroundColor: '#7B5CFF', borderColor: '#7B5CFF' },
  pollOptionLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  pollPct: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  pollHint: { fontSize: 12, marginBottom: 10, fontStyle: 'italic' },
  pollFooter: { fontSize: 11 },
  pollFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  pollFooterDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(155,154,163,0.5)', marginHorizontal: 2 },

  // Shared live chip
  liveChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 20 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#10b981', marginRight: 3 },
  liveText: { color: '#10b981', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  // Friends
  // Messages section
  dmTotalBadge: { backgroundColor: '#7B5CFF', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  dmTotalBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  dmSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 4, marginBottom: 6 },
  dmSectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  dmList: { marginBottom: 24 },

  // Flat, full-bleed conversation row — Discord lists threads, it doesn't card them
  dmRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9 },

  dmConvoContent: { flex: 1, marginLeft: 12 },
  dmConvoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  dmConvoName: { fontSize: 14, fontWeight: '500', flex: 1 },
  dmConvoNameBold: { fontWeight: '700' },
  dmConvoTime: { fontSize: 11, marginLeft: 8 },
  dmConvoPreview: { fontSize: 13, lineHeight: 17 },
  dmConvoPreviewBold: { fontWeight: '600' },
  dmUnreadDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#7B5CFF', borderWidth: 2, borderColor: '#0D0D0F' },
  dmUnreadBadge: { backgroundColor: '#7B5CFF', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 },
  dmUnreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  friendsList: { paddingHorizontal: 20, marginBottom: 24 },
  friendRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  friendRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  friendRowChevron: { paddingLeft: 8, paddingVertical: 4 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(123,92,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  friendAvatarOnline: { borderWidth: 2, borderColor: '#1D9E75' },
  friendAvatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  friendInfo: { flex: 1, marginLeft: 12 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center' },
  friendName: { fontSize: 14, fontWeight: '500' },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1D9E75', marginLeft: 6 },
  friendReading: { fontSize: 12, marginTop: 2 },
  friendSeriesLink: { color: '#7B5CFF' },

  // Friend avatar strip (replaces the old "Friends Reading" list)
  friendStripRow: { paddingLeft: 20, marginBottom: 22 },
  friendAvatarItem: { alignItems: 'center', width: 66, marginRight: 10 },
  friendAvatarWrap: { position: 'relative' },
  presenceDot: {
    position: 'absolute', bottom: 0, right: 2, width: 16, height: 16, borderRadius: 8,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
  },
  friendAvatarName: { fontSize: 11, fontWeight: '500', marginTop: 6, textAlign: 'center' },

  // Discussions
  discHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  seeAllChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllChipText: { color: '#7B5CFF', fontSize: 12, fontWeight: '600' },
  discList: { paddingHorizontal: 20, marginBottom: 8 },
  discCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  discCover: { width: 52, height: 66, borderRadius: 8, marginRight: 14 },
  discInfo: { flex: 1 },
  discTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  discChap: { fontSize: 11, marginBottom: 5 },
  discCountRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  discCount: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },
  discActions: { alignItems: 'center', justifyContent: 'space-between', height: 40, paddingLeft: 8 },
  discReportBtn: { padding: 2 },

  // Report modal
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  reportSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  reportTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  reportSub: { fontSize: 12, marginBottom: 16 },
  reportOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  reportOptionText: { fontSize: 14 },

  // Toast
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13,13,15,0.92)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 8 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalSub: { fontSize: 12, marginBottom: 16 },

  // Leaderboard modal
  lbSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16, maxHeight: '86%' },
  lbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  lbHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lbTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
  lbCloseBtn: { padding: 6, borderRadius: 20 },
  lbTabBar: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12, marginBottom: 10 },
  lbTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 9, gap: 4 },
  lbTabActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  lbTabText: { fontSize: 11, fontWeight: '600' },
  lbTabEmoji: { fontSize: 11 },
  lbMetricRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  lbMetricPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 9, borderWidth: 1, gap: 4 },
  lbMetricText: { fontSize: 10, fontWeight: '600' },
  lbDivider: { height: 1, marginBottom: 6 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, marginBottom: 5 },
  lbRowMe: { backgroundColor: 'rgba(123,92,255,0.1)' },
  lbRankWrap: { width: 32, alignItems: 'center', marginRight: 4 },
  lbMedal: { fontSize: 18 },
  lbRankNumWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  lbRankNumText: { fontSize: 11, fontWeight: '600' },
  lbAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  lbAvatarOnline: { borderWidth: 2, borderColor: '#10b981', padding: 1 },
  lbAvatarText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  lbInfo: { flex: 1, marginRight: 6 },
  lbNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  lbName: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  youChip: { paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(123,92,255,0.2)', borderRadius: 20 },
  youChipText: { color: '#7B5CFF', fontSize: 8, fontWeight: '700' },
  lbOnlineDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#10b981' },
  lbBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  lbFeaturedStatGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lbStat: { alignItems: 'flex-end', minWidth: 44 },
  lbStatValue: { fontSize: 14, fontWeight: 'bold' },
  lbStatLabel: { fontSize: 9, marginTop: 1 },

  // Search / friend modal
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginRight: 8 },
  searchBtn: { backgroundColor: '#7B5CFF', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchError: { color: '#D4537E', fontSize: 12, marginBottom: 10 },
  resultCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 4, borderWidth: 1 },
  resultAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  resultAvatarText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '600' },
  resultSub: { fontSize: 11, marginTop: 2 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(123,92,255,0.1)', borderWidth: 1, borderColor: 'rgba(123,92,255,0.3)', marginRight: 8 },
  viewBtnText: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(123,92,255,0.1)', borderWidth: 1, borderColor: 'rgba(123,92,255,0.3)' },
  addBtnSent: { borderColor: 'rgba(29,158,117,0.4)', backgroundColor: 'rgba(29,158,117,0.1)' },
  addBtnText: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },
  addBtnTextSent: { color: '#1D9E75' },
  divider: { height: 1, marginVertical: 16 },
  suggestedTitle: { fontSize: 11, fontWeight: '600', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  suggestedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  suggestedName: { fontSize: 13, flex: 1, marginLeft: 10 },
  suggestedProfileBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, marginRight: 8 },
  suggestedProfileText: { fontSize: 11, fontWeight: '500' },
  suggestedAddBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(123,92,255,0.15)' },
  suggestedAddBtnSent: { backgroundColor: 'rgba(29,158,117,0.15)' },

  // Friend requests
  requestsSection: { paddingHorizontal: 20, marginBottom: 16 },
  requestsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  requestsTitle: { fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 },
  requestsBadge: { backgroundColor: '#7B5CFF', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  requestsBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  requestRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  requestAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  requestAvatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 13, fontWeight: '600' },
  requestSub: { fontSize: 11, marginTop: 2 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(29,158,117,0.1)', borderWidth: 1, borderColor: 'rgba(29,158,117,0.4)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 6 },
  acceptBtnText: { color: '#1D9E75', fontSize: 11, fontWeight: '600', marginLeft: 4 },
  declineBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
