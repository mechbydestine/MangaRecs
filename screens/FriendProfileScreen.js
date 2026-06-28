import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../supabase';
import { ALL_BADGES, BADGE_GRADES, computeEarnedBadgeIds, profileToBadgeStats } from '../utils/badges';
import { useTheme } from '../utils/ThemeContext';
import MobileHeader from '../components/MobileHeader';
import { MangaCover } from '../utils/mangaCovers';
import BadgeIcon from '../components/BadgeIcon';

const PROFILE_THEMES = [
  { id: 'default', label: 'Default', ring: '#534AB7', gradient: ['#534AB7', '#1D9E75'], banner: ['#534AB7', '#0D0D0F'] },
  { id: 'rose',    label: 'Rose',    ring: '#D4537E', gradient: ['#D4537E', '#993556'], banner: ['#D4537E', '#0D0D0F'] },
  { id: 'sky',     label: 'Sky',     ring: '#378ADD', gradient: ['#378ADD', '#185FA5'], banner: ['#378ADD', '#0D0D0F'] },
  { id: 'emerald', label: 'Emerald', ring: '#1D9E75', gradient: ['#1D9E75', '#0F6E56'], banner: ['#1D9E75', '#0D0D0F'] },
  { id: 'amber',   label: 'Amber',   ring: '#EF9F27', gradient: ['#EF9F27', '#BA7517'], banner: ['#EF9F27', '#0D0D0F'] },
  { id: 'violet',  label: 'Violet',  ring: '#7F77DD', gradient: ['#7F77DD', '#D4537E'], banner: ['#7F77DD', '#0D0D0F'] },
];

const GRADE_RANK = { mythic: 0, gold: 1, purple: 2, indigo: 3, blue: 4, green: 5, grey: 6 };

const fmtHrs = (h) => {
  if (!h || h <= 0) return '0m';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h)}h`;
};

function StreakCalendar({ dailyLog }) {
  const WEEKS = 10;
  const DAYS  = 7;

  const cells = (() => {
    const log = dailyLog || {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arr = [];
    for (let i = WEEKS * DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      arr.push(log[d.toISOString().slice(0, 10)] || 0);
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

  // Columns = weeks (left = oldest, right = most recent), rows = days top→bottom
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

export default function FriendProfileScreen({ route }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { id } = route.params || {};
  const [profile, setProfile]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [myId, setMyId]                 = useState(null);
  const [endorsed, setEndorsed]         = useState({});
  const [endorseCounts, setEndorseCounts] = useState({});
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [entriesRead, setEntriesRead]     = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyId(user.id);
    });
    loadProfile();
    loadEntriesRead();
  }, [id]);

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

  // Live endorsement count updates via Realtime
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`endorsements-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'badge_endorsements',
        filter: `recipient_id=eq.${id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setEndorseCounts((prev) => ({
            ...prev,
            [payload.new.badge_id]: (prev[payload.new.badge_id] || 0) + 1,
          }));
        } else if (payload.eventType === 'DELETE') {
          setEndorseCounts((prev) => ({
            ...prev,
            [payload.old.badge_id]: Math.max(0, (prev[payload.old.badge_id] || 0) - 1),
          }));
        }
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
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.id) {
          loadMyEndorsements(user.id, id);
          loadAllEndorsementCounts(id);
        }
      });
      return;
    }
    setProfile(null);
    setLoading(false);
  }

  async function loadMyEndorsements(uid, friendId) {
    const { data } = await supabase
      .from('badge_endorsements')
      .select('badge_id')
      .eq('endorser_id', uid)
      .eq('recipient_id', friendId);
    if (data?.length) {
      const map = {};
      data.forEach((r) => { map[r.badge_id] = true; });
      setEndorsed(map);
    }
  }

  async function loadAllEndorsementCounts(friendId) {
    const { data } = await supabase
      .from('badge_endorsements')
      .select('badge_id')
      .eq('recipient_id', friendId);
    if (data) {
      const counts = {};
      data.forEach((r) => { counts[r.badge_id] = (counts[r.badge_id] || 0) + 1; });
      setEndorseCounts(counts);
    }
  }

  // ── Badge data — same computation as ProfileScreen ───────────────────────

  const earnedIds = useMemo(
    () => profile ? computeEarnedBadgeIds(profileToBadgeStats(profile)) : new Set(),
    [profile]
  );

  const badgeFlatData = useMemo(() => {
    const groups = Object.keys(BADGE_GRADES).map((gradeKey) => ({
      gradeKey,
      grade: BADGE_GRADES[gradeKey],
      badges: ALL_BADGES.filter((b) => b.grade === gradeKey && (!b.hidden || earnedIds.has(b.id))),
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

  async function handleEndorse(badgeId) {
    if (!myId || !profile?.id || myId === profile.id) return;
    const isEndorsed = !!endorsed[badgeId];
    // Optimistic UI — update both states immediately
    setEndorsed((prev) => ({ ...prev, [badgeId]: !isEndorsed }));
    setEndorseCounts((prev) => ({
      ...prev,
      [badgeId]: Math.max(0, (prev[badgeId] || 0) + (isEndorsed ? -1 : 1)),
    }));
    if (isEndorsed) {
      await supabase.from('badge_endorsements')
        .delete()
        .eq('endorser_id', myId)
        .eq('recipient_id', profile.id)
        .eq('badge_id', badgeId);
    } else {
      const { error } = await supabase.from('badge_endorsements').insert({
        endorser_id: myId,
        recipient_id: profile.id,
        badge_id: badgeId,
      });
      if (error) {
        // Revert on failure
        setEndorsed((prev) => ({ ...prev, [badgeId]: false }));
        setEndorseCounts((prev) => ({
          ...prev,
          [badgeId]: Math.max(0, (prev[badgeId] || 0) - 1),
        }));
      }
    }
  }

  // ── Loading / not found ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.notFoundContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundText, { color: colors.muted }]}>Friend not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.notFoundLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived display values ──────────────────────────────────────────────

  const theme          = PROFILE_THEMES.find((t) => t.id === profile.color) || PROFILE_THEMES[0];
  const avatarInitial  = (profile.username || '?').charAt(0).toUpperCase();
  const favorites      = Array.isArray(profile.favorites) ? profile.favorites : [];
  const dailyLog       = profile.daily_log || {};

  const todayKey   = new Date().toISOString().slice(0, 10);
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileHeader
        title={profile.username}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {profile.online && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
            )}
            {profile.id && (
              <TouchableOpacity
                style={styles.msgHeaderBtn}
                onPress={() => navigation.navigate('DM', {
                  friendId: profile.id,
                  friendName: profile.username,
                  friendColor: profile.color,
                  friendAvatarUrl: profile.avatar_url || null,
                })}
                activeOpacity={0.8}>
                <Ionicons name="chatbubble-outline" size={16} color="#534AB7" />
                <Text style={styles.msgHeaderText}>Message</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">

        {/* Banner + avatar card — identical structure to ProfileScreen */}
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
                <Text style={[styles.username, { color: colors.text }]}>{profile.username}</Text>
                {profile.bio ? (
                  <Text style={[styles.bioText, { color: colors.muted }]}>{profile.bio}</Text>
                ) : null}
              </View>
            </View>
            <Text style={[styles.handle, { color: colors.muted }]}>
              @{(profile.username || '').toLowerCase()}
              {profile.streak_count > 0 ? `  ·  🔥 ${profile.streak_count}d streak` : ''}
            </Text>
            {profile.currently_reading ? (
              <Text style={[styles.currentlyReading, { color: colors.muted }]}>
                Reading: {profile.currently_reading}
                {profile.current_chapter ? ` · Ch. ${profile.current_chapter}` : ''}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stats — same icons and labels as ProfileScreen */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="book" size={18} color="#534AB7" />
            <Text style={[styles.statValue, { color: colors.text }]}>{entriesRead}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Read</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="time" size={18} color="#1D9E75" />
            <Text style={[styles.statValue, { color: colors.text }]}>{fmtHrs(profile.hours_read)}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Time Read</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="trophy" size={18} color="#FFD700" />
            <Text style={[styles.statValue, { color: colors.text, fontSize: 14 }]} numberOfLines={1}>
              {profile.favorite_genre || '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Fav. Genre</Text>
          </View>
        </View>

        {/* Reading Streak + Faves — exact same layout as ProfileScreen */}
        <View style={[styles.streakSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.streakTitle, { color: colors.text }]}>Reading Streak</Text>
          <View style={styles.streakBody}>
            <View style={styles.streakLeft}>
              <View style={styles.streakBadges}>
                {todayLabel && (
                  <View style={styles.todayBadge}>
                    <Ionicons name="time" size={11} color="#534AB7" />
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
                {[
                  { bg: '#0D0D0F', label: 'None' },
                  { bg: '#4A40A0', label: 'Some' },
                  { bg: '#534AB7', label: 'Lots' },
                ].map(({ bg, label }) => (
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
                <View style={[styles.favesEmptyCard, { borderColor: 'rgba(83,74,183,0.25)' }]}>
                  <Text style={styles.favesEmptyText}>No faves yet</Text>
                </View>
              ) : (
                <View style={styles.faveFeatCard}>
                  <MangaCover
                    title={favorites[0].title}
                    searchKey={favorites[0].searchKey}
                    lang={favorites[0].lang}
                    color={favorites[0].color}
                    style={styles.faveFeatGrad}
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.88)']}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, justifyContent: 'flex-end', padding: 8 }}
                    >
                      <Text style={styles.faveFeatTitle} numberOfLines={3}>{favorites[0].title}</Text>
                    </LinearGradient>
                  </MangaCover>
                </View>
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
                const count = endorseCounts[badge.id] || 0;
                return (
                  <TouchableOpacity
                    key={badge.id}
                    style={[styles.badgeCard, { borderColor: grade.border }]}
                    onPress={() => setShowAllBadges(true)}
                    activeOpacity={0.8}>
                    <BadgeIcon badge={badge} size={48} />
                    <Text style={[styles.badgeName, { color: grade.color }]} numberOfLines={2}>{badge.name}</Text>
                    {count > 0 && <Text style={styles.endorseCountMini}>♥ {count}</Text>}
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
      </ScrollView>

      {/* All badges modal — same grouped layout as ProfileScreen + endorse + live count */}
      <Modal visible={showAllBadges} animationType="none" transparent onRequestClose={() => setShowAllBadges(false)}>
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
                        const count  = endorseCounts[badge.id] || 0;
                        const isMe   = myId === profile.id;
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
                              <Text style={[styles.fullBadgeName, { color: earned ? item.grade.color : colors.muted }]}>
                                {badge.name}
                              </Text>
                              <Text style={[styles.fullBadgeDesc, { color: colors.muted }]}>{badge.desc}</Text>

                              {/* Endorse button — only on earned badges, only if viewing someone else */}
                              {earned && !isMe && (
                                <TouchableOpacity
                                  onPress={() => handleEndorse(badge.id)}
                                  style={[
                                    styles.endorseBtn,
                                    { borderColor: colors.border },
                                    endorsed[badge.id] && styles.endorseBtnActive,
                                  ]}>
                                  <Ionicons
                                    name="thumbs-up"
                                    size={9}
                                    color={endorsed[badge.id] ? '#534AB7' : colors.muted}
                                  />
                                  <Text style={[
                                    styles.endorseBtnText,
                                    { color: colors.muted },
                                    endorsed[badge.id] && styles.endorseBtnTextActive,
                                  ]}>
                                    {endorsed[badge.id] ? 'Endorsed' : 'Endorse'}
                                  </Text>
                                  {count > 0 && (
                                    <Text style={[
                                      styles.endorseCount,
                                      { color: endorsed[badge.id] ? '#534AB7' : colors.muted },
                                    ]}>
                                      · {count}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              )}

                              {/* Own profile view — just show count if any */}
                              {earned && isMe && count > 0 && (
                                <Text style={[styles.endorseCountOwn, { color: colors.muted }]}>
                                  ♥ {count} endorsement{count !== 1 ? 's' : ''}
                                </Text>
                              )}
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
    </View>
  );
}

// ── Styles — mirrors ProfileScreen measurements exactly ───────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 14, marginBottom: 12 },
  notFoundLink: { color: '#534AB7', fontSize: 14, fontWeight: '600' },

  onlineBadge: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1D9E75', marginRight: 4 },
  onlineText: { color: '#1D9E75', fontSize: 10, fontWeight: '600' },
  msgHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(83,74,183,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  msgHeaderText: { color: '#534AB7', fontSize: 12, fontWeight: '600' },

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
  bioText: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  handle: { fontSize: 10, marginTop: 4 },
  currentlyReading: { fontSize: 10, marginTop: 3, fontStyle: 'italic' },

  // Stats — same as ProfileScreen
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1 },
  statValue: { fontSize: 18, fontWeight: 'bold', marginTop: 6, marginBottom: 2 },
  statLabel: { fontSize: 10, textAlign: 'center' },

  // Streak section — same as ProfileScreen
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
  favesEmptyText: { color: 'rgba(83,74,183,0.5)', fontSize: 10, textAlign: 'center' },
  favesPanelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  favesCountText: { fontSize: 11, fontWeight: '500' },

  // Badges section
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  badgeCountText: { fontSize: 10 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeCard: { width: '22%', margin: '1.5%', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, alignItems: 'center', minHeight: 80, backgroundColor: 'rgba(255,255,255,0.04)' },
  badgeName: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13, paddingHorizontal: 2, marginTop: 4 },
  endorseCountMini: { color: '#534AB7', fontSize: 8, marginTop: 2 },
  seeAllBtn: { paddingVertical: 8, alignItems: 'center' },
  seeAllText: { color: '#534AB7', fontSize: 11, fontWeight: '500' },

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
  fullBadgeCard: { width: '48%', margin: '1%', padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start' },
  fullBadgeCardLocked: { backgroundColor: 'rgba(255,255,255,0.02)' },
  fullBadgeInfo: { flex: 1 },
  fullBadgeName: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  fullBadgeDesc: { fontSize: 10, marginTop: 2, lineHeight: 14 },

  // Endorse button + count
  endorseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(155,154,163,0.08)' },
  endorseBtnActive: { borderColor: '#534AB7', backgroundColor: 'rgba(83,74,183,0.2)' },
  endorseBtnText: { fontSize: 10, fontWeight: '500', paddingRight: 2 },
  endorseBtnTextActive: { color: '#534AB7' },
  endorseCount: { fontSize: 10, fontWeight: '600' },
  endorseCountOwn: { fontSize: 10, marginTop: 4 },
});
