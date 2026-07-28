import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import { getBlockedIds, blockUser, unblockUser } from '../utils/blocking';
import { showAppToast } from '../utils/appToast';
import { showAppAlert } from '../utils/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../supabase';
import { ALL_BADGES, BADGE_GRADES, computeEarnedBadgeIds, profileToBadgeStats, ensureBadgeRarity } from '../utils/badges';
import BadgeDetail from '../components/BadgeDetail';
import { useTheme } from '../utils/ThemeContext';
import { MangaCover, fetchMangaInfo } from '../utils/mangaCovers';
import BadgeIcon from '../components/BadgeIcon';
import StreakCalendar from '../components/StreakCalendar';
import { PeopleListModal, PeopleRow } from './ProfileScreen';
import { localDateKey } from '../utils/readerUtils';
import { Bone, RowSkeleton } from '../components/Skeleton';
import { useResponsive } from '../utils/responsive';
import { PROFILE_THEMES } from '../utils/profileThemes';

const GRADE_RANK = { mythic: 0, gold: 1, purple: 2, indigo: 3, blue: 4, green: 5, grey: 6 };

const fmtHrs = (h) => {
  if (!h || h <= 0) return '0m';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h)}h`;
};

export default function FriendProfileScreen({ route }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { id } = route.params || {};
  const [profile, setProfile]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [myId, setMyId]                 = useState(null);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [entriesRead, setEntriesRead]     = useState(0);
  const [friendsList, setFriendsList]     = useState([]);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [showPeople, setShowPeople]       = useState(null); // null | 'friends' | 'followers' | 'following'
  const [showAllFaves, setShowAllFaves]   = useState(false);
  const [iFollow, setIFollow]             = useState(false);
  const [followBusy, setFollowBusy]       = useState(false);
  const [iBlocked, setIBlocked]           = useState(false);
  const [blockBusy, setBlockBusy]         = useState(false);
  const [faveCovers, setFaveCovers]       = useState({}); // title → cover_url for favorites missing one
  const [detailBadge, setDetailBadge]     = useState(null); // badge → detail popup (desc + rarity)
  const [, setRarityReady]                = useState(false);

  useEffect(() => { ensureBadgeRarity().then(() => setRarityReady(true)); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setMyId(user.id);
        getBlockedIds(user.id).then((set) => setIBlocked(set.has(id)));
      }
    });
    loadProfile();
    loadEntriesRead();
  }, [id]);

  function handleBlockToggle() {
    if (!myId || !id || blockBusy) return;
    if (iBlocked) {
      setBlockBusy(true);
      unblockUser(myId, id).then(({ error }) => {
        setBlockBusy(false);
        if (error) { showAppToast("Couldn't unblock — try again"); return; }
        setIBlocked(false);
        showAppToast(`Unblocked ${displayName || 'user'}`, 'success');
      });
      return;
    }
    showAppAlert(
      `Block ${displayName || 'this user'}?`,
      "They won't be able to message you, and you won't see their comments. This also removes them as a friend.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            setBlockBusy(true);
            blockUser(myId, id).then(({ error }) => {
              setBlockBusy(false);
              if (error) { showAppToast("Couldn't block — try again"); return; }
              setIBlocked(true);
              showAppToast(`Blocked ${displayName || 'user'}`, 'success');
            });
          },
        },
      ]
    );
  }

  async function loadEntriesRead() {
    if (!id) return;
    const { data } = await supabase
      .from('reading_progress')
      .select('series_title, current_chapter, total_chapters, status')
      .eq('user_id', id);
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
  }

  // Live profile updates — avatar, banner, theme, online status, currently_reading
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`profile-live-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${id}` }, (payload) => {
        if (payload.new) setProfile((prev) => prev ? { ...prev, ...payload.new } : payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function loadProfile() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      setProfile(data);
      setLoading(false);
      return;
    }
    setProfile(null);
    setLoading(false);
  }

  // ── Friends / Followers of this profile ──────────────────────────────────

  function toPerson(p) {
    const name = p.display_name || p.username || '?';
    return { id: p.id, name, avatar: name.slice(0, 1).toUpperCase(), avatarUrl: p.avatar_url || null, online: !!p.online };
  }

  async function loadFollowers() {
    const { data } = await supabase
      .from('followers')
      .select('follower:follower_id(id, username, display_name, avatar_url, online)')
      .eq('followed_id', id)
      .order('created_at', { ascending: false });
    setFollowersList((data || []).map(r => r.follower).filter(Boolean).map(toPerson));
  }

  async function loadFollowing() {
    const { data } = await supabase
      .from('followers')
      .select('followed:followed_id(id, username, display_name, avatar_url, online)')
      .eq('follower_id', id)
      .order('created_at', { ascending: false });
    setFollowingList((data || []).map(r => r.followed).filter(Boolean).map(toPerson));
  }

  useEffect(() => {
    if (!id) return;
    supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${id},addressee_id.eq.${id}`)
      .eq('status', 'accepted')
      .then(async ({ data: rows }) => {
        const ids = (rows || []).map(f => (f.requester_id === id ? f.addressee_id : f.requester_id));
        if (ids.length === 0) { setFriendsList([]); return; }
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, online')
          .in('id', ids);
        setFriendsList((profiles || []).map(toPerson));
      });
    loadFollowers();
    loadFollowing();
  }, [id]);

  useEffect(() => {
    if (!myId || !id || myId === id) return;
    supabase
      .from('followers')
      .select('id')
      .eq('follower_id', myId)
      .eq('followed_id', id)
      .maybeSingle()
      .then(({ data }) => setIFollow(!!data));
  }, [myId, id]);

  async function toggleFollow() {
    if (!myId || myId === id || followBusy) return;
    setFollowBusy(true);
    if (iFollow) {
      setIFollow(false);
      setFollowersList(prev => prev.filter(p => p.id !== myId));
      const { error } = await supabase.from('followers').delete().eq('follower_id', myId).eq('followed_id', id);
      // The follow path below already rolls back on failure; this one didn't,
      // so a failed delete (offline, RLS) left the button reading "Follow"
      // while the row was still there — tapping it again then hit the unique
      // constraint and silently did nothing, stranding the button wrong.
      if (error) {
        setIFollow(true);
        loadFollowers();
      }
    } else {
      setIFollow(true);
      const { error } = await supabase.from('followers').insert({ follower_id: myId, followed_id: id });
      if (error) {
        setIFollow(false);
      } else {
        supabase.from('notifications').insert({ user_id: id, actor_id: myId, type: 'follow', data: {} }).then(() => {});
        loadFollowers();
      }
    }
    setFollowBusy(false);
  }

  // ── Badge data — same computation as ProfileScreen ───────────────────────

  const earnedIds = useMemo(
    () => profile ? computeEarnedBadgeIds(profileToBadgeStats(profile)) : new Set(),
    [profile]
  );

  // Pinned showcase badges (validated against what they actually earned)
  const showcaseBadges = useMemo(() => {
    const ids = Array.isArray(profile?.showcase_badges) ? profile.showcase_badges : [];
    return ids
      .filter((id) => earnedIds.has(id))
      .slice(0, 3)
      .map((id) => ALL_BADGES.find((b) => b.id === id))
      .filter(Boolean);
  }, [profile?.showcase_badges, earnedIds]);

  const badgeFlatData = useMemo(() => {
    // Only earned badges, plus non-hidden grey/starter badges (shown locked as a preview) —
    // matches ProfileScreen so friends can't see the full locked badge catalog.
    const groups = Object.keys(BADGE_GRADES).map((gradeKey) => ({
      gradeKey,
      grade: BADGE_GRADES[gradeKey],
      badges: ALL_BADGES.filter((b) => b.grade === gradeKey && (earnedIds.has(b.id) || (b.grade === 'grey' && !b.hidden))),
    })).filter((g) => g.badges.length > 0);

    const rows = [];
    for (const { gradeKey, grade, badges } of groups) {
      rows.push({ key: `hdr_${gradeKey}`, _t: 'h', grade });
      for (let i = 0; i < badges.length; i += 2) {
        rows.push({ key: badges[i].id, _t: 'r', grade, left: badges[i], right: badges[i + 1] || null });
      }
    }
    return rows;
  }, [earnedIds]);

  // ── Derived display values ──────────────────────────────────────────────

  const theme          = profile ? (PROFILE_THEMES.find((t) => t.id === profile.color) || PROFILE_THEMES[0]) : PROFILE_THEMES[0];
  const displayName    = profile?.display_name || profile?.username;
  const avatarInitial  = profile ? (displayName || '?').charAt(0).toUpperCase() : '?';
  // Normalize: older accounts stored favorites in looser shapes (even bare
  // title strings) — coerce everything to { title, searchKey, ... } objects
  const rawFavorites   = (profile && Array.isArray(profile.favorites) ? profile.favorites : [])
    .map((f) => (typeof f === 'string' ? { title: f, searchKey: f } : f))
    .filter((f) => f && f.title);
  // Older favorites have no stored coverUrl — resolve those from manga_pool so
  // the covers reliably show on someone else's profile too
  useEffect(() => {
    const missing = rawFavorites.filter((f) => !f.coverUrl && !faveCovers[f.title]);
    if (missing.length === 0) return;
    (async () => {
      const found = {};
      try {
        const { data } = await supabase
          .from('manga_pool')
          .select('title, cover_url')
          .in('title', missing.map((f) => f.title));
        (data || []).forEach((r) => { if (r.cover_url) found[r.title] = r.cover_url; });
      } catch (_) {}
      // Anything not in the pool: resolve through the multi-source cover search
      for (const f of missing) {
        if (found[f.title]) continue;
        try {
          const info = await fetchMangaInfo(f.searchKey || f.title, f.lang);
          if (info?.coverUrl) found[f.title] = info.coverUrl;
        } catch (_) {}
      }
      if (Object.keys(found).length > 0) setFaveCovers((prev) => ({ ...prev, ...found }));
    })();
  }, [profile?.id, rawFavorites.length]);
  const favorites      = rawFavorites.map((f) => f.coverUrl ? f : { ...f, coverUrl: faveCovers[f.title] || null });
  const dailyLog       = profile?.daily_log || {};

  const todayKey   = localDateKey();
  const todayHrs   = dailyLog[todayKey] || 0;
  const todayLabel = todayHrs <= 0
    ? null
    : todayHrs < 1
      ? `${Math.round(todayHrs * 60)}m today`
      : `${Math.floor(todayHrs)}h ${Math.round((todayHrs % 1) * 60)}m today`;

  const previewBadges = ALL_BADGES
    .filter((b) => !b.hidden && earnedIds.has(b.id))
    .sort((a, b) => (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9))
    .slice(0, 12);

  const showActivity   = profile?.show_activity !== false;
  const isOnline       = showActivity && !!profile?.online;
  const joinedLabel    = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  const currentlyReading = isOnline && profile?.currently_reading ? profile.currently_reading : null;
  const currentChapter   = isOnline && profile?.current_chapter ? profile.current_chapter : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating header — back button + online badge + message (no title bar) */}
      <View style={[styles.floatingBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.floatingBackBtn} activeOpacity={0.75} pointerEvents="auto">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        {profile && !loading && isOnline && (
          <View style={styles.floatingRight} pointerEvents="auto">
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 12 }}>
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <Bone width="100%" height={110} radius={16} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -26, paddingLeft: 8 }}>
              <Bone width={72} height={72} radius={36} />
              <View style={{ gap: 7, marginTop: 20 }}>
                <Bone width={130} height={16} />
                <Bone width={90} height={11} />
              </View>
            </View>
          </View>
          <RowSkeleton count={4} />
        </View>
      ) : !profile ? (
        <View style={[styles.notFoundContainer, { backgroundColor: colors.background }]}>
          <Text style={[styles.notFoundText, { color: colors.muted }]}>Friend not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.notFoundLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
        <View style={isTablet ? styles.tabletWrap : null}>

        {/* Space for floating bar */}
        <View style={{ height: insets.top + 50 }} />

        {/* Banner + avatar card */}
        <View style={[styles.bannerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {profile.banner_url ? (
            <Image source={{ uri: profile.banner_url }} style={styles.bannerImage} />
          ) : (
            <LinearGradient
              colors={[theme.banner[0], theme.banner[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerImage}
            />
          )}
          <View style={styles.bannerInfoArea}>
            <View style={styles.avatarRow}>
              <LinearGradient
                colors={theme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatar, { borderColor: theme.ring }]}
              >
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{avatarInitial}</Text>
                )}
              </LinearGradient>
              <View style={styles.nameBioBlock}>
                <Text style={[styles.username, { color: colors.text }]}>{profile.display_name || profile.username}</Text>
              </View>
            </View>
            <Text style={[styles.handle, { color: colors.muted }]}>
              @{(profile.username || '').toLowerCase()}{joinedLabel ? ` · Joined ${joinedLabel}` : ''}
            </Text>
            {showcaseBadges.length > 0 && (
              <View style={styles.showcaseRow}>
                {showcaseBadges.map((b) => (
                  <TouchableOpacity key={b.id} onPress={() => setDetailBadge(b)} activeOpacity={0.75}>
                    <BadgeIcon badge={b} size={30} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {profile.bio ? (
              <Text style={[styles.bioText, { color: colors.muted }]}>{profile.bio}</Text>
            ) : null}
            {currentlyReading ? (
              <View style={styles.readingNowRow}>
                <View style={styles.readingNowDot} />
                <Text style={[styles.currentlyReading, { color: colors.muted }]} numberOfLines={1}>
                  Reading: {currentlyReading}{currentChapter ? ` · Ch. ${currentChapter}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Friends · Followers · Following — below bio/joined date, above the action icons */}
            <PeopleRow
              friends={friendsList}
              followers={followersList}
              following={followingList}
              colors={colors}
              onOpen={(key) => setShowPeople(key)}
              style={styles.peopleRowInCard}
            />

            {/* Icon actions — bottom-right corner of the profile card, plain icons, no chip background */}
            {myId && myId !== profile.id && (
              <View style={styles.actionIconsRow}>
                {!iBlocked && (
                  <TouchableOpacity
                    onPress={toggleFollow}
                    disabled={followBusy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}>
                    <Ionicons name={iFollow ? 'person-remove-outline' : 'person-add-outline'} size={19} color={iFollow ? '#1D9E75' : '#7B5CFF'} />
                  </TouchableOpacity>
                )}
                {!iBlocked && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('DM', {
                      friendId: profile.id,
                      friendName: displayName,
                      friendColor: profile.color,
                      friendAvatarUrl: profile.avatar_url || null,
                    })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}>
                    <Ionicons name="chatbubble-outline" size={18} color="#7B5CFF" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleBlockToggle}
                  disabled={blockBusy}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}>
                  <Ionicons name={iBlocked ? 'ban' : 'ban-outline'} size={18} color="#E5534B" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Stats — plain icon + value + label, no box/chip */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="book" size={14} color="#7B5CFF" />
            <Text style={[styles.statValue, { color: colors.text }]}>{entriesRead}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Read</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={14} color="#1D9E75" />
            <Text style={[styles.statValue, { color: colors.text }]}>{fmtHrs(profile.hours_read)}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Time Read</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={14} color="#FFD700" />
            <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
              {profile.favorite_genre || '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Fav. Genre</Text>
          </View>
        </View>

        <PeopleListModal
          visible={!!showPeople}
          title={showPeople === 'followers' ? 'Followers' : showPeople === 'following' ? 'Following' : 'Friends'}
          people={showPeople === 'followers' ? followersList : showPeople === 'following' ? followingList : friendsList}
          colors={colors}
          onClose={() => setShowPeople(null)}
          onOpenPerson={(p) => {
            setShowPeople(null);
            if (p.id !== id) navigation.push('FriendProfile', { id: p.id });
          }}
        />

        {/* Favorites popup — compact centered card (Discord favorite-games style),
            read-only because this is someone else's list */}
        <Modal visible={showAllFaves} animationType="fade" transparent onRequestClose={() => setShowAllFaves(false)}>
          <TouchableOpacity style={styles.favesPopupOverlay} activeOpacity={1} onPress={() => setShowAllFaves(false)}>
            <View style={[styles.favesPopupCard, { backgroundColor: colors.card, borderColor: colors.border }]} onStartShouldSetResponder={() => true}>
              <View style={styles.favesPopupHeader}>
                <Ionicons name="heart" size={13} color="#E8527A" />
                <Text style={[styles.favesPopupTitle, { color: colors.text }]} numberOfLines={1}>
                  {displayName}'s Favorites
                </Text>
                <Text style={[styles.favesPopupCount, { color: colors.muted }]}>{favorites.length}/5</Text>
              </View>
              <View style={styles.favesPopupGrid}>
                {favorites.map((item) => (
                  <View key={item.id || item.title} style={styles.favesPopupSlot}>
                    <MangaCover title={item.title} searchKey={item.searchKey} lang={item.lang} color={item.color} coverUrl={item.coverUrl} style={styles.favesPopupCover} />
                    <Text style={[styles.favesPopupName, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Reading Streak + Faves */}
        <View style={[styles.streakSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.streakSectionHeader}>
            <Text style={[styles.streakTitle, { color: colors.text }]}>Reading Streak </Text>
          </View>
          <View style={styles.streakBody}>
            <View style={styles.streakLeft}>
              <View style={styles.streakBadges}>
                {todayLabel && (
                  <View style={styles.todayBadge}>
                    <Ionicons name="time" size={11} color="#7B5CFF" />
                    <Text style={styles.todayBadgeText}>{todayLabel}</Text>
                  </View>
                )}
                <View style={styles.fireBadge}>
                  <Text style={styles.fireEmoji}>🔥</Text>
                  <Text style={styles.fireBadgeText}>{profile.streak_count || 0}d</Text>
                </View>
              </View>
              <StreakCalendar dailyLog={dailyLog} />
              <View style={styles.streakLegend}>
                {[{ bg: '#4A40A0', label: 'Some' }, { bg: '#7B5CFF', label: 'Lots' }].map(({ bg, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: bg }]} />
                    <Text style={[styles.legendText, { color: colors.muted }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Faves panel */}
            <View style={styles.favesPanel}>
              {favorites.length === 0 ? (
                <View style={[styles.favesEmptyCard, { borderColor: 'rgba(123,92,255,0.25)' }]}>
                  <Text style={styles.favesEmptyText}>No faves yet</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.faveFeatCard} onPress={() => setShowAllFaves(true)} activeOpacity={0.85}>
                  <MangaCover
                    title={favorites[0].title}
                    searchKey={favorites[0].searchKey}
                    lang={favorites[0].lang}
                    color={favorites[0].color}
                    coverUrl={favorites[0].coverUrl}
                    style={styles.faveFeatGrad}
                  >
                    <View style={styles.faveFeatLetterWrap} pointerEvents="none">
                      <Text style={styles.faveFeatLetter}>{(favorites[0].title || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.88)']}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, justifyContent: 'flex-end', padding: 8 }}
                    >
                      <Text style={styles.faveFeatTitle} numberOfLines={3}>{favorites[0].title}</Text>
                    </LinearGradient>
                    {favorites.length > 1 && (
                      <View style={styles.faveMoreBadge}>
                        <Text style={styles.faveMoreBadgeText}>+{favorites.length - 1}</Text>
                      </View>
                    )}
                  </MangaCover>
                </TouchableOpacity>
              )}
              <View style={styles.favesPanelFoot}>
                <Text style={[styles.favesCountText, { color: colors.muted }]}>{favorites.length}/5</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Badges preview grid — same 4-wide layout as ProfileScreen */}
        {earnedIds.size > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Badges Earned</Text>
              <Text style={[styles.badgeCountText, { color: colors.muted }]}>{earnedIds.size} / {ALL_BADGES.length}</Text>
            </View>
            <View style={styles.badgeGrid}>
              {previewBadges.map((badge) => {
                const grade = BADGE_GRADES[badge.grade] || BADGE_GRADES.grey;
                return (
                  <TouchableOpacity
                    key={badge.id}
                    style={[styles.badgeCard, { borderColor: grade.border }]}
                    onPress={() => setDetailBadge(badge)}
                    activeOpacity={0.8}>
                    <BadgeIcon badge={badge} size={48} />
                    <Text style={[styles.badgeName, { color: grade.color }]} numberOfLines={2}>{badge.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllBadges(true)}>
              <Text style={styles.seeAllText}>See all {earnedIds.size} earned badges</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: tabBarHeight + 16 }} />
        </View>
      </ScrollView>
      )}

      {/* All badges modal — same grouped layout as ProfileScreen */}
      <Modal visible={showAllBadges && !!profile} animationType="none" transparent onRequestClose={() => setShowAllBadges(false)}>
        {showAllBadges && (
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowAllBadges(false)}>
            <View style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>Achievement Badges</Text>
                  <Text style={[styles.sheetSub, { color: colors.muted }]}>{earnedIds.size} earned · {ALL_BADGES.length - earnedIds.size} locked</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAllBadges(false)}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Grade legend chips — identical to ProfileScreen */}
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
                          <TouchableOpacity
                            key={badge.id}
                            style={[styles.fullBadgeCard, !earned && styles.fullBadgeCardLocked]}
                            onPress={() => setDetailBadge(badge)}
                            activeOpacity={0.7}>
                            <View style={{ marginRight: 10, marginTop: 2 }}>
                              <BadgeIcon badge={badge} size={44} locked={!earned} />
                            </View>
                            <View style={styles.fullBadgeInfo}>
                              <Text style={[styles.fullBadgeName, { color: earned ? item.grade.color : colors.muted }]}>
                                {badge.name}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                }}
              />

              {/* Badge detail overlay — inside the sheet (stacked native modals
                  are unreliable on iOS) */}
              {detailBadge && (
                <TouchableOpacity
                  style={styles.badgeDetailOverlay}
                  activeOpacity={1}
                  onPress={() => setDetailBadge(null)}>
                  <BadgeDetail
                    badge={detailBadge}
                    earned={earnedIds.has(detailBadge.id)}
                    colors={colors}
                    stats={profile ? profileToBadgeStats(profile) : {}}
                    onClose={() => setDetailBadge(null)}
                  />
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
      </Modal>

      {/* Badge detail popup — description + rarity (no pin button on friends) */}
      <Modal visible={!!detailBadge && !showAllBadges} animationType="fade" transparent onRequestClose={() => setDetailBadge(null)}>
        <TouchableOpacity style={styles.badgeDetailOverlay} activeOpacity={1} onPress={() => setDetailBadge(null)}>
          <BadgeDetail
            badge={detailBadge}
            earned={detailBadge ? earnedIds.has(detailBadge.id) : false}
            colors={colors}
            stats={profile ? profileToBadgeStats(profile) : {}}
            onClose={() => setDetailBadge(null)}
          />
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles — mirrors ProfileScreen measurements exactly ───────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 14, marginBottom: 12 },
  notFoundLink: { color: '#7B5CFF', fontSize: 14, fontWeight: '600' },

  // Floating header bar
  floatingBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10 },
  floatingBackBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center' },
  floatingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(29,158,117,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1D9E75', marginRight: 4 },
  onlineText: { color: '#1D9E75', fontSize: 10, fontWeight: '600' },
  msgHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,92,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  msgHeaderText: { color: '#7B5CFF', fontSize: 12, fontWeight: '600' },

  // Banner card — no overflow:hidden so negative-margin avatar is never clipped
  bannerCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  bannerImage: { width: '100%', height: 80, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  bannerInfoArea: { padding: 16, paddingTop: 0 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -32 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  nameBioBlock: { flex: 1, marginLeft: 12, marginTop: 36 },
  username: { fontSize: 16, fontWeight: 'bold' },
  handle: { fontSize: 10, marginTop: 4 },
  bioText: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  readingNowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  readingNowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1D9E75', marginRight: 6 },
  currentlyReading: { fontSize: 10, fontStyle: 'italic', flex: 1 },

  // Badge showcase (pinned shields under the name, icon-only) — mirrors ProfileScreen
  showcaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  badgeDetailOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 10 },

  // Stats — same as ProfileScreen
  statsRow: { flexDirection: 'row', paddingHorizontal: 28, marginBottom: 22 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 4 },

  actionIconsRow: { flexDirection: 'row', gap: 10, alignSelf: 'flex-end', marginTop: 8 },
  peopleRowInCard: { marginTop: 10, marginBottom: 2 },
  actionIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(123,92,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(123,92,255,0.25)',
  },
  actionIconBtnActive: { backgroundColor: 'rgba(29,158,117,0.12)', borderColor: 'rgba(29,158,117,0.35)' },
  actionIconBtnBlocked: { backgroundColor: 'rgba(229,83,75,0.14)', borderColor: 'rgba(229,83,75,0.4)' },
  statValue: { fontSize: 14, fontWeight: '700', marginBottom: 1 },
  statLabel: { fontSize: 9, textAlign: 'center' },

  // Streak section — same as ProfileScreen
  streakSection: { marginHorizontal: 20, borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1 },
  streakSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  streakTitle: { fontSize: 16, fontWeight: '600' },
  streakBadges: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  todayBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(123,92,255,0.1)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, marginRight: 6 },
  todayBadgeText: { color: '#7B5CFF', fontSize: 12, fontWeight: '600', marginLeft: 4, paddingRight: 2 },
  fireBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,149,0,0.12)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  fireEmoji: { fontSize: 12 },
  fireBadgeText: { color: '#FF9500', fontSize: 12, fontWeight: '600', marginLeft: 4, paddingRight: 2 },
  streakBody: { flexDirection: 'row', alignItems: 'flex-start' },
  streakLeft: { flex: 1 },
  streakLegend: { flexDirection: 'row', alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  legendDot: { width: 11, height: 11, borderRadius: 2, marginRight: 5 },
  legendText: { fontSize: 11 },

  // Faves panel
  favesPanel: { width: 136, marginLeft: 14, borderRadius: 12, overflow: 'hidden' },
  favesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Explicit numeric width (panel 136 − 6px margins each side): the cover's
  // contents are all absolutely positioned, so any auto/stretch-derived width
  // can resolve to 0 and the card renders as invisible black space
  faveFeatCard: { width: 124, alignSelf: 'center', borderRadius: 8, overflow: 'hidden' },
  faveFeatGrad: { width: 124, height: 174 },
  faveFeatTitle: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  faveFeatLetterWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  faveFeatLetter: { color: 'rgba(255,255,255,0.15)', fontSize: 44, fontWeight: 'bold' },
  faveMoreBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  faveMoreBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Favorites popup (Discord favorite-games style, read-only)
  favesPopupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  favesPopupCard: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 16 },
  favesPopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  favesPopupTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  favesPopupCount: { fontSize: 11, fontWeight: '600' },
  favesPopupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  favesPopupSlot: { width: '31%', flexGrow: 1, maxWidth: '31.5%' },
  favesPopupCover: { width: '100%', aspectRatio: 0.7, borderRadius: 10 },
  favesPopupName: { fontSize: 10, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  favesEmptyCard: { marginHorizontal: 6, height: 174, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  favesEmptyText: { color: 'rgba(123,92,255,0.5)', fontSize: 10, textAlign: 'center' },
  favesPanelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  favesCountText: { fontSize: 11, fontWeight: '500' },

  // Badges section
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  badgeCountText: { fontSize: 10 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeCard: { width: '22%', margin: '1.5%', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, alignItems: 'center', minHeight: 80, backgroundColor: 'rgba(255,255,255,0.04)' },
  badgeName: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13, paddingHorizontal: 2, marginTop: 4 },
  seeAllBtn: { paddingVertical: 8, alignItems: 'center' },
  seeAllText: { color: '#7B5CFF', fontSize: 11, fontWeight: '500' },

  // Badge modal — mirrors ProfileScreen's badge modal exactly
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sheetTitle: { fontSize: 15, fontWeight: 'bold' },
  sheetSub: { fontSize: 10, marginTop: 3 },
  gradeLegendRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, flexWrap: 'wrap' },
  gradeLegendChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginRight: 6, marginBottom: 6 },
  gradeLegendText: { fontSize: 10, fontWeight: '600', paddingRight: 2 },
  badgesScrollArea: { paddingHorizontal: 20 },
  gradeGroupTitle: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  gradeBadgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  fullBadgeCard: { width: '48%', margin: '1%', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start' },
  fullBadgeCardLocked: { backgroundColor: 'rgba(255,255,255,0.02)' },
  fullBadgeInfo: { flex: 1 },
  fullBadgeName: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  fullBadgeDesc: { fontSize: 10, marginTop: 2, lineHeight: 14 },

});
