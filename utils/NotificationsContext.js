import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { syncBadgeCount } from './pushNotifications';
import { reportError } from './crashReporting';
import { NOTIF_PREF_DEFAULTS, isRowAllowed, readStoredPrefs, subscribePrefs } from './notificationPrefs';

const NotificationsContext = createContext(null);

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'just now';
}

// `system` rows come from the app itself (the chapter-push / report-alert
// functions), so they carry no actor_id and no data.message. There was no
// case for them below, so every one fell through to the generic fallback and
// rendered as a meaningless "Someone sent you a notification" — one per new
// chapter, per followed series, inserted on a schedule. That's what filled
// the panel with identical junk lines. Give them their real content instead.
function systemText(d) {
  if (d.kind === 'chapter_update') {
    const series = d.series_title || 'a series you follow';
    return d.chapter ? `Chapter ${d.chapter} of ${series} is out` : `New chapter of ${series}`;
  }
  if (d.kind === 'report_submitted') {
    return `New report from ${d.reporter || 'a user'}${d.reason ? ` — ${d.reason}` : ''}`;
  }
  return d.message || null;
}

// Returns null for anything with no meaningful text to show. A notification
// that can only say "sent you a notification" carries no information at all,
// so it's dropped rather than rendered as filler.
function buildNotification(row) {
  const isSystem = row.type === 'system';
  const isMangaRec = isSystem || row.type === 'badge' || (row.type === 'direct_message' && row.data?.message_type === 'recommendation');
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
  else if (row.type === 'direct_message')  text = d.message_type === 'recommendation' ? `sent a Rec: ${d.manga_title || 'a manga'}` : d.message_type === 'image' ? 'sent you a photo' : 'sent you a message';
  else if (isSystem)                       text = systemText(d);
  else                                     text = d.message || null;
  if (!text) return null;
  return {
    isChapterUpdate: isSystem && d.kind === 'chapter_update',
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

// One screenful of notifications, plus enough headroom that most users never
// paginate at all. Raised from a flat .limit(40) with no way to see anything
// older — a busy week of chapter updates used to push friend requests off the
// end of the list permanently.
const NOTIF_PAGE_SIZE = 40;

// Raw rows in, display rows out. Kept separate from the fetch so a second page
// can be appended and the whole set re-derived: both the chapter-update dedupe
// and the unread-first sort have to run across everything loaded, not per page.
function buildList(rows, prefs) {
  // Rows the user has muted in Settings never reach the list. Badge unlocks
  // used to be hard-filtered here regardless of preference; they are now
  // governed by the `badges` toggle like everything else.
  // buildNotification returns null for rows with nothing meaningful to say —
  // those are dropped rather than shown as filler.
  const all = rows
    .filter((row) => isRowAllowed(row, prefs))
    .map(buildNotification)
    .filter(Boolean);

  // One row per series for chapter updates. The checker inserts one per new
  // chapter, so a series that dropped several at once (or while the user was
  // away) would otherwise bury everything else under near-identical lines.
  // `rows` is ordered newest-first, so the one kept is the latest chapter.
  const seenChapterSeries = new Set();
  const built = all.filter((n) => {
    if (!n.isChapterUpdate) return true;
    const key = (n.seriesTitle || '').toLowerCase();
    if (!key) return true;
    if (seenChapterSeries.has(key)) return false;
    seenChapterSeries.add(key);
    return true;
  });
  built.sort((a, b) => Number(a.read) - Number(b.read));
  return built;
}

export function NotificationsProvider({ children }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [userId, setUserId] = useState(null);
  const [prefs, setPrefs] = useState(NOTIF_PREF_DEFAULTS);

  // Read once on mount, then follow Settings live so muting a category empties
  // it from the list (and the unread badge) immediately.
  useEffect(() => {
    let alive = true;
    readStoredPrefs().then((p) => { if (alive) setPrefs(p); });
    const unsubscribe = subscribePrefs(setPrefs);
    return () => { alive = false; unsubscribe(); };
  }, []);

  const items = useMemo(() => {
    const built = buildList(rows, prefs);
    if (built.length === 0) {
      return [{
        id: 'welcome', type: 'system', user: 'MangaRecs', avatar: 'M', isMangaRec: true,
        text: 'Welcome! Friend requests and comments will appear here.',
        time: 'just now', read: true,
        friendshipId: null, actorId: null, seriesTitle: null, badgeIcon: null,
      }];
    }
    return built;
  }, [rows, prefs]);

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
      .range(0, NOTIF_PAGE_SIZE - 1);

    setLoading(false);
    if (error || !data) return;
    setRows(data);
    setHasMore(data.length === NOTIF_PAGE_SIZE);
  }, []);

  // Offset paging is right here (unlike DMs): notifications are read
  // newest-first and new ones arrive at the head, so a shifted window at worst
  // repeats a row — and the id-dedupe below drops it.
  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, actor_id, data, read, created_at, actor:actor_id(username, display_name, color, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(rows.length, rows.length + NOTIF_PAGE_SIZE - 1);
      setHasMore((data || []).length === NOTIF_PAGE_SIZE);
      if (data?.length) {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...data.filter((r) => !seen.has(r.id))];
        });
      }
    } catch (e) {
      reportError(e, 'notifications.loadMore');
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, rows.length]);

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) load();
      else { setRows([]); setHasMore(false); setUserId(null); }
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
    setRows(prev => prev.map(r => ({ ...r, read: true })));
    if (!userId) return;
    supabase.from('notifications').update({ read: true }).eq('user_id', userId).then(() => {});
  }

  // "Seen" pass: called when the user closes the notification panel/screen.
  // Marks everything read EXCEPT friend requests that still need an action,
  // so the unread badge clears but the Accept button stays available.
  async function markAllSeen() {
    setRows(prev => prev.map(r => r.type === 'friend_request' ? r : { ...r, read: true }));
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
    setRows(prev => prev.map(r => r.id === id ? { ...r, read: true } : r));
    if (userId) supabase.from('notifications').update({ read: true }).eq('id', id).then(() => {});
  }

  // Fully removes a notification (used once the user has actually acted on it,
  // e.g. opened the DM thread it points to) rather than just flagging it read.
  async function deleteNotification(id) {
    setRows(prev => prev.filter(r => r.id !== id));
    if (!userId) return;
    supabase.from('notifications').delete().eq('id', id).then(() => {});
  }

  // Mark all direct_message notifications from one sender as read — called when
  // the user opens (or leaves) that DM thread so the badge clears immediately.
  async function markDmNotifsRead(actorId) {
    if (!actorId) return;
    setRows(prev => prev.filter(r => !(r.type === 'direct_message' && r.actor_id === actorId)));
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
    setRows([]);
    setHasMore(false);
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
    if (notifId) setRows(prev => prev.map(r => (r.id === notifId ? { ...r, read: true } : r)));
  }

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, loading, loadingMore, hasMore, load, loadMore, markAllRead, markAllSeen, markOneRead, deleteNotification, markDmNotifsRead, clearAll, acceptFriendRequest }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
