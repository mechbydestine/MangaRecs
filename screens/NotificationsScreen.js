import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { profileAccent } from '../utils/profileThemes';
// expo-image rather than RN's Image: these are remote avatars/covers and
// RN's Android disk cache is effectively absent, so they re-downloaded on
// every render. cachePolicy defaults to 'disk'.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useNotifications } from '../utils/NotificationsContext';
import StarLogo from '../components/StarLogo';
import { RowSkeleton } from '../components/Skeleton';
import { useResponsive } from '../utils/responsive';
import { HIT_SLOP } from '../utils/tokens';

// Takes the theme rather than freezing the brand purple: the accent types
// here (friend request, reply, DM) are app chrome and must follow the palette
// the user picked, the same as every other accent.
const typeMeta = (colors) => ({
  friend_request:  { icon: 'person-add',           color: colors.primary },
  friend_accepted: { icon: 'people',               color: '#1D9E75' },
  follow:          { icon: 'person-add',           color: '#378ADD' },
  like:            { icon: 'heart',                color: '#E8527A' },
  comment:         { icon: 'chatbubble',           color: '#1D9E75' },
  reply:           { icon: 'chatbubble-ellipses',  color: colors.primary },
  badge:           { icon: 'trophy',               color: '#f59e0b' },
  system:          { icon: 'notifications',        color: '#EF9F27' },
  direct_message:  { icon: 'chatbubble-ellipses',  color: colors.primary },
});

// Same palette as ProfileScreen/FriendProfileScreen's theme picker — resolves a
// profile's stored `color` (a theme id like 'rose', or a raw hex for older
// accounts) down to an actual hex value for the avatar fallback background.
const resolveAvatarColor = profileAccent;

function NotifAvatar({ item }) {
  const { colors } = useTheme();
  // App-generated notifications (badge unlocks, MangaRecs-branded recs):
  // just the glowy star, no background shape of any kind.
  if (item.isMangaRec) {
    return (
      <View style={styles.starWrap}>
        <StarLogo size={26} />
      </View>
    );
  }
  // Real friend/actor: show their actual pfp — image if they have one,
  // otherwise their profile color with their initial, never a generic icon.
  if (item.actorId) {
    return (
      <View style={[styles.iconWrap, { backgroundColor: resolveAvatarColor(item.actorColor), overflow: 'hidden' }]}>
        {item.actorAvatarUrl ? (
          <Image source={{ uri: item.actorAvatarUrl }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarInitial}>{item.avatar}</Text>
        )}
      </View>
    );
  }
  // No actor and not app-branded (e.g. new-chapter alerts) — generic type icon.
  const META = typeMeta(colors);
  const meta = META[item.type] || META.system;
  return (
    <View style={[styles.iconWrap, { backgroundColor: `${meta.color}22` }]}>
      <Ionicons name={meta.icon} size={18} color={meta.color} />
    </View>
  );
}

function NotifItem({ item, onAccept, onNavigate, colors }) {
  const t = useT();
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: item.read ? colors.card : 'rgba(120, 88, 255,0.08)', borderBottomColor: colors.border }]}
      activeOpacity={0.75}
      onPress={() => onNavigate && onNavigate(item)}>
      <NotifAvatar item={item} />
      <View style={styles.body}>
        <Text style={[styles.user, { color: colors.text }]}>
          <Text style={styles.bold}>{item.type === 'badge' && item.badgeIcon ? `${item.badgeIcon} ` : ''}{item.user}</Text>
          {'  '}
          <Text style={[styles.bodyText, { color: colors.muted }]}>{item.text}</Text>
        </Text>
        <Text style={[styles.time, { color: colors.muted }]}>{item.time}</Text>
        {item.type === 'friend_request' && !item.read && item.friendshipId && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
              onPress={() => onAccept(item.friendshipId)}>
              <Text style={[styles.acceptText, { color: colors.onPrimary }]}>{t('messages.accept')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const tabBarHeight = useBottomTabBarHeight();
  const { items, loading, loadingMore, hasMore, load, loadMore, clearAll: handleClearAll, acceptFriendRequest: handleAccept, markOneRead, markAllSeen, deleteNotification } = useNotifications();

  // Pull-to-refresh. `loading` drives the full-screen skeleton, so it can't
  // double as the spinner state here — that would swap the list out for
  // skeletons mid-pull instead of showing the pull indicator.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Leaving the screen means everything on it has been seen — clear the badge
  // (pending friend requests stay unread so their Accept button survives)
  useFocusEffect(useCallback(() => {
    load();
    return () => { markAllSeen(); };
  }, [load]));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity hitSlop={HIT_SLOP} style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('friend.goBack')}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('notifications.title')}</Text>
        <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
          <Text style={[styles.clearBtnText, { color: colors.muted }]}>{t('notifications.clearAll')}</Text>
        </TouchableOpacity>
      </View>

      {/* `load()` flips the context's `loading`, so without the `!refreshing`
          guard a pull-to-refresh would replace the list with skeletons and
          unmount the RefreshControl mid-gesture. */}
      {loading && !refreshing ? (
        <View style={[{ paddingTop: 12 }, isTablet && styles.tabletWrap]}>
          <RowSkeleton count={6} />
        </View>
      ) : (
        <FlatList
          style={isTablet ? styles.tabletWrap : null}
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.muted}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <NotifItem
              item={item}
              onAccept={handleAccept}
              colors={colors}
              onNavigate={(n) => {
                if (n.type === 'direct_message') {
                  deleteNotification(n.id);
                } else {
                  markOneRead(n.id);
                }
                if ((n.type === 'friend_request' || n.type === 'friend_accepted') && n.actorId) {
                  navigation.navigate('FriendProfile', { id: n.actorId });
                } else if (n.type === 'reply' && n.seriesTitle) {
                  navigation.navigate('Discussion', {
                    title: n.seriesTitle,
                    searchKey: n.seriesTitle,
                    lang: 'ja',
                    color: '#1A1A2E',
                    latestChapter: n.seriesChapter || 1,
                    discussing: null,
                  });
                } else if ((n.type === 'like' || n.type === 'comment') && n.seriesTitle) {
                  navigation.navigate('Reader', { searchQuery: n.seriesTitle, title: n.seriesTitle });
                } else if (n.type === 'direct_message' && n.actorId) {
                  navigation.navigate('DM', {
                    friendId: n.actorId,
                    friendName: n.user,
                    friendColor: n.actorColor,
                    friendAvatarUrl: n.actorAvatarUrl,
                  });
                } else if (n.type === 'badge') {
                  navigation.getParent()?.navigate('Profile');
                } else if (n.type === 'new_chapter' && n.seriesTitle) {
                  navigation.navigate('Reader', {
                    searchQuery: n.seriesTitle,
                    title: n.seriesTitle,
                    chapters: 0,
                  });
                }
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={colors.muted} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.muted} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('notifications.allCaughtUp')}</Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>{t('notifications.emptySub')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:      { width: 38, alignItems: 'flex-start' },
  clearBtn:     { paddingHorizontal: 4, paddingVertical: 4 },
  clearBtnText: { fontSize: 12, fontWeight: '500' },
  title:   { fontSize: 17, fontWeight: '600' },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footerLoading: { paddingVertical: 18, alignItems: 'center' },
  empty:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  starWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  body:     { flex: 1 },
  user:     { fontSize: 14, lineHeight: 20 },
  bold:     { fontWeight: '600' },
  bodyText: { fontWeight: '400' },
  time:     { fontSize: 12, marginTop: 3 },
  actions:  { flexDirection: 'row', marginTop: 8 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
