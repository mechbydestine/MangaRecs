import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../supabase';

const NotificationsContext = createContext(null);

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'just now';
}

function buildNotification(row) {
  const name = row.type === 'badge' ? 'Inklore' : (row.actor?.username || 'Someone');
  const d = row.data || {};
  let text = '';
  if (row.type === 'friend_request')       text = 'sent you a friend request';
  else if (row.type === 'friend_accepted') text = 'accepted your friend request';
  else if (row.type === 'comment')         text = `commented on ${d.series_title || 'a series'}${d.text_preview ? `: "${d.text_preview}"` : ''}`;
  else if (row.type === 'reply')           text = `replied to your comment on ${d.series_title || 'a series'}${d.text_preview ? `: "${d.text_preview}"` : ''}`;
  else if (row.type === 'like')            text = `liked ${d.series_title || 'your series'}`;
  else if (row.type === 'badge')           text = `You unlocked "${d.badge_name || 'a badge'}" — ${d.badge_desc || ''}`;
  else if (row.type === 'direct_message')  text = d.message_type === 'recommendation' ? `recommended ${d.manga_title || 'a manga'} to you` : 'sent you a message';
  else                                     text = d.message || 'sent you a notification';
  return {
    id: row.id,
    friendshipId: d.friendship_id || null,
    actorId: row.actor_id || null,
    actorColor: row.actor?.color || null,
    actorAvatarUrl: row.actor?.avatar_url || null,
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

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setUserId(uid);
    setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, data, read, created_at, actor:actor_id(username, color, avatar_url)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(40);

    setLoading(false);
    if (error || !data) return;

    const built = data.map(buildNotification);
    built.sort((a, b) => Number(a.read) - Number(b.read));

    if (built.length === 0) {
      built.push({
        id: 'welcome', type: 'system', user: 'Inklore', avatar: 'I',
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

  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    if (!userId) return;
    supabase.from('notifications').update({ read: true }).eq('user_id', userId).then(() => {});
  }

  async function markOneRead(id) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (userId) supabase.from('notifications').update({ read: true }).eq('id', id).then(() => {});
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
    <NotificationsContext.Provider value={{ items, unreadCount, loading, load, markAllRead, markOneRead, clearAll, acceptFriendRequest }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
