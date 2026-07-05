import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { MangaCover } from '../utils/mangaCovers';
import { supabase } from '../supabase';
import { insertActivity } from '../utils/activityFeed';


const BLOCKED_DOMAINS = [
  'mega.nz', 'drive.google.com', 'mediafire.com', 'zippyshare.com',
  'uploaded.net', 'rapidgator.net', '4shared.com', 'wetransfer.com', 'sendspace.com',
];

function containsBlockedDomain(text) {
  const lower = (text || '').toLowerCase();
  return BLOCKED_DOMAINS.some((d) => lower.includes(d));
}

const REPORT_REASONS = ['Piracy link', 'Copyrighted content', 'Harassment', 'Spam', 'Other'];

function avatarColor(name) {
  const hue = (name || '?').charCodeAt(0) * 47 % 360;
  return `hsl(${hue}, 55%, 32%)`;
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

export default function DiscussionScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    title = '',
    searchKey,
    lang,
    color,
    latestChapter,
    discussing,
  } = route.params || {};

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isSpoilerPost, setIsSpoilerPost] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [fetchingComments, setFetchingComments] = useState(true);
  const [spoilerFilter, setSpoilerFilter] = useState(true);
  const [revealedSpoilers, setRevealedSpoilers] = useState({});
  const [expandedReplies, setExpandedReplies] = useState({});
  const [sortBy, setSortBy] = useState('top');
  const [selectedChapter, setSelectedChapter] = useState(latestChapter || 1);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, name } | null
  const [urlError, setUrlError] = useState('');
  const [reportItem, setReportItem] = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportToast, setReportToast] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  // Chapter chip selector — last 3 chapters only, never a full scroll list
  const recentChapters = [0, 1, 2]
    .map((n) => (latestChapter || 1) - n)
    .filter((n) => n > 0);

  useEffect(() => {
    loadComments();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setCurrentUserId(session.user.id);
    });
  }, [selectedChapter]);

  async function loadComments() {
    if (!title) { setFetchingComments(false); return; }
    setFetchingComments(true);

    // 1. Fetch top-level comments only, scoped to the selected chapter.
    // Legacy comments (posted before per-chapter tagging existed) have no
    // chapter set — treat those as belonging to the latest chapter so they
    // don't just vanish from the thread.
    let query = supabase
      .from('comments')
      .select('id, user_id, text, likes, spoiler, created_at, author:user_id(username)')
      .eq('series_title', title)
      .is('parent_id', null);
    query = selectedChapter === latestChapter
      ? query.or(`chapter.eq.${selectedChapter},chapter.is.null`)
      : query.eq('chapter', selectedChapter);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      setFetchingComments(false);
      return;
    }

    // 2. Fetch replies for all top-level comments
    let replyRows = [];
    if (data.length > 0) {
      const { data: replies } = await supabase
        .from('comments')
        .select('id, user_id, text, likes, spoiler, created_at, parent_id, author:user_id(username)')
        .in('parent_id', data.map((c) => c.id))
        .order('created_at', { ascending: true });
      if (replies) replyRows = replies;
    }

    // 3. Fetch which comments + replies the current user has liked
    const uid = currentUserId || (await supabase.auth.getSession()).data.session?.user?.id;
    let likedSet = new Set();
    if (uid) {
      const allIds = [...data.map((c) => c.id), ...replyRows.map((r) => r.id)];
      if (allIds.length > 0) {
        const { data: liked } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', uid)
          .in('comment_id', allIds);
        if (liked) likedSet = new Set(liked.map((l) => l.comment_id));
      }
    }

    // 4. Group replies by parent_id
    const replyMap = {};
    replyRows.forEach((r) => {
      if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
      const rName = r.author?.username || 'Reader';
      replyMap[r.parent_id].push({
        id: r.id,
        userId: r.user_id,
        name: rName,
        avatar: rName.charAt(0).toUpperCase(),
        time: timeAgo(r.created_at),
        text: r.text,
        likes: r.likes || 0,
        liked: likedSet.has(r.id),
      });
    });

    setFetchingComments(false);
    setComments(data.map((row) => {
      const name = row.author?.username || 'Reader';
      return {
        id: row.id,
        userId: row.user_id,
        name,
        avatar: name.charAt(0).toUpperCase(),
        time: timeAgo(row.created_at),
        text: row.text,
        likes: row.likes || 0,
        liked: likedSet.has(row.id),
        spoiler: row.spoiler || false,
        replies: replyMap[row.id] || [],
      };
    }));
  }

  async function postComment() {
    const text = commentText.trim();
    if (!text || !currentUserId || commentLoading) return;
    if (containsBlockedDomain(text)) {
      setUrlError('Links to file-sharing sites are not allowed');
      return;
    }
    setUrlError('');
    setCommentLoading(true);

    const payload = {
      user_id: currentUserId,
      series_title: title,
      chapter: selectedChapter,
      text,
      spoiler: replyingTo ? false : isSpoilerPost,
      ...(replyingTo ? { parent_id: replyingTo.commentId } : {}),
    };

    const { data, error } = await supabase
      .from('comments')
      .insert(payload)
      .select()
      .maybeSingle();

    setCommentLoading(false);
    if (!error && data) {
      if (!replyingTo && currentUserId) {
        insertActivity(currentUserId, 'comment_posted', { series_title: title, text: text.slice(0, 120) });
      }
      if (replyingTo) {
        if (replyingTo.userId && replyingTo.userId !== currentUserId) {
          supabase.from('notifications').insert({
            user_id: replyingTo.userId,
            actor_id: currentUserId,
            type: 'reply',
            data: { series_title: title, chapter: latestChapter, text_preview: text.slice(0, 80), comment_id: replyingTo.commentId },
          }).then(() => {});
        }
        setComments((prev) => prev.map((c) => {
          if (c.id !== replyingTo.commentId) return c;
          return {
            ...c,
            replies: [...c.replies, {
              id: data.id,
              name: 'You',
              avatar: 'Y',
              time: 'just now',
              text: data.text,
              likes: 0,
              liked: false,
            }],
          };
        }));
        setExpandedReplies((prev) => ({ ...prev, [replyingTo.commentId]: true }));
        setReplyingTo(null);
      } else {
        setComments((prev) => [{
          id: data.id,
          name: 'You',
          avatar: 'Y',
          time: 'just now',
          text: data.text,
          likes: 0,
          liked: false,
          spoiler: data.spoiler || false,
          replies: [],
        }, ...prev]);
      }
      setCommentText('');
      setIsSpoilerPost(false);
    }
  }

  function handleLike(commentId) {
    setComments((prev) => prev.map((c) =>
      c.id === commentId
        ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
        : c
    ));
    if (currentUserId) {
      supabase.rpc('toggle_comment_like', { p_comment_id: commentId }).then(() => {});
    }
  }

  function handleReplyLike(commentId, replyId) {
    setComments((prev) => prev.map((c) => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map((r) =>
          r.id === replyId
            ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
            : r
        ),
      };
    }));
    if (currentUserId) {
      supabase.rpc('toggle_comment_like', { p_comment_id: replyId }).then(() => {});
    }
  }

  function handleReply(name, commentId, userId) {
    setReplyingTo({ commentId, name, userId });
    setCommentText(`@${name} `);
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  function toggleSpoiler(id) {
    setRevealedSpoilers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function submitReport(reason) {
    if (!reportItem) return;
    setReportSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('reports').insert({
        reporter_id: user?.id || currentUserId,
        content_id: String(reportItem.id),
        reason,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}
    setReportSubmitting(false);
    setReportItem(null);
    setReportToast(true);
    setTimeout(() => setReportToast(false), 2000);
  }

  function toggleReplies(id) {
    setExpandedReplies((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const sorted = sortBy === 'top' ? [...comments].sort((a, b) => b.likes - a.likes) : comments;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 56}>

      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>Ch. {latestChapter} · Discussion</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled">

          {/* ── Manga info card ── */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MangaCover
              title={title}
              searchKey={searchKey}
              lang={lang}
              color={color || '#1A1A2E'}
              style={styles.infoCover}
            />
            <View style={styles.infoRight}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.infoChap, { color: colors.muted }]}>Chapter {latestChapter} · Latest</Text>
              <View style={styles.infoStats}>
                <Ionicons name="chatbubble-ellipses" size={12} color="#7B5CFF" />
                <Text style={styles.infoDiscussing}>
                  {(discussing || 0).toLocaleString()} discussing
                </Text>
              </View>
            </View>
          </View>

          {/* ── Chapter chips — last 3 only, never a full scroll list ── */}
          {recentChapters.length > 1 && (
            <View style={styles.chapterChipRow}>
              {recentChapters.map((num) => {
                const active = num === selectedChapter;
                return (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.chapterChip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      active && styles.chapterChipActive,
                    ]}
                    onPress={() => setSelectedChapter(num)}>
                    <Text style={[styles.chapterChipText, { color: active ? '#fff' : colors.muted }]}>
                      Ch. {num}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Controls ── */}
          <View style={styles.controlsRow}>
            <View style={[styles.sortPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.sortBtn, sortBy === 'top' && [styles.sortBtnActive, { backgroundColor: colors.background }]]}
                onPress={() => setSortBy('top')}>
                <Text style={[styles.sortBtnText, { color: sortBy === 'top' ? '#7B5CFF' : colors.muted }]}>Top</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, sortBy === 'new' && [styles.sortBtnActive, { backgroundColor: colors.background }]]}
                onPress={() => setSortBy('new')}>
                <Text style={[styles.sortBtnText, { color: sortBy === 'new' ? '#7B5CFF' : colors.muted }]}>New</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.spoilerBtn, { backgroundColor: colors.card, borderColor: colors.border }, !spoilerFilter && styles.spoilerBtnOn]}
              onPress={() => setSpoilerFilter((v) => !v)}>
              <Ionicons
                name={spoilerFilter ? 'eye-off-outline' : 'eye-outline'}
                size={13}
                color={spoilerFilter ? colors.muted : '#7B5CFF'}
              />
              <Text style={[styles.spoilerBtnText, { color: spoilerFilter ? colors.muted : '#7B5CFF' }]}>
                Spoilers
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Comments ── */}
          {fetchingComments && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#7B5CFF" />
            </View>
          )}
          {!fetchingComments && sorted.length === 0 && (
            <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubble-outline" size={32} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 14 }}>No comments yet. Start the discussion!</Text>
            </View>
          )}
          {sorted.map((comment) => {
            const isSpoiler = comment.spoiler && spoilerFilter && !revealedSpoilers[comment.id];
            const repliesOpen = expandedReplies[comment.id];
            const hasReplies = comment.replies?.length > 0;

            return (
              <View key={comment.id}>
                {/* Top-level comment */}
                <View style={[styles.commentRow, { borderBottomColor: repliesOpen && hasReplies ? 'transparent' : colors.border }]}>
                  {/* Avatar column */}
                  <View style={styles.avatarCol}>
                    <View style={[styles.avatar, { backgroundColor: avatarColor(comment.name) }]}>
                      <Text style={styles.avatarText}>{comment.avatar}</Text>
                    </View>
                    {repliesOpen && hasReplies && (
                      <View style={[styles.threadLine, { backgroundColor: colors.border }]} />
                    )}
                  </View>

                  {/* Body */}
                  <View style={styles.commentBody}>
                    <View style={styles.metaRow}>
                      <Text style={[styles.commenterName, { color: colors.text }]}>{comment.name}</Text>
                      <Text style={[styles.commenterTime, { color: colors.muted }]}>{comment.time}</Text>
                      {comment.spoiler && (
                        <View style={styles.spoilerPill}>
                          <Text style={styles.spoilerPillText}>SPOILER</Text>
                        </View>
                      )}
                    </View>

                    {isSpoiler ? (
                      <TouchableOpacity
                        style={[styles.spoilerBlock, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => toggleSpoiler(comment.id)}>
                        <Ionicons name="eye-off-outline" size={13} color={colors.muted} />
                        <Text style={[styles.spoilerBlockText, { color: colors.muted }]}>
                          Spoiler · tap to reveal
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.bodyText, { color: colors.text }]}>{comment.text}</Text>
                    )}

                    <View style={styles.actionsRow}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(comment.id)}>
                        <Ionicons
                          name={comment.liked ? 'heart' : 'heart-outline'}
                          size={15}
                          color={comment.liked ? '#E8527A' : colors.muted}
                        />
                        <Text style={[styles.actionText, { color: comment.liked ? '#E8527A' : colors.muted }]}>
                          {comment.likes}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleReply(comment.name, comment.id, comment.userId)}>
                        <Ionicons name="chatbubble-outline" size={14} color={colors.muted} />
                        <Text style={[styles.actionText, { color: colors.muted }]}>Reply</Text>
                      </TouchableOpacity>

                      {hasReplies && (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => toggleReplies(comment.id)}>
                          <Text style={[styles.actionText, { color: '#7B5CFF' }]}>
                            {repliesOpen
                              ? 'Hide replies'
                              : `${comment.replies.length} repl${comment.replies.length === 1 ? 'y' : 'ies'}`}
                          </Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.actionBtn, { marginLeft: 'auto' }]}
                        onPress={() => setReportItem(comment)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="flag-outline" size={13} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Inline replies */}
                {repliesOpen && comment.replies?.map((reply, ri) => {
                  const isLast = ri === comment.replies.length - 1;
                  return (
                    <View
                      key={reply.id}
                      style={[styles.replyRow, { borderBottomColor: isLast ? colors.border : 'transparent' }]}>
                      {/* Thread continuation */}
                      <View style={styles.threadPad}>
                        <View style={[styles.threadLine, { backgroundColor: colors.border, flex: isLast ? 0.4 : 1 }]} />
                      </View>

                      {/* Reply avatar */}
                      <View style={[styles.replyAvatar, { backgroundColor: avatarColor(reply.name) }]}>
                        <Text style={styles.replyAvatarText}>{reply.avatar}</Text>
                      </View>

                      {/* Reply body */}
                      <View style={styles.replyBody}>
                        <View style={styles.metaRow}>
                          <Text style={[styles.commenterName, { color: colors.text }]}>{reply.name}</Text>
                          <Text style={[styles.commenterTime, { color: colors.muted }]}>{reply.time}</Text>
                        </View>
                        <Text style={[styles.bodyText, { color: colors.text }]}>{reply.text}</Text>
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleReplyLike(comment.id, reply.id)}>
                            <Ionicons
                              name={reply.liked ? 'heart' : 'heart-outline'}
                              size={14}
                              color={reply.liked ? '#E8527A' : colors.muted}
                            />
                            <Text style={[styles.actionText, { color: reply.liked ? '#E8527A' : colors.muted }]}>
                              {reply.likes}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtn} onPress={() => handleReply(reply.name, comment.id, reply.userId)}>
                            <Ionicons name="chatbubble-outline" size={13} color={colors.muted} />
                            <Text style={[styles.actionText, { color: colors.muted }]}>Reply</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, { marginLeft: 'auto' }]}
                            onPress={() => setReportItem(reply)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="flag-outline" size={13} color={colors.muted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* ── Fixed comment input ── */}
        {replyingTo && (
          <View style={[styles.replyingToBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Ionicons name="return-down-forward-outline" size={13} color="#7B5CFF" />
            <Text style={[styles.replyingToText, { color: colors.muted }]}>
              Replying to <Text style={{ color: '#7B5CFF', fontWeight: '600' }}>@{replyingTo.name}</Text>
            </Text>
            <TouchableOpacity
              onPress={() => { setReplyingTo(null); setCommentText(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={15} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}
        {!!urlError && (
          <View style={[styles.urlErrorBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Ionicons name="warning-outline" size={13} color="#E8527A" />
            <Text style={styles.urlErrorText}>{urlError}</Text>
          </View>
        )}
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderTopColor: (!replyingTo && !urlError) ? colors.border : 'transparent', paddingBottom: Math.max(insets.bottom, 12) }]}>
          {!replyingTo && (
            <TouchableOpacity
              style={[styles.spoilerToggleBtn, isSpoilerPost && styles.spoilerToggleBtnActive]}
              onPress={() => setIsSpoilerPost((v) => !v)}>
              <Ionicons name={isSpoilerPost ? 'eye-off' : 'eye-off-outline'} size={15} color={isSpoilerPost ? '#E8527A' : colors.muted} />
            </TouchableOpacity>
          )}
          <TextInput
            ref={inputRef}
            style={[styles.inputField, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            placeholder={replyingTo ? `Reply to @${replyingTo.name}…` : `Comment on Ch. ${latestChapter}…`}
            placeholderTextColor={colors.muted}
            value={commentText}
            onChangeText={(t) => { setCommentText(t); if (urlError) setUrlError(''); }}
            returnKeyType="send"
            onSubmitEditing={postComment}
            multiline
            maxLength={500}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={postComment} disabled={commentLoading || !commentText.trim()}>
            {commentLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
        {/* ── Report Modal ── */}
        <Modal visible={!!reportItem} animationType="fade" transparent onRequestClose={() => setReportItem(null)}>
          <TouchableOpacity style={styles.reportOverlay} activeOpacity={1} onPress={() => setReportItem(null)}>
            <View style={[styles.reportSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.reportTitle, { color: colors.text }]}>Report Content</Text>
              <Text style={[styles.reportSub, { color: colors.muted }]}>Why are you reporting this?</Text>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reportOption, { borderColor: colors.border }]}
                  onPress={() => submitReport(reason)}
                  disabled={reportSubmitting}
                  activeOpacity={0.75}>
                  <Text style={[styles.reportOptionText, { color: colors.text }]}>{reason}</Text>
                  {reportSubmitting
                    ? <ActivityIndicator size="small" color="#7B5CFF" />
                    : <Ionicons name="chevron-forward" size={14} color={colors.muted} />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Reported toast ── */}
        {reportToast && (
          <View style={styles.toast} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={16} color="#1D9E75" />
            <Text style={styles.toastText}>Reported</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4, marginRight: 10 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 11, marginTop: 1 },
  infoCard: { flexDirection: 'row', margin: 16, borderRadius: 14, padding: 14, borderWidth: 1 },
  infoCover: { width: 60, height: 76, borderRadius: 9, marginRight: 14 },
  infoRight: { flex: 1, justifyContent: 'center' },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  infoChap: { fontSize: 12, marginBottom: 6 },
  infoStats: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoDiscussing: { color: '#7B5CFF', fontSize: 11, fontWeight: '600' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4, gap: 8 },
  sortPill: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  sortBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  sortBtnActive: { borderRadius: 8 },
  sortBtnText: { fontSize: 12, fontWeight: '600' },
  spoilerBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1, gap: 5 },
  spoilerBtnOn: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.1)' },
  spoilerBtnText: { fontSize: 12, fontWeight: '500' },
  // Comments
  commentRow: { flexDirection: 'row', paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1 },
  avatarCol: { marginRight: 12, alignItems: 'center', width: 36 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  threadLine: { width: 2, flex: 1, marginTop: 6, borderRadius: 1, minHeight: 16 },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chapterChipRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10, gap: 8 },
  chapterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chapterChipActive: { backgroundColor: '#7B5CFF', borderColor: '#7B5CFF' },
  chapterChipText: { fontSize: 12, fontWeight: '700' },
  commentBody: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' },
  commenterName: { fontSize: 13, fontWeight: '700' },
  commenterTime: { fontSize: 11 },
  spoilerPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(232,82,122,0.15)', borderWidth: 1, borderColor: 'rgba(232,82,122,0.4)' },
  spoilerPillText: { fontSize: 9, fontWeight: '700', color: '#E8527A', letterSpacing: 0.5 },
  spoilerBlock: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, gap: 8 },
  spoilerBlockText: { fontSize: 12 },
  bodyText: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12, fontWeight: '500' },
  // Replies
  replyRow: { flexDirection: 'row', paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1 },
  threadPad: { width: 36, marginRight: 12, alignItems: 'center' },
  replyAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2, flexShrink: 0 },
  replyAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  replyBody: { flex: 1 },
  // Input
  replyingToBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, gap: 6 },
  replyingToText: { fontSize: 12, flex: 1 },
  urlErrorBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, gap: 6 },
  urlErrorText: { color: '#E8527A', fontSize: 12, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  inputField: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, maxHeight: 100, marginRight: 10 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#7B5CFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spoilerToggleBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6, flexShrink: 0 },
  spoilerToggleBtnActive: { backgroundColor: 'rgba(232,82,122,0.12)' },
  // Report
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  reportSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  reportTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  reportSub: { fontSize: 13, marginBottom: 16 },
  reportOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  reportOptionText: { fontSize: 14 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(29,158,117,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(29,158,117,0.3)' },
  toastText: { color: '#1D9E75', fontSize: 13, fontWeight: '600' },
});
