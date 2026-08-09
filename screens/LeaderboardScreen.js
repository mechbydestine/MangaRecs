import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { supabase } from '../supabase';
import { getBlockedIds } from '../utils/blocking';
import { profileAccent } from '../utils/profileThemes';
import { ALL_BADGES, BADGE_GRADES, GRADE_ORDER, computeEarnedBadgeIds, profileToBadgeStats } from '../utils/badges';
import BadgeIcon from '../components/BadgeIcon';
import MobileHeader from '../components/MobileHeader';
import { useResponsive } from '../utils/responsive';
import { light } from '../utils/haptics';
import { HIT_SLOP } from '../utils/tokens';

// Twenty, not fifty. A board deep enough that the top places look unreachable
// stops being a goal and becomes wallpaper — Duolingo's leagues cap at 30 for
// the same reason, and the top of a 20-row board is somewhere a regular reader
// can actually picture themselves.
const BOARD_SIZE = 20;

// Hours read leads the ranking; chapters read breaks ties. Streak and the
// metric pills are gone — three boards nobody could compare, and a row whose
// number changed meaning as you tapped. Badges appear on every row instead of
// being a fourth thing to sort by: they say *what kind* of reader someone is,
// which one sortable number can't.
//
// Chapters is not decoration. `hours_read` is null or 0 for most accounts
// (reading time only started being recorded later), while chapters_read is
// populated — so ranking on hours ALONE and filtering to hours > 0 empties the
// board down to the handful of accounts that have it. Both are shown on every
// row for the same reason: an hours-only row reads as "0m" for a reader who
// has genuinely finished 28 chapters.
function rankScore(a, b) {
  return (b.hours - a.hours) || (b.chapters - a.chapters);
}

// Over-fetch so client-side filtering (blocked users, the friends scope) can
// still fill a board of BOARD_SIZE, and so a viewer outside the top 20 can
// still be given a real rank without a second round-trip.
const FETCH_SIZE = 120;

const PROFILE_FIELDS =
  'id, username, display_name, color, avatar_url, chapters_read, hours_read, streak_count, ' +
  'friends_count, comments_count, likes_given, series_count, completed_count, showcase_badges';

function formatHours(hours) {
  const h = Number(hours) || 0;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 100) return `${h.toFixed(h % 1 === 0 ? 0 : 1)}h`;
  return `${Math.round(h).toLocaleString()}h`;
}

// Highest-tier badge someone has earned, used when they've pinned nothing.
function topBadge(badgeIds) {
  let best = null;
  let bestRank = -1;
  for (const id of badgeIds || []) {
    const badge = ALL_BADGES.find((b) => b.id === id);
    if (!badge) continue;
    const rank = GRADE_ORDER.indexOf(badge.grade);
    if (rank > bestRank) { bestRank = rank; best = badge; }
  }
  return best;
}

function toEntry(p, uid) {
  const earned = computeEarnedBadgeIds(profileToBadgeStats(p));
  const showcase = (Array.isArray(p.showcase_badges) ? p.showcase_badges : [])
    .filter((id) => earned.has(id))
    .slice(0, 3)
    .map((id) => ALL_BADGES.find((b) => b.id === id))
    .filter(Boolean);
  const fallback = topBadge(Array.from(earned));
  const name = p.display_name || p.username || 'Reader';
  return {
    id: p.id,
    name,
    username: p.username || null,
    initial: name.charAt(0).toUpperCase(),
    avatarUrl: p.avatar_url || null,
    color: p.color,
    hours: Number(p.hours_read) || 0,
    chapters: Number(p.chapters_read) || 0,
    badgeCount: earned.size,
    // Pinned showcase wins; otherwise the single best badge stands in, so a
    // row is never visually empty for someone who has earned something.
    badges: showcase.length ? showcase : (fallback ? [fallback] : []),
    topGrade: fallback?.grade || null,
    isMe: p.id === uid,
  };
}

// ── Badge cluster ───────────────────────────────────────────────────────────
// Shields sit next to the hours rather than under a separate tab. The count
// pill only appears past what's rendered, so a three-badge showcase reads as
// three shields and a 40-badge veteran reads as three shields + "+37".
function BadgeCluster({ entry, size = 22, colors }) {
  if (!entry.badges.length) return null;
  const extra = entry.badgeCount - entry.badges.length;
  return (
    <View style={styles.badgeCluster}>
      {entry.badges.map((b) => <BadgeIcon key={b.id} badge={b} size={size} />)}
      {extra > 0 && (
        <Text style={[styles.badgeMore, { color: colors.muted }]}>+{extra}</Text>
      )}
    </View>
  );
}

// ── Podium ──────────────────────────────────────────────────────────────────
// #1 centre and raised, #2 left, #3 right. Ranks 1-3 carry most of a
// leaderboard's motivational weight, and a flat list buries them in rows that
// look identical to rank 17.
const PODIUM_ORDER = [1, 0, 2]; // render #2, #1, #3 left-to-right
const PODIUM_STYLE = [
  { ring: '#FFD700', label: '1', avatar: 74, lift: 0, medal: '🥇' },
  { ring: '#C4CCD8', label: '2', avatar: 60, lift: 22, medal: '🥈' },
  { ring: '#D08A4E', label: '3', avatar: 60, lift: 30, medal: '🥉' },
];

function Podium({ entries, colors, onPress }) {
  return (
    <View style={styles.podium}>
      {PODIUM_ORDER.map((idx) => {
        const entry = entries[idx];
        const style = PODIUM_STYLE[idx];
        if (!entry) return <View key={idx} style={styles.podiumSlot} />;
        return (
          <TouchableOpacity
            key={entry.id}
            style={[styles.podiumSlot, { paddingTop: style.lift }]}
            activeOpacity={0.8}
            onPress={() => onPress(entry)}
            accessibilityRole="button"
            accessibilityLabel={`Rank ${style.label}, ${entry.name}, ${formatHours(entry.hours)} read`}>
            {idx === 0 && <Text style={styles.crown}>👑</Text>}
            <View
              style={[
                styles.podiumAvatar,
                {
                  width: style.avatar,
                  height: style.avatar,
                  borderRadius: style.avatar / 2,
                  borderColor: style.ring,
                  backgroundColor: profileAccent(entry.color),
                },
              ]}>
              {entry.avatarUrl
                ? <Image source={{ uri: entry.avatarUrl }} style={styles.fill} contentFit="cover" />
                : <Text style={[styles.podiumInitial, { fontSize: style.avatar * 0.38 }]}>{entry.initial}</Text>}
            </View>
            <Text style={styles.podiumMedal}>{style.medal}</Text>
            <Text
              style={[styles.podiumName, { color: entry.isMe ? colors.primary : colors.text }]}
              numberOfLines={1}>
              {entry.isMe ? 'You' : entry.name}
            </Text>
            <Text style={[styles.podiumHours, { color: style.ring }]}>{formatHours(entry.hours)}</Text>
            {entry.chapters > 0 && (
              <Text style={[styles.podiumChapters, { color: colors.muted }]}>
                {entry.chapters.toLocaleString()} ch
              </Text>
            )}
            <BadgeCluster entry={entry} size={18} colors={colors} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────
function Row({ entry, rank, colors, onPress, pinned = false }) {
  const grade = entry.topGrade ? BADGE_GRADES[entry.topGrade] : null;
  // The pinned row is the viewer's own standing — there is nowhere to navigate
  // to, so it must not offer press feedback for an action that never happens.
  const pressable = !!onPress && !entry.isMe;
  return (
    <TouchableOpacity
      activeOpacity={pressable ? 0.75 : 1}
      disabled={!pressable}
      onPress={pressable ? () => onPress(entry) : undefined}
      style={[
        styles.row,
        {
          backgroundColor: entry.isMe ? 'rgba(120, 88, 255,0.10)' : colors.card,
          borderColor: entry.isMe ? 'rgba(120, 88, 255,0.45)' : colors.border,
        },
        pinned && styles.rowPinned,
      ]}
      accessibilityRole={pressable ? 'button' : 'text'}
      accessibilityLabel={`Rank ${rank}, ${entry.name}, ${formatHours(entry.hours)} read, ${entry.badgeCount} badges`}>
      <Text style={[styles.rank, { color: entry.isMe ? colors.primary : colors.muted }]}>{rank}</Text>

      <View
        style={[
          styles.avatar,
          { backgroundColor: profileAccent(entry.color), borderColor: grade?.border || 'transparent' },
        ]}>
        {entry.avatarUrl
          ? <Image source={{ uri: entry.avatarUrl }} style={styles.fill} contentFit="cover" />
          : <Text style={styles.avatarInitial}>{entry.initial}</Text>}
      </View>

      <View style={styles.rowInfo}>
        <View style={styles.rowNameLine}>
          <Text
            style={[styles.rowName, { color: entry.isMe ? colors.primary : colors.text }]}
            numberOfLines={1}>
            {entry.name}
          </Text>
          {entry.isMe && (
            <View style={styles.youChip}><Text style={styles.youChipText}>YOU</Text></View>
          )}
        </View>
        <BadgeCluster entry={entry} colors={colors} />
      </View>

      <View style={styles.rowStat}>
        <Text style={[styles.rowHours, { color: colors.text }]}>{formatHours(entry.hours)}</Text>
        <Text style={[styles.rowHoursLabel, { color: colors.muted }]}>
          {entry.chapters > 0 ? `${entry.chapters.toLocaleString()} ch` : 'read'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const t = useT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();

  const [scope, setScope] = useState('global'); // 'global' | 'friends'
  const [rows, setRows] = useState([]);
  const [friendIds, setFriendIds] = useState(null); // null = not loaded yet
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // Global standing for someone outside the top 20 — a plain count query,
  // because the board itself only ever holds BOARD_SIZE rows.
  const [myGlobalRank, setMyGlobalRank] = useState(null);
  // The viewer's own row, kept separately so the pinned bar still works when
  // they placed outside the over-fetch and are absent from `rows`.
  const [myEntry, setMyEntry] = useState(null);

  const load = useCallback(async () => {
    setError(false);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    setUid(userId);

    const [{ data, error: qErr }, blocked] = await Promise.all([
      supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .not('username', 'is', null)
        .neq('username', '')
        // Anyone who has read ANYTHING. Filtering on hours alone hid every
        // account whose hours_read is null/0 but who has real chapters — which
        // is most of them.
        .or('hours_read.gt.0,chapters_read.gt.0')
        // nullsFirst matters: Postgres puts NULLs FIRST on a DESC sort, so
        // without this an account with no recorded hours outranks one with
        // hundreds.
        .order('hours_read', { ascending: false, nullsFirst: false })
        .order('chapters_read', { ascending: false, nullsFirst: false })
        .limit(FETCH_SIZE),
      userId ? getBlockedIds(userId) : Promise.resolve(new Set()),
    ]);

    if (qErr || !data) { setError(true); setRows([]); return; }
    // Sorted client-side with the same comparator the ranks are read from, so
    // display order and rank numbers can never disagree.
    const entries = data
      .filter((p) => !blocked.has(p.id))
      .map((p) => toEntry(p, userId))
      .sort(rankScore);
    setRows(entries);

    if (userId) {
      // Friends for the Friends scope. Mirrors SocialScreen's query: either
      // side of an accepted friendship, minus anyone blocked.
      const { data: fr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');
      setFriendIds(
        new Set((fr || [])
          .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
          .filter((id) => !blocked.has(id))),
      );

      // Rank comes from `entries` — the same filtered, same-comparator list the
      // board renders. A separate count query would have to reproduce the
      // hours-then-chapters tiebreak in PostgREST filter syntax and would
      // silently disagree with the displayed order the moment it drifted.
      const idx = entries.findIndex((e) => e.isMe);
      setMyGlobalRank(idx >= 0 ? idx + 1 : null);

      // The viewer is only in `entries` when they placed inside FETCH_SIZE.
      // Past that they fall out of the over-fetch entirely — which is exactly
      // the reader the pinned bar exists for — so fetch their own row directly
      // rather than looking it up in a board they aren't on. Their rank stays
      // null there: beyond FETCH_SIZE the real position is genuinely unknown,
      // and a made-up number is worse than none.
      if (idx >= 0) {
        setMyEntry(entries[idx]);
      } else {
        const { data: own } = await supabase
          .from('profiles')
          .select(PROFILE_FIELDS)
          .eq('id', userId)
          .maybeSingle();
        setMyEntry(own ? toEntry(own, userId) : null);
      }
    } else {
      setFriendIds(new Set());
      setMyEntry(null);
      setMyGlobalRank(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const board = useMemo(() => {
    const scoped = scope === 'friends'
      ? rows.filter((e) => e.isMe || friendIds?.has(e.id))
      : rows;
    return scoped.slice(0, BOARD_SIZE);
  }, [rows, scope, friendIds]);

  // Where the viewer actually stands, for the pinned bar. Inside the board it
  // stays null — the highlighted row already answers the question, and a
  // duplicate of a row that's on screen is noise.
  const myStanding = useMemo(() => {
    if (!uid) return null;
    if (board.some((e) => e.isMe)) return null;
    const me = rows.find((e) => e.isMe) || myEntry;
    if (!me) return null;
    if (scope === 'friends') {
      // Rank among the friends actually on the board. `me` may not be in
      // `rows` at all, so count who beats them rather than indexing into it —
      // using the same hours-then-chapters comparator the board is sorted by.
      const ahead = rows.filter(
        (e) => !e.isMe && friendIds?.has(e.id) && rankScore(me, e) > 0,
      ).length;
      return { entry: me, rank: ahead + 1 };
    }
    return { entry: me, rank: myGlobalRank };
  }, [uid, board, rows, myEntry, scope, friendIds, myGlobalRank]);

  const openProfile = useCallback((entry) => {
    if (!entry || entry.isMe || !entry.id) return;
    navigation.navigate('FriendProfile', { id: entry.id, username: entry.username });
  }, [navigation]);

  const switchScope = useCallback((next) => {
    light();
    setScope(next);
  }, []);

  const podiumEntries = board.slice(0, 3);
  const listEntries = board.slice(3);
  // Friends scope where the only person on the board is the viewer.
  const aloneOnFriendsBoard =
    scope === 'friends' && !loading && board.length > 0 && board.every((e) => e.isMe);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileHeader title={t('community.leaderboard')} />

      <View style={[styles.scopeBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { key: 'global', icon: 'globe-outline', label: t('community.global') },
          { key: 'friends', icon: 'people-outline', label: t('messages.friends') },
        ].map((s) => {
          const active = scope === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.scopeTab, active && { backgroundColor: colors.primary }]}
              onPress={() => switchScope(s.key)}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}>
              <Ionicons name={s.icon} size={14} color={active ? '#fff' : colors.muted} />
              <Text style={[styles.scopeText, { color: active ? '#fff' : colors.muted }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {t('community.rankedByHours', { count: BOARD_SIZE })}
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={listEntries}
          keyExtractor={(item) => item.id}
          style={isTablet ? styles.tabletWrap : null}
          contentContainerStyle={{
            paddingHorizontal: 16,
            // Room for the pinned bar so the last row isn't trapped under it.
            paddingBottom: insets.bottom + (myStanding ? 104 : 32),
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListHeaderComponent={
            <>
              {podiumEntries.length > 0 && (
                <Podium entries={podiumEntries} colors={colors} onPress={openProfile} />
              )}
              {/* A Friends board containing nobody but the viewer is not an
                  empty list — the podium is populated — so ListEmptyComponent
                  never fires and it silently looks like a broken board rather
                  than "you have no friends on here yet". */}
              {aloneOnFriendsBoard && (
                <View style={[styles.aloneHint, { borderColor: colors.border }]}>
                  <Ionicons name="people-outline" size={16} color={colors.muted} />
                  <Text style={[styles.aloneHintText, { color: colors.muted }]}>
                    {t('community.noFriendRankings')}
                  </Text>
                </View>
              )}
            </>
          }
          renderItem={({ item, index }) => (
            <Row entry={item} rank={index + 4} colors={colors} onPress={openProfile} />
          )}
          ListEmptyComponent={
            podiumEntries.length > 0 ? null : (
              <View style={styles.empty}>
                <Ionicons
                  name={error ? 'cloud-offline-outline' : scope === 'friends' ? 'people-outline' : 'trophy-outline'}
                  size={34}
                  color={colors.muted}
                />
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  {error
                    ? t('community.leaderboardError')
                    : scope === 'friends'
                      ? t('community.noFriendRankings')
                      : t('community.noRankings')}
                </Text>
                {error && (
                  <TouchableOpacity onPress={onRefresh} style={[styles.retryBtn, { borderColor: colors.border }]}>
                    <Text style={[styles.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          }
        />
      )}

      {/* Your standing, pinned — without it a board that cuts off at 20 tells
          everyone outside the top 20 nothing at all about themselves. */}
      {myStanding && (
        <View
          style={[
            styles.pinnedWrap,
            { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}>
          <Row
            entry={myStanding.entry}
            rank={myStanding.rank ?? '—'}
            colors={colors}
            pinned
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  fill: { ...StyleSheet.absoluteFillObject },

  scopeBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  scopeText: { fontSize: 13, fontWeight: '600' },

  subtitle: { fontSize: 11.5, textAlign: 'center', marginTop: 10, marginBottom: 4 },

  // ── Podium ──
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingTop: 18, paddingBottom: 22, gap: 6 },
  podiumSlot: { flex: 1, alignItems: 'center' },
  crown: { fontSize: 20, marginBottom: 2 },
  podiumAvatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, overflow: 'hidden' },
  podiumInitial: { color: '#fff', fontWeight: '800' },
  podiumMedal: { fontSize: 18, marginTop: -12, marginBottom: 2 },
  podiumName: { fontSize: 12.5, fontWeight: '700', maxWidth: '96%', textAlign: 'center' },
  podiumHours: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  podiumChapters: { fontSize: 10.5, marginTop: 1 },

  // ── Rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowPinned: { marginBottom: 0 },
  rank: { width: 26, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  avatar: {
    width: 38, height: 38, borderRadius: 19, marginLeft: 6, marginRight: 10,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2,
  },
  avatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowInfo: { flex: 1, marginRight: 8 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  youChip: { backgroundColor: 'rgba(120, 88, 255,0.2)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  youChipText: { color: '#7858FF', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  rowStat: { alignItems: 'flex-end' },
  rowHours: { fontSize: 15, fontWeight: '800' },
  rowHoursLabel: { fontSize: 9.5, marginTop: 1 },

  badgeCluster: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 2 },
  badgeMore: { fontSize: 10, fontWeight: '700', marginLeft: 2 },

  pinnedWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },

  aloneHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  aloneHintText: { fontSize: 12.5, flex: 1, lineHeight: 18 },

  empty: { alignItems: 'center', paddingVertical: 56, gap: 12 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { fontSize: 12.5, fontWeight: '600' },
});
