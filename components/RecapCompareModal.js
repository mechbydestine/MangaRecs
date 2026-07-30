// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — compare with a friend
//
// Reached from the finale's "Compare with a friend" action, not from the
// autoplay story itself — Wrapped-style compare features are a post-recap
// action, not another beat in the 10-slide sequence. Needs
// get_friends_recap_totals / get_friend_reading_stats (supabase_migrations.sql
// §57); until that migration is applied this just shows an empty state
// rather than erroring, since utils/recapHistory.js swallows the failure.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { rgba } from '../utils/recapIdentity';
import { fetchFriendsRecap, fetchFriendDetail } from '../utils/recapHistory';

const DISPLAY = 'MangaRecsBrand';

async function fetchGenresBatch(titles) {
  const capped = (titles || []).slice(0, 12);
  if (!capped.length) return {};
  const params = capped.map((_, i) => `$s${i}: String`).join(', ');
  const fields = capped.map((_, i) => `m${i}: Media(search: $s${i}, type: MANGA, isAdult: false) { genres }`).join(' ');
  const variables = {};
  capped.forEach((t, i) => { variables[`s${i}`] = t; });
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: `query(${params}) { ${fields} }`, variables }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const data = json?.data || {};
    const out = {};
    capped.forEach((t, i) => { out[t] = data[`m${i}`]?.genres || []; });
    return out;
  } catch (_) {
    return {};
  }
}

function norm(t) { return String(t || '').trim().toLowerCase(); }

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter += 1; });
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

export default function RecapCompareModal({ visible, onClose, d, id, s, period }) {
  const [friends, setFriends] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!visible) { setFriends(null); setSelected(null); setDetail(null); return; }
    let dead = false;
    fetchFriendsRecap(period).then((rows) => {
      if (!dead) setFriends(rows.sort((a, b) => (b.chapters || 0) - (a.chapters || 0)));
    });
    return () => { dead = true; };
  }, [visible, period]);

  const openFriend = useCallback(async (friend) => {
    setSelected(friend);
    setDetail(null);
    setDetailLoading(true);
    const rows = await fetchFriendDetail(friend.friend_id, period);
    const genreMap = await fetchGenresBatch(rows.map((r) => r.series_title));

    const myTitles = new Set((d.topSeries || []).map((x) => norm(x.title)));
    const theirTitles = rows.map((r) => norm(r.series_title));
    const sharedSeries = rows.filter((r) => myTitles.has(norm(r.series_title)));

    const theirGenres = [];
    rows.forEach((r) => { (genreMap[r.series_title] || []).forEach((g) => theirGenres.push(g)); });
    const myGenres = (d.genres || []).map((g) => g.label);
    const tasteScore = Math.round(jaccard(myGenres, theirGenres) * 100);
    const friendChapters = rows.reduce((a, r) => a + (r.current_chapter || 0), 0);

    setDetail({
      sharedSeries,
      tasteScore,
      friendChapters,
      leaderIsMe: d.chapters >= friendChapters,
    });
    setDetailLoading(false);
  }, [d, period]);

  const back = useCallback(() => { setSelected(null); setDetail(null); }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: s.light ? '#1a1420' : '#100c16', borderColor: rgba(s.ink, 0.18) }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            {selected ? (
              <TouchableOpacity onPress={back} style={styles.backBtn} hitSlop={10}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
            ) : <View style={{ width: 20 }} />}
            <Text style={styles.title}>{selected ? `You vs @${selected.username}` : 'Compare with a friend'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {!selected && (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {friends === null && <ActivityIndicator color={s.accent} style={{ marginVertical: 30 }} />}
              {friends !== null && friends.length === 0 && (
                <Text style={styles.empty}>
                  Add a few friends and this half's comparison will be waiting for you.
                </Text>
              )}
              {(friends || []).map((f, i) => (
                <TouchableOpacity key={f.friend_id} style={styles.friendRow} onPress={() => openFriend(f)} activeOpacity={0.75}>
                  <Text style={[styles.rank, { color: s.accent }]}>#{i + 1}</Text>
                  <View style={styles.avatar}>
                    {!!f.avatar_url && <Image source={{ uri: f.avatar_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName} numberOfLines={1}>@{f.username}</Text>
                    {!!f.top_series && <Text style={styles.friendSub} numberOfLines={1}>{f.top_series}</Text>}
                  </View>
                  <Text style={[styles.friendChapters, { color: s.accent }]}>{f.chapters || 0}</Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {selected && (
            <View>
              {detailLoading && <ActivityIndicator color={s.accent} style={{ marginVertical: 30 }} />}
              {!detailLoading && detail && (
                <>
                  <View style={styles.vsRow}>
                    <View style={styles.vsCell}>
                      <Text style={[styles.vsVal, { color: s.accent }]}>{d.chapters}</Text>
                      <Text style={styles.vsLbl}>YOU</Text>
                    </View>
                    <Text style={styles.vsX}>VS</Text>
                    <View style={styles.vsCell}>
                      <Text style={styles.vsVal}>{detail.friendChapters}</Text>
                      <Text style={styles.vsLbl}>@{selected.username}</Text>
                    </View>
                  </View>

                  <View style={[styles.tasteCard, { borderColor: rgba(s.accent, 0.5), backgroundColor: rgba(s.accent, 0.12) }]}>
                    <Text style={[styles.tastePct, { color: s.accent }]}>{detail.tasteScore}%</Text>
                    <Text style={styles.tasteLbl}>shared reading taste this half</Text>
                  </View>

                  {detail.sharedSeries.length > 0 ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.sectionLbl}>YOU BOTH READ</Text>
                      {detail.sharedSeries.slice(0, 5).map((x) => (
                        <Text key={x.series_title} style={styles.sharedTitle} numberOfLines={1}>· {x.series_title}</Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.empty}>No overlapping series this half — different shelves, same app.</Text>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backBtn: { padding: 4 },
  closeBtn: { padding: 4 },
  title: { fontFamily: DISPLAY, fontSize: 16, color: '#fff' },
  empty: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, lineHeight: 19, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 12 },

  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rank: { fontFamily: DISPLAY, fontSize: 13, width: 26 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  friendName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  friendSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginTop: 1 },
  friendChapters: { fontFamily: DISPLAY, fontSize: 16 },

  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginVertical: 10 },
  vsCell: { alignItems: 'center' },
  vsVal: { fontFamily: DISPLAY, fontSize: 34, color: '#fff' },
  vsLbl: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  vsX: { fontFamily: DISPLAY, fontSize: 14, color: 'rgba(255,255,255,0.35)' },

  tasteCard: { borderWidth: 1.5, borderRadius: 16, alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  tastePct: { fontFamily: DISPLAY, fontSize: 38 },
  tasteLbl: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  sectionLbl: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: 'rgba(255,255,255,0.4)', marginBottom: 6 },
  sharedTitle: { color: '#fff', fontSize: 13.5, fontWeight: '600', marginBottom: 4 },
});
