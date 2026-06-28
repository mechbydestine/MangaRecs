import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { supabase } from '../supabase';
import MobileHeader from '../components/MobileHeader';
import { MangaCover } from '../utils/mangaCovers';
import { MANGA_POOL } from '../utils/mangaPool';

const THEME_COLORS = {
  default: '#534AB7', rose: '#D4537E', sky: '#378ADD',
  emerald: '#1D9E75', amber: '#EF9F27', violet: '#7F77DD',
};
function themeColor(id) { return THEME_COLORS[id] || '#534AB7'; }

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
    <View style={[styles.recCard, { backgroundColor: isOwn ? 'rgba(83,74,183,0.18)' : colors.card, borderColor: isOwn ? 'rgba(83,74,183,0.35)' : colors.border }]}>
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
            <Ionicons name="play-circle" size={13} color="#534AB7" />
            <Text style={styles.recOpenText}>Read it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ msg, isOwn, friendColor, colors, navigation, onRetry }) {
  const bgOwn = '#534AB7';
  const bgOther = colors.card;
  const isSending = !!msg._sending;
  const hasFailed = !!msg._failed;

  if (msg.message_type === 'recommendation' && msg.manga_data) {
    return (
      <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther, isSending && { opacity: 0.6 }]}>
        <View style={[styles.recLabel, { backgroundColor: isOwn ? 'rgba(83,74,183,0.2)' : colors.inputBg }]}>
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

export default function DMScreen() {
  const { params } = useRoute();
  const { friendId, friendName, friendColor, friendAvatarUrl } = params || {};
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerItems, setPickerItems] = useState(QUICK_PICKS);

  const listRef = useRef(null);

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
              .map(r => MANGA_POOL.find(m => m.title === r.series_title) || { title: r.series_title, lang: 'ja', genres: [], color: '#1A1A2E' })
              .filter(Boolean);
            if (personalized.length > 0) setPickerItems(personalized);
          });
      }
    });
  }, []);

  // Realtime: append incoming messages from the other person instantly
  useEffect(() => {
    if (!myId || !friendId) return;
    const channelKey = `dm-${[myId, friendId].sort().join('-')}`;
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
          markRead(myId);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId, friendId]);

  useFocusEffect(useCallback(() => {
    if (myId) {
      loadMessages(myId);
      markRead(myId);
    }
  }, [myId]));

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
    setText('');

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId,
      recipient_id: friendId,
      message_type: 'text',
      content,
      created_at: new Date().toISOString(),
      _sending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, message_type: 'text', content })
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
    } else {
      if (error) console.warn('[DM send error]', error.code, error.message, error.details);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true, _error: error?.message } : m)));
    }
  }

  async function retryMessage(failedMsg) {
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    if (failedMsg.message_type === 'recommendation' && failedMsg.manga_data) {
      sendRecommendation(failedMsg.manga_data);
    } else {
      setText(failedMsg.content || '');
    }
  }

  async function sendRecommendation(manga) {
    if (!myId) return;
    setShowPicker(false);

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
    } else {
      if (error) console.warn('[DM rec send error]', error.code, error.message, error.details);
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
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#534AB7" />
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
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={null}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                isOwn={item.sender_id === myId}
                friendColor={friendColor}
                colors={colors}
                navigation={navigation}
                onRetry={item._failed ? retryMessage : null}
              />
            )}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: 12 }]}>
          <TouchableOpacity style={styles.recBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <Ionicons name="paper-plane-outline" size={22} color="#534AB7" />
          </TouchableOpacity>

          <TextInput
            style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
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
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Recommend a Manga</Text>
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
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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

  recCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', width: 240 },
  recRow: { flexDirection: 'row', padding: 10 },
  recCoverWrap: { width: 72, height: 100, borderRadius: 8, overflow: 'hidden', marginRight: 10 },
  recCover: { width: '100%', height: '100%', borderRadius: 8 },
  recInfo: { flex: 1, justifyContent: 'space-between' },
  recTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginBottom: 4 },
  recGenres: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  recGenreTag: { backgroundColor: 'rgba(83,74,183,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recGenreText: { color: '#A09CE0', fontSize: 10, fontWeight: '600' },
  recMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  recMetaText: { fontSize: 11, marginLeft: 3 },
  recOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(83,74,183,0.12)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
  recOpenText: { color: '#534AB7', fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyAvatarText: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  emptyName: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  recBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 2 },
  textInput: {
    flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15, maxHeight: 100, marginRight: 8,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#534AB7', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendBtnDisabled: { backgroundColor: 'rgba(83,74,183,0.35)' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 6 },
  retryText: { color: '#FF453A', fontSize: 10, fontWeight: '600' },

  // Manga picker
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, maxHeight: '75%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  pickerTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 4 },
  pickerSub: { fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  pickerCard: { width: '29%', borderRadius: 12, borderWidth: 1, overflow: 'hidden', padding: 8, alignItems: 'center' },
  pickerCoverWrap: { width: '100%', aspectRatio: 0.7, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
  pickerCover: { width: '100%', height: '100%', borderRadius: 8 },
  pickerCardTitle: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  pickerCardMeta: { fontSize: 10, marginTop: 2 },
});
