import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../supabase';
import { syncBadgeCount } from './pushNotifications';

const NotificationsContext = createContext(null);

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'just now';
}

function buildNotification(row) {
  const isMangaRec = row.type === 'badge' || (row.type === 'direct_message' && row.data?.message_type === 'recommendation');
  const name = isMangaRec ? 'MangaRecs' : (row.actor?.display_name || row.actor?.username || 'Someone');
  const d = row.data || {};
  let text = '';
  if (row.type === 'friend_request')       text = 'sent you a friend request';
  else if (row.type === 'friend_accepted') text = 'accepted your friend request';
  else if (row.type === 'follow')          text = 'started following you';
  else if (row.type === 'comment')         text = `commented on ${d.series_title || 'a series'}${d.text_preview ? `: "${d.text_preview}"` : ''}`;
  else if (row.type === 'reply')           text = `replied to your comment on ${d.series_title || 'a series'}${d.text_preview ? `: "${d.text_preview}"` : ''}`;
  else if (row.type === 'like')            text = `liked ${d.series_title || 'your series'}`;
  else if (row.type === 'badge')           text = `You unlocked "${d.badge_name || 'a badge'}" — ${d.badge_desc || ''}`;
  else if (row.type === 'direct_message')  text = d.message_type === 'recommendation' ? `sent a Rec: ${d.manga_title || 'a manga'}` : 'sent you a message';
  else                                     text = d.message || 'sent you a notification';
  return {
    id: row.id,
    friendshipId: d.friendship_id || null,
    actorId: row.actor_id || null,
    actorColor: row.actor?.color || null,
    actorAvatarUrl: row.actor?.avatar_url || null,
    isMangaRec,
    seriesTitle: d.series_title || null,
    seriesChapter: d.chapter || null,
    badgeIcon: d.badge_icon || null,
    type: row.type,
    user: name,
    avatar: name.charAt(0).toUpperCase(),
    text,
    time: relTime(row.created_at),
    read: row.read,
  };
}

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  const unreadCount = items.filter(n => !n.read).length;

  // Keep the OS-level app icon badge in sync with in-app unread count
  useEffect(() => { syncBadgeCount(unreadCount); }, [unreadCount]);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setUserId(uid);
    setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, data, read, created_at, actor:actor_id(username, display_name, color, avatar_url)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(40);

    setLoading(false);
    if (error || !data) return;

    // Badge unlocks are hidden until the badge system rework ships
    const built = data.filter((row) => row.type !== 'badge').map(buildNotification);
    built.sort((a, b) => Number(a.read) - Number(b.read));

    if (built.length === 0) {
      built.push({
        id: 'welcome', type: 'system', user: 'MangaRecs', avatar: 'M', isMangaRec: true,
        text: 'Welcome! Friend requests and comments will appear here.',
        time: 'just now', read: true,
        friendshipId: null, actorId: null, seriesTitle: null, badgeIcon: null,
      });
    }

    setItems(built);
  }, []);

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) load();
      else { setItems([]); setUserId(null); }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  // Realtime: new notification rows appear instantly (badge + list), no refresh needed
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifs-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        // All events (insert/update/delete) so read-state changes and removals
        // made on another device sync here instantly too
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    if (!userId) return;
    supabase.from('notifications').update({ read: true }).eq('user_id', userId).then(() => {});
  }

  // "Seen" pass: called when the user closes the notification panel/screen.
  // Marks everything read EXCEPT friend requests that still need an action,
  // so the unread badge clears but the Accept button stays available.
  async function markAllSeen() {
    setItems(prev => prev.map(n => n.type === 'friend_request' ? n : { ...n, read: true }));
    let uid = userId;
    if (!uid) {
      const { data: { session } } = await supabase.auth.getSession();
      uid = session?.user?.id;
    }
    if (!uid) return;
    supabase.from('notifications')
      .update({ read: true })
      .eq('user_id', uid)
      .neq('type', 'friend_request')
      .then(() => {});
  }

  async function markOneRead(id) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (userId) supabase.from('notifications').update({ read: true }).eq('id', id).then(() => {});
  }

  // Fully removes a notification (used once the user has actually acted on it,
  // e.g. opened the DM thread it points to) rather than just flagging it read.
  async function deleteNotification(id) {
    setItems(prev => prev.filter(n => n.id !== id));
    if (!userId) return;
    supabase.from('notifications').delete().eq('id', id).then(() => {});
  }

  // Mark all direct_message notifications from one sender as read — called when
  // the user opens (or leaves) that DM thread so the badge clears immediately.
  async function markDmNotifsRead(actorId) {
    if (!actorId) return;
    setItems(prev => prev.filter(n => !(n.type === 'direct_message' && n.actorId === actorId)));
    if (!userId) return;
    supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('actor_id', actorId)
      .eq('type', 'direct_message')
      .then(() => {});
  }

  async function clearAll() {
    setItems([]);
    if (!userId) return;
    supabase.from('notifications').delete().eq('user_id', userId).then(() => {});
  }

  async function acceptFriendRequest(friendshipId) {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);

    const { data: friendship } = await supabase
      .from('friendships')
      .select('requester_id')
      .eq('id', friendshipId)
      .maybeSingle();

    if (friendship?.requester_id && currentUserId) {
      supabase.from('notifications').insert({
        user_id: friendship.requester_id,
        actor_id: currentUserId,
        type: 'friend_accepted',
        data: {},
      }).then(() => {});
    }

    const notifId = items.find(i => i.friendshipId === friendshipId)?.id;
    if (notifId) {
      supabase.from('notifications').update({ read: true }).eq('id', notifId).then(() => {});
    }
    setItems(prev => prev.map(item =>
      item.friendshipId === friendshipId ? { ...item, read: true } : item
    ));
  }

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, loading, load, markAllRead, markAllSeen, markOneRead, deleteNotification, markDmNotifsRead, clearAll, acceptFriendRequest }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
