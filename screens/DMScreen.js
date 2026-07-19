import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Modal,
  ScrollView, Animated,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useNotifications } from '../utils/NotificationsContext';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { supabase } from '../supabase';
import MobileHeader from '../components/MobileHeader';
import { MangaCover } from '../utils/mangaCovers';
import { findPoolEntry } from '../utils/mangaPool';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bone } from '../components/Skeleton';
import { useResponsive } from '../utils/responsive';
import { containsBlockedLanguage } from '../utils/contentFilter';
import { showAppToast } from '../utils/appToast';
import { useProfile, uploadMediaFile } from '../utils/ProfileContext';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { searchGifs } from '../utils/tenor';
import { sendDMPush } from '../utils/pushNotifications';
import { light, medium } from '../utils/haptics';

// Same key SocialScreen reads — records when this thread was last viewed so
// its unread badge stays cleared even across app restarts
const DM_OPENED_KEY = '@mangarecs_dm_opened_at';
async function recordThreadOpened(friendId) {
  if (!friendId) return;
  try {
    const raw = await AsyncStorage.getItem(DM_OPENED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[friendId] = Date.now();
    await AsyncStorage.setItem(DM_OPENED_KEY, JSON.stringify(map));
  } catch (_) {}
}

const THEME_COLORS = {
  default: '#7B5CFF', rose: '#D4537E', sky: '#378ADD',
  emerald: '#1D9E75', amber: '#EF9F27', violet: '#7F77DD', crimson: '#FF5C7A',
};
function themeColor(id) { return THEME_COLORS[id] || '#7B5CFF'; }

function timeLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const SWIPE_REPLY_THRESHOLD = 46;

function TypingDots({ color }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 120),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={styles.typingDotsRow}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={[styles.typingDot, { backgroundColor: color, opacity: v }]} />
      ))}
    </View>
  );
}

// Popular manga list for quick recommendation picker
const QUICK_PICKS = [
  { title: 'Solo Leveling',           lang: 'ko', chapters: 179, genres: ['Action', 'Fantasy'],    rating: 4.9, color: '#0D1B2A' },
  { title: 'Jujutsu Kaisen',          lang: 'ja', chapters: 264, genres: ['Action', 'Supernatural'], rating: 4.8, color: '#0A0A2D' },
  { title: 'One Piece',               lang: 'ja', chapters: 1108, genres: ['Adventure', 'Action'], rating: 4.9, color: '#0D1A2D' },
  { title: 'Chainsaw Man',            lang: 'ja', chapters: 163, genres: ['Action', 'Horror'],    rating: 4.8, color: '#2D0A0A' },
  { title: 'Spy x Family',            lang: 'ja', chapters: 105, genres: ['Comedy', 'Action'],    rating: 4.8, color: '#1A2210' },
  { title: 'Attack on Titan',         lang: 'ja', chapters: 139, genres: ['Action', 'Drama'],     rating: 4.9, color: '#2D1B0A', searchKey: 'Shingeki no Kyojin' },
  { title: 'Frieren: Beyond Journey\'s End', lang: 'ja', chapters: 121, genres: ['Fantasy', 'Slice of Life'], rating: 4.9, color: '#0D2230' },
  { title: 'Blue Lock',               lang: 'ja', chapters: 278, genres: ['Sports', 'Drama'],     rating: 4.7, color: '#0A1A2D' },
  { title: 'Demon Slayer',            lang: 'ja', chapters: 205, genres: ['Action', 'Supernatural'], rating: 4.8, color: '#1A0A2D', searchKey: 'Kimetsu no Yaiba' },
  { title: 'Hunter x Hunter',         lang: 'ja', chapters: 401, genres: ['Adventure', 'Fantasy'], rating: 4.9, color: '#1A2D0D' },
  { title: 'Vinland Saga',            lang: 'ja', chapters: 212, genres: ['Action', 'Historical'], rating: 4.9, color: '#1A0D0A' },
  { title: 'Berserk',                 lang: 'ja', chapters: 374, genres: ['Dark Fantasy', 'Action'], rating: 4.9, color: '#1A0D0D' },
];

function RecommendationCard({ manga, isOwn, onOpen, colors }) {
  return (
    <View style={[styles.recCard, { backgroundColor: isOwn ? 'rgba(123,92,255,0.18)' : colors.card, borderColor: isOwn ? 'rgba(123,92,255,0.35)' : colors.border }]}>
      <View style={styles.recRow}>
        <View style={[styles.recCoverWrap, { backgroundColor: manga.color || '#1A1A2E' }]}>
          <MangaCover
            title={manga.searchKey || manga.title}
            lang={manga.lang || 'ja'}
            style={styles.recCover}
            color={manga.color}
          />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: colors.text }]} numberOfLines={2}>{manga.title}</Text>
          <View style={styles.recGenres}>
            {(manga.genres || []).slice(0, 2).map((g) => (
              <View key={g} style={styles.recGenreTag}>
                <Text style={styles.recGenreText}>{g}</Text>
              </View>
            ))}
          </View>
          <View style={styles.recMeta}>
            {manga.rating ? (
              <>
                <Ionicons name="star" size={11} color="#FFD700" />
                <Text style={[styles.recMetaText, { color: colors.muted }]}>{manga.rating}</Text>
              </>
            ) : null}
            <Ionicons name="book-outline" size={11} color={colors.muted} style={{ marginLeft: 8 }} />
            <Text style={[styles.recMetaText, { color: colors.muted }]}>{manga.chapters} ch</Text>
          </View>
          <TouchableOpacity style={styles.recOpenBtn} onPress={() => onOpen(manga)} activeOpacity={0.8}>
            <Ionicons name="play-circle" size={13} color="#7B5CFF" />
            <Text style={styles.recOpenText}>Read it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ msg, isOwn, friendColor, colors, navigation, onRetry }) {
  const bgOwn = '#7B5CFF';
  const bgOther = colors.card;
  const isSending = !!msg._sending;
  const hasFailed = !!msg._failed;

  if ((msg.message_type === 'image' || msg.message_type === 'gif') && msg.media_url) {
    const ImageComponent = msg.message_type === 'gif' ? ExpoImage : Image;
    return (
      <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther, isSending && { opacity: 0.6 }]}>
        <ImageComponent
          source={{ uri: msg.media_url }}
          style={styles.imageBubble}
          contentFit="cover"
          resizeMode="cover"
        />
        <View style={[styles.bubbleStatus, isOwn ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
          {hasFailed && onRetry && (
            <TouchableOpacity onPress={() => onRetry(msg)} style={styles.retryBtn}>
              <Ionicons name="refresh" size={10} color="#FF453A" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.bubbleTime, { color: hasFailed ? '#FF453A' : colors.muted }]}>
            {hasFailed ? 'Failed to send' : timeLabel(msg.created_at)}
          </Text>
          {isSending && <Ionicons name="time-outline" size={11} color={colors.muted} style={{ marginLeft: 4 }} />}
        </View>
      </View>
    );
  }

  if (msg.message_type === 'recommendation' && msg.manga_data) {
    return (
      <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther, isSending && { opacity: 0.6 }]}>
        <View style={[styles.recLabel, { backgroundColor: isOwn ? 'rgba(123,92,255,0.2)' : colors.inputBg }]}>
          <Ionicons name="paper-plane-outline" size={11} color={isOwn ? '#A09CE0' : colors.muted} />
          <Text style={[styles.recLabelText, { color: isOwn ? '#A09CE0' : colors.muted }]}>
            {isOwn ? 'You recommended' : 'Recommended for you'}
          </Text>
        </View>
        <RecommendationCard
          manga={msg.manga_data}
          isOwn={isOwn}
          colors={colors}
          onOpen={(manga) => navigation.navigate('Reader', {
            searchQuery: manga.searchKey || manga.title,
            title: manga.title,
            chapters: manga.chapters || 1,
            lang: manga.lang,
          })}
        />
        <View style={[styles.bubbleStatus, { justifyContent: 'flex-end' }]}>
          {hasFailed && onRetry && (
            <TouchableOpacity onPress={() => onRetry(msg)} style={styles.retryBtn}>
              <Ionicons name="refresh" size={10} color="#FF453A" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.bubbleTime, { color: hasFailed ? '#FF453A' : colors.muted }]}>
            {hasFailed ? 'Failed' : timeLabel(msg.created_at)}
          </Text>
          {isSending && <Ionicons name="time-outline" size={11} color={colors.muted} style={{ marginLeft: 4 }} />}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
      <View style={[
        styles.bubble,
        { backgroundColor: isOwn ? bgOwn : bgOther, borderColor: isOwn ? 'transparent' : colors.border },
        isSending && { opacity: 0.65 },
        hasFailed && { borderColor: '#FF453A', borderWidth: 1 },
      ]}>
        <Text style={[styles.bubbleText, { color: isOwn ? '#fff' : colors.text }]}>{msg.content}</Text>
      </View>
      <View style={[styles.bubbleStatus, isOwn ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
        {hasFailed && onRetry && (
          <TouchableOpacity onPress={() => onRetry(msg)} style={styles.retryBtn}>
            <Ionicons name="refresh" size={10} color="#FF453A" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.bubbleTime, { color: hasFailed ? '#FF453A' : colors.muted }]}>
          {hasFailed ? 'Failed to send' : timeLabel(msg.created_at)}
        </Text>
        {isSending && <Ionicons name="time-outline" size={11} color={colors.muted} style={{ marginLeft: 4 }} />}
        {!isSending && !hasFailed && isOwn && (
          <Ionicons name="checkmark-done" size={11} color="#A09CE0" style={{ marginLeft: 4 }} />
        )}
      </View>
    </View>
  );
}

function quotedPreviewText(quotedMsg) {
  if (!quotedMsg) return '';
  if (quotedMsg.message_type === 'recommendation') return `📚 ${quotedMsg.manga_data?.title || 'a manga'}`;
  if (quotedMsg.message_type === 'image') return '📷 Photo';
  if (quotedMsg.message_type === 'gif') return '🎬 GIF';
  return quotedMsg.content || '';
}

// Wraps MessageBubble with the interactions Discord/iMessage have and this
// app's DMs didn't: swipe-right(/left)-to-reply, long-press to react, and
// small reaction pills under the bubble.
function SwipeableMessageRow({ msg, isOwn, friendColor, colors, navigation, onRetry, quotedMsg, reactions, onToggleReaction, onSwipeReply }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [pickerOpen, setPickerOpen] = useState(false);
  const accent = isOwn ? '#7B5CFF' : themeColor(friendColor);

  const replyIconOpacity = translateX.interpolate({
    inputRange: isOwn ? [-SWIPE_REPLY_THRESHOLD, 0] : [0, SWIPE_REPLY_THRESHOLD],
    outputRange: isOwn ? [1, 0] : [0, 1],
    extrapolate: 'clamp',
  });

  function onGestureEvent(e) {
    let tx = e.nativeEvent.translationX;
    // Rubber-band: only swipeable toward the "reply" direction for this
    // bubble's side, resistant past a small cap the other way.
    tx = isOwn ? Math.max(-80, Math.min(0, tx)) : Math.min(80, Math.max(0, tx));
    translateX.setValue(tx);
  }
  function onHandlerStateChange(e) {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      if (Math.abs(e.nativeEvent.translationX) > SWIPE_REPLY_THRESHOLD) {
        light();
        onSwipeReply(msg);
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    }
  }

  const reactionEntries = Object.entries(reactions || {});

  return (
    <View>
      <PanGestureHandler
        activeOffsetX={[-12, 12]}
        failOffsetY={[-10, 10]}
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}>
        <Animated.View style={{ transform: [{ translateX }] }}>
          <TouchableOpacity
            activeOpacity={0.92}
            onLongPress={() => { medium(); setPickerOpen(true); }}
            delayLongPress={280}>
            {quotedMsg && (
              <View style={[styles.quotedWrap, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.quotedBar, { backgroundColor: accent }]} />
                <Text style={[styles.quotedText, { color: colors.muted }]} numberOfLines={1}>
                  {quotedPreviewText(quotedMsg)}
                </Text>
              </View>
            )}
            <MessageBubble msg={msg} isOwn={isOwn} friendColor={friendColor} colors={colors} navigation={navigation} onRetry={onRetry} />
            {reactionEntries.length > 0 && (
              <View style={[styles.reactionRow, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
                {reactionEntries.map(([emoji, info]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.reactionPill,
                      { borderColor: info.mine ? accent : colors.border, backgroundColor: colors.card },
                    ]}
                    onPress={() => onToggleReaction(msg.id, emoji)}>
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {info.count > 1 && <Text style={[styles.reactionCount, { color: colors.muted }]}>{info.count}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.replyIconWrap,
          isOwn ? { right: '100%', marginRight: 8 } : { left: '100%', marginLeft: 8 },
          { opacity: replyIconOpacity },
        ]}>
        <Ionicons name="arrow-undo" size={18} color="#7B5CFF" />
      </Animated.View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.emojiOverlay} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={[styles.emojiPickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {REACTION_EMOJIS.map((e) => (
              <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => { onToggleReaction(msg.id, e); setPickerOpen(false); }}>
                <Text style={styles.emojiBtnText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function DMScreen() {
  const { params } = useRoute();
  const { friendId, friendName, friendColor, friendAvatarUrl } = params || {};
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const tabBarHeight = useBottomTabBarHeight();
  const { markDmNotifsRead } = useNotifications();
  const { profile } = useProfile();
  const myDisplayName = profile?.display_name || profile?.username || 'Someone';

  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerItems, setPickerItems] = useState(QUICK_PICKS);
  const [pickerTab, setPickerTab] = useState('manga'); // 'manga' | 'gif'
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const gifSearchTimer = useRef(null);
  const [reactionsByMessage, setReactionsByMessage] = useState({}); // messageId -> { emoji: { count, mine } }
  const [replyingTo, setReplyingTo] = useState(null); // msg | null
  const [friendTyping, setFriendTyping] = useState(false);

  const listRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const messagesById = useMemo(() => {
    const map = {};
    messages.forEach((m) => { map[m.id] = m; });
    return map;
  }, [messages]);
  // Realtime callbacks below are set up once per (myId, friendId) and would
  // otherwise close over a stale, empty messagesById from before messages
  // finished loading — read through this ref instead so they see the latest.
  const messagesByIdRef = useRef(messagesById);
  useEffect(() => { messagesByIdRef.current = messagesById; }, [messagesById]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setMyId(user.id);
        loadMessages(user.id);
        markRead(user.id);
        supabase
          .from('reading_progress')
          .select('series_title')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(20)
          .then(({ data }) => {
            if (!data || data.length === 0) return;
            const personalized = data
              .map(r => findPoolEntry(r.series_title) || { title: r.series_title, lang: 'ja', genres: [], color: '#1A1A2E' })
              .filter(Boolean);
            if (personalized.length > 0) setPickerItems(personalized);
          });
      }
    });
  }, []);

  // Debounced GIF search — runs on the featured/trending endpoint immediately
  // when the GIF tab opens with an empty query, then re-searches as the user types.
  useEffect(() => {
    if (pickerTab !== 'gif' || !showPicker) return;
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current);
    setGifLoading(true);
    gifSearchTimer.current = setTimeout(async () => {
      const results = await searchGifs(gifQuery);
      setGifResults(results);
      setGifLoading(false);
    }, gifQuery ? 350 : 0);
    return () => { if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current); };
  }, [gifQuery, pickerTab, showPicker]);

  // Realtime: append incoming messages from the other person instantly
  useEffect(() => {
    if (!myId || !friendId) return;
    // Unique per mount — the same thread can be opened from two tab stacks, and a
    // reused channel name makes supabase-js throw when callbacks are re-added.
    const channelKey = `dm-${[myId, friendId].sort().join('-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${myId}` },
        (payload) => {
          const msg = payload.new;
          if (msg.sender_id !== friendId) return;
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // User is looking at this thread: mark read + clear its notification immediately
          markRead(myId);
          markDmNotifsRead(friendId);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId, friendId]);

  // Realtime: the friend's reactions on either side's messages, and their
  // typing status. Reactions ride the same kind of unique-per-mount channel
  // as the message INSERT listener above; typing needs a *shared* deterministic
  // channel name instead, since broadcast (unlike postgres_changes) only
  // reaches clients joined to the exact same channel topic.
  useEffect(() => {
    if (!myId || !friendId) return;
    const reactionChannelKey = `dm-reactions-${[myId, friendId].sort().join('-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reactionChannel = supabase
      .channel(reactionChannelKey)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_message_reactions' },
        (payload) => {
          const row = payload.new;
          if (row.user_id === myId || !messagesByIdRef.current[row.message_id]) return;
          applyReactionDelta(row.message_id, row.emoji, row.user_id, true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'dm_message_reactions' },
        (payload) => {
          const row = payload.old;
          if (!row || row.user_id === myId || !messagesByIdRef.current[row.message_id]) return;
          applyReactionDelta(row.message_id, row.emoji, row.user_id, false);
        }
      )
      .subscribe();

    const typingChannelName = `dm-typing-${[myId, friendId].sort().join('-')}`;
    const typingChannel = supabase
      .channel(typingChannelName)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.userId !== friendId) return;
        setFriendTyping(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setFriendTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(typingChannel);
      clearTimeout(typingTimeoutRef.current);
      typingChannelRef.current = null;
    };
  }, [myId, friendId]);

  function handleTextChange(t) {
    setText(t);
    const now = Date.now();
    if (typingChannelRef.current && now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: myId } });
    }
  }

  useFocusEffect(useCallback(() => {
    recordThreadOpened(friendId);
    if (myId) {
      loadMessages(myId);
      markRead(myId);
      markDmNotifsRead(friendId);
    }
    return () => {
      // Leaving the thread: everything on screen has been seen — clear read state
      // and the notification badge on the way out too.
      recordThreadOpened(friendId);
      if (myId) {
        markRead(myId);
        markDmNotifsRead(friendId);
      }
    };
  }, [myId, friendId]));

  async function loadMessages(uid) {
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${uid},recipient_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},recipient_id.eq.${uid})`
      )
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    if (data?.length) loadReactions(data.map((m) => m.id), uid);
  }

  async function loadReactions(messageIds, uid) {
    if (!messageIds.length) return;
    const { data } = await supabase
      .from('dm_message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);
    if (!data) return;
    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row.message_id]) grouped[row.message_id] = {};
      if (!grouped[row.message_id][row.emoji]) grouped[row.message_id][row.emoji] = { count: 0, mine: false };
      grouped[row.message_id][row.emoji].count += 1;
      if (row.user_id === uid) grouped[row.message_id][row.emoji].mine = true;
    });
    setReactionsByMessage(grouped);
  }

  function applyReactionDelta(messageId, emoji, userId, added) {
    setReactionsByMessage((prev) => {
      const forMsg = { ...(prev[messageId] || {}) };
      const entry = forMsg[emoji] || { count: 0, mine: false };
      const nextCount = Math.max(0, entry.count + (added ? 1 : -1));
      const nextMine = userId === myId ? added : entry.mine;
      if (nextCount === 0) {
        delete forMsg[emoji];
      } else {
        forMsg[emoji] = { count: nextCount, mine: nextMine };
      }
      return { ...prev, [messageId]: forMsg };
    });
  }

  async function toggleReaction(messageId, emoji) {
    if (!myId) return;
    const mine = reactionsByMessage[messageId]?.[emoji]?.mine;
    applyReactionDelta(messageId, emoji, myId, !mine);
    if (mine) {
      await supabase.from('dm_message_reactions').delete()
        .eq('message_id', messageId).eq('user_id', myId).eq('emoji', emoji);
    } else {
      medium();
      await supabase.from('dm_message_reactions').insert({ message_id: messageId, user_id: myId, emoji });
    }
  }

  function handleSwipeReply(msg) {
    setReplyingTo(msg);
  }

  async function markRead(uid) {
    await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', uid)
      .eq('sender_id', friendId)
      .is('read_at', null);
  }

  async function sendText() {
    if (!myId || !text.trim()) return;
    const content = text.trim();
    if (containsBlockedLanguage(content)) {
      showAppToast('That message contains language that isn\'t allowed here');
      return;
    }
    light();
    setText('');
    const replyToId = replyingTo?.id || null;
    setReplyingTo(null);

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId,
      recipient_id: friendId,
      message_type: 'text',
      content,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      _sending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, message_type: 'text', content, reply_to_id: replyToId })
      .select()
      .maybeSingle();

    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      supabase.from('notifications').insert({
        user_id: friendId,
        actor_id: myId,
        type: 'direct_message',
        data: { message_type: 'text' },
      }).then(() => {});
      sendDMPush(friendId, myDisplayName, content).catch(() => {});
    } else {
      if (error) console.warn('[DM send error]', error.code, error.message, error.details);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: error?.message } : m)));
    }
  }

  async function retryMessage(failedMsg) {
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    if (failedMsg.message_type === 'recommendation' && failedMsg.manga_data) {
      sendRecommendation(failedMsg.manga_data);
    } else if (failedMsg.message_type === 'image' && failedMsg.media_url) {
      sendImage(failedMsg.media_url);
    } else if (failedMsg.message_type === 'gif' && failedMsg.media_url) {
      sendGif(failedMsg.media_url);
    } else {
      setText(failedMsg.content || '');
    }
  }

  async function sendRecommendation(manga) {
    if (!myId) return;
    light();
    setShowPicker(false);
    setReplyingTo(null);

    const mangaData = {
      title: manga.title,
      searchKey: manga.searchKey || manga.title,
      lang: manga.lang || 'ja',
      chapters: manga.chapters,
      genres: manga.genres,
      rating: manga.rating,
      color: manga.color,
    };

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId,
      recipient_id: friendId,
      message_type: 'recommendation',
      manga_data: mangaData,
      created_at: new Date().toISOString(),
      _sending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, message_type: 'recommendation', manga_data: mangaData })
      .select()
      .maybeSingle();

    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      supabase.from('notifications').insert({
        user_id: friendId,
        actor_id: myId,
        type: 'direct_message',
        data: { message_type: 'recommendation', manga_title: manga.title },
      }).then(() => {});
      sendDMPush(friendId, myDisplayName, `📚 ${manga.title}`).catch(() => {});
    } else {
      if (error) console.warn('[DM rec send error]', error.code, error.message, error.details);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: error?.message } : m)));
    }
  }

  async function sendGif(gifUrl) {
    if (!myId) return;
    light();
    setShowPicker(false);
    setReplyingTo(null);

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId,
      recipient_id: friendId,
      message_type: 'gif',
      media_url: gifUrl,
      created_at: new Date().toISOString(),
      _sending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    // Tenor URLs are already publicly hosted — no upload needed, just store the link.
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, message_type: 'gif', media_url: gifUrl })
      .select()
      .maybeSingle();

    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      supabase.from('notifications').insert({
        user_id: friendId,
        actor_id: myId,
        type: 'direct_message',
        data: { message_type: 'gif' },
      }).then(() => {});
      sendDMPush(friendId, myDisplayName, '🎬 GIF').catch(() => {});
    } else {
      if (error) console.warn('[DM gif send error]', error.code, error.message, error.details);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: error?.message } : m)));
    }
  }

  async function pickAndSendImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    sendImage(result.assets[0].uri);
  }

  async function sendImage(localUri) {
    if (!myId) return;
    light();
    setReplyingTo(null);

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId,
      recipient_id: friendId,
      message_type: 'image',
      media_url: localUri, // local file:// uri — shown immediately, swapped for the real Storage URL once uploaded
      created_at: new Date().toISOString(),
      _sending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    const { url: mediaUrl, error: uploadError } = await uploadMediaFile(
      localUri, 'dm-media', `${myId}/${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    if (uploadError || !mediaUrl) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: uploadError?.message } : m)));
      return;
    }

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, message_type: 'image', media_url: mediaUrl })
      .select()
      .maybeSingle();

    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      supabase.from('notifications').insert({
        user_id: friendId,
        actor_id: myId,
        type: 'direct_message',
        data: { message_type: 'image' },
      }).then(() => {});
      sendDMPush(friendId, myDisplayName, '📷 Photo').catch(() => {});
    } else {
      if (error) console.warn('[DM image send error]', error.code, error.message, error.details);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: error?.message } : m)));
    }
  }

  const avatarInitial = (friendName || '?').charAt(0).toUpperCase();
  const accent = themeColor(friendColor);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: tabBarHeight }]}>
      <MobileHeader
        title={friendName || 'Chat'}
        leftContent={
          <View style={[styles.headerAvatar, { backgroundColor: accent }]}>
            {friendAvatarUrl
              ? <Image source={{ uri: friendAvatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <Text style={styles.headerAvatarText}>{avatarInitial}</Text>}
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>

        {loading ? (
          <View style={[{ flex: 1, justifyContent: 'flex-end', paddingBottom: 16, gap: 12, paddingHorizontal: 16 }, isTablet && styles.tabletWrap]}>
            {[64, 40, 88, 52, 72].map((w, i) => (
              <Bone key={i} width={`${w}%`} height={38} radius={16} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />
            ))}
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyAvatar, { backgroundColor: accent }]}>
              <Text style={styles.emptyAvatarText}>{avatarInitial}</Text>
            </View>
            <Text style={[styles.emptyName, { color: colors.text }]}>{friendName}</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              Start the conversation — send a message or recommend a manga!
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.msgList, isTablet && styles.tabletWrap]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={null}
            renderItem={({ item }) => (
              <SwipeableMessageRow
                msg={item}
                isOwn={item.sender_id === myId}
                friendColor={friendColor}
                colors={colors}
                navigation={navigation}
                onRetry={item._failed ? retryMessage : null}
                quotedMsg={item.reply_to_id ? messagesById[item.reply_to_id] : null}
                reactions={reactionsByMessage[item.id]}
                onToggleReaction={toggleReaction}
                onSwipeReply={handleSwipeReply}
              />
            )}
          />
        )}

        {friendTyping && (
          <View style={[styles.typingRow, isTablet && styles.tabletWrap]}>
            <View style={[styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TypingDots color={themeColor(friendColor)} />
            </View>
          </View>
        )}

        {replyingTo && (
          <View style={[styles.replyingToBar, { backgroundColor: colors.card, borderTopColor: colors.border }, isTablet && styles.tabletWrap]}>
            <Ionicons name="return-down-forward-outline" size={13} color="#7B5CFF" />
            <Text style={[styles.replyingToText, { color: colors.muted }]} numberOfLines={1}>
              Replying to <Text style={{ color: '#7B5CFF', fontWeight: '600' }}>
                {replyingTo.sender_id === myId ? 'yourself' : friendName}
              </Text>: {quotedPreviewText(replyingTo)}
            </Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={15} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: 12 }, isTablet && styles.tabletWrap]}>
          <TouchableOpacity
            style={[styles.recBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => { light(); setPickerTab('manga'); setShowPicker(true); }}
            activeOpacity={0.7}>
            <Ionicons name="book" size={17} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => { light(); pickAndSendImage(); }}
            activeOpacity={0.7}>
            <Ionicons name="image" size={17} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => { light(); setPickerTab('gif'); setShowPicker(true); }}
            activeOpacity={0.7}>
            <Ionicons name="happy" size={17} color={colors.text} />
          </TouchableOpacity>

          <TextInput
            style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />

          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={sendText}
            disabled={!text.trim()}
            activeOpacity={0.8}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Manga Recommendation Picker */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />

            <View style={styles.pickerTabRow}>
              <TouchableOpacity
                style={[styles.pickerTabBtn, pickerTab === 'manga' && { borderBottomColor: '#7B5CFF', borderBottomWidth: 2 }]}
                onPress={() => setPickerTab('manga')}>
                <Text style={[styles.pickerTabText, { color: pickerTab === 'manga' ? colors.text : colors.muted }]}>Manga</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerTabBtn, pickerTab === 'gif' && { borderBottomColor: '#7B5CFF', borderBottomWidth: 2 }]}
                onPress={() => setPickerTab('gif')}>
                <Text style={[styles.pickerTabText, { color: pickerTab === 'gif' ? colors.text : colors.muted }]}>GIF</Text>
              </TouchableOpacity>
            </View>

            {pickerTab === 'manga' ? (
              <>
                <Text style={[styles.pickerSub, { color: colors.muted }]}>Pick one to send to {friendName}</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pickerGrid}>
                  {pickerItems.map((manga) => (
                    <TouchableOpacity
                      key={manga.title}
                      style={[styles.pickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => sendRecommendation(manga)}
                      activeOpacity={0.85}>
                      <View style={[styles.pickerCoverWrap, { backgroundColor: manga.color }]}>
                        <MangaCover
                          title={manga.searchKey || manga.title}
                          lang={manga.lang}
                          style={styles.pickerCover}
                          color={manga.color}
                        />
                      </View>
                      <Text style={[styles.pickerCardTitle, { color: colors.text }]} numberOfLines={2}>{manga.title}</Text>
                      <Text style={[styles.pickerCardMeta, { color: colors.muted }]}>{manga.chapters} ch</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={[styles.gifSearchRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={14} color={colors.muted} />
                  <TextInput
                    style={[styles.gifSearchInput, { color: colors.text }]}
                    placeholder="Search GIFs…"
                    placeholderTextColor={colors.muted}
                    value={gifQuery}
                    onChangeText={setGifQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {gifLoading ? (
                  <View style={styles.gifLoadingWrap}>
                    <ActivityIndicator color="#7B5CFF" />
                  </View>
                ) : gifResults.length === 0 ? (
                  <Text style={[styles.pickerSub, { color: colors.muted, textAlign: 'center', marginTop: 20 }]}>
                    No GIFs found — try a different search.
                  </Text>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gifGrid}>
                    {gifResults.map((g) => (
                      <TouchableOpacity key={g.id} onPress={() => sendGif(g.url)} activeOpacity={0.85} style={styles.gifCard}>
                        <ExpoImage source={{ uri: g.previewUrl }} style={styles.gifThumb} contentFit="cover" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header avatar
  headerAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8 },
  headerAvatarText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // Messages
  msgList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' },

  bubbleWrap: { marginBottom: 10, maxWidth: '80%' },
  bubbleWrapOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 },
  bubbleTime: { fontSize: 10 },

  // Recommendation card
  recLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6, alignSelf: 'flex-start' },
  recLabelText: { fontSize: 10, fontWeight: '600' },

  imageBubble: { width: 200, height: 200, borderRadius: 16 },
  recCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', width: 240 },
  recRow: { flexDirection: 'row', padding: 10 },
  recCoverWrap: { width: 72, height: 100, borderRadius: 8, overflow: 'hidden', marginRight: 10 },
  recCover: { width: '100%', height: '100%', borderRadius: 8 },
  recInfo: { flex: 1, justifyContent: 'space-between' },
  recTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginBottom: 4 },
  recGenres: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  recGenreTag: { backgroundColor: 'rgba(123,92,255,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 4, marginBottom: 4 },
  recGenreText: { color: '#A09CE0', fontSize: 10, fontWeight: '600' },
  recMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  recMetaText: { fontSize: 11, marginLeft: 3 },
  recOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,92,255,0.12)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
  recOpenText: { color: '#7B5CFF', fontSize: 11, fontWeight: '700' },

  // Quoted reply preview (shown above a bubble that replied to another message)
  quotedWrap: { flexDirection: 'row', alignItems: 'center', maxWidth: '80%', marginBottom: 3, gap: 6 },
  quotedBar: { width: 3, height: 14, borderRadius: 2 },
  quotedText: { fontSize: 11, flexShrink: 1 },

  // Reaction pills
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, marginBottom: 8 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: '600' },

  // Swipe-to-reply affordance icon
  replyIconWrap: { position: 'absolute', top: '50%', marginTop: -10, width: 20, alignItems: 'center', justifyContent: 'center' },

  // Long-press emoji picker
  emojiOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  emojiPickerRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 24, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  emojiBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 22 },

  // Typing indicator
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  typingDotsRow: { flexDirection: 'row', gap: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },

  // Reply-preview bar above the input
  replyingToBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, gap: 6 },
  replyingToText: { fontSize: 12, flex: 1 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyAvatarText: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  emptyName: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  recBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 2 },
  textInput: {
    flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15, maxHeight: 100, marginRight: 8,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#7B5CFF', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendBtnDisabled: { backgroundColor: 'rgba(123,92,255,0.35)' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 6 },
  retryText: { color: '#FF453A', fontSize: 10, fontWeight: '600' },

  // Manga picker
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, maxHeight: '75%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  pickerSub: { fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  pickerTabRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, gap: 20 },
  pickerTabBtn: { paddingBottom: 10 },
  pickerTabText: { fontSize: 14, fontWeight: '700' },
  gifSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  gifSearchInput: { flex: 1, fontSize: 13 },
  gifLoadingWrap: { paddingVertical: 40, alignItems: 'center' },
  gifGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  gifCard: { width: '31%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(123,92,255,0.08)' },
  gifThumb: { width: '100%', height: '100%' },
  pickerCard: { width: '29%', borderRadius: 12, borderWidth: 1, overflow: 'hidden', padding: 8, alignItems: 'center' },
  pickerCoverWrap: { width: '100%', aspectRatio: 0.7, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
  pickerCover: { width: '100%', height: '100%', borderRadius: 8 },
  pickerCardTitle: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  pickerCardMeta: { fontSize: 10, marginTop: 2 },
});
