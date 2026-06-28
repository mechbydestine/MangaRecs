import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useNotifications } from '../utils/NotificationsContext';

const TYPE_META = {
  friend_request:  { icon: 'person-add',           color: '#0891B2' },
  friend_accepted: { icon: 'people',               color: '#1D9E75' },
  like:            { icon: 'heart',                color: '#E8527A' },
  comment:         { icon: 'chatbubble',           color: '#1D9E75' },
  reply:           { icon: 'chatbubble-ellipses',  color: '#0891B2' },
  badge:           { icon: 'trophy',               color: '#f59e0b' },
  system:          { icon: 'notifications',        color: '#EF9F27' },
  direct_message:  { icon: 'chatbubble-ellipses',  color: '#0891B2' },
};

function NotifItem({ item, onAccept, onNavigate, colors }) {
  const meta = TYPE_META[item.type] || TYPE_META.system;
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: item.read ? colors.card : 'rgba(8,145,178,0.08)', borderBottomColor: colors.border }]}
      activeOpacity={0.75}
      onPress={() => onNavigate && onNavigate(item)}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}22` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.user, { color: colors.text }]} numberOfLines={2}>
          <Text style={styles.bold}>{item.type === 'badge' && item.badgeIcon ? `${item.badgeIcon} ` : ''}{item.user}</Text>
          {'  '}
          <Text style={[styles.bodyText, { color: colors.muted }]}>{item.text}</Text>
        </Text>
        <Text style={[styles.time, { color: colors.muted }]}>{item.time}</Text>
        {item.type === 'friend_request' && !item.read && item.friendshipId && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: '#0891B2' }]}
              onPress={() => onAccept(item.friendshipId)}>
              <Text style={styles.acceptText}>Accept</Text>
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
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { items, loading, load, clearAll: handleClearAll, acceptFriendRequest: handleAccept, markOneRead } = useNotifications();

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
          <Text style={[styles.clearBtnText, { color: colors.muted }]}>Clear all</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#0891B2" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotifItem
              item={item}
              onAccept={handleAccept}
              colors={colors}
              onNavigate={(n) => {
                markOneRead(n.id);
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.muted} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>Friend requests, likes, and badges will show here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  body:     { flex: 1 },
  user:     { fontSize: 14, lineHeight: 20 },
  bold:     { fontWeight: '600' },
  bodyText: { fontWeight: '400' },
  time:     { fontSize: 12, marginTop: 3 },
  actions:  { flexDirection: 'row', marginTop: 8 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
