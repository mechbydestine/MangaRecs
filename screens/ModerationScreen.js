import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { supabase } from '../supabase';

const CONTENT_TYPE_LABELS = {
  discussion_comment: 'Comment',
  series_discussion: 'Series discussion',
  reader_page: 'Broken reader page',
};

function ReportsTab({ colors, insets }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase.rpc('get_reports_queue');
    if (err) { setError(true); setLoading(false); return; }
    setReports(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function resolve(id, resolved) {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, resolved } : r)));
    await supabase.rpc('resolve_report', { p_report_id: id, p_resolved: resolved });
  }

  const visible = reports.filter((r) => showResolved || !r.resolved);
  const pendingCount = reports.filter((r) => !r.resolved).length;

  return (
    <>
      <View style={styles.subHeader}>
        <Text style={[styles.subHeaderText, { color: colors.muted }]}>
          {pendingCount} pending
        </Text>
        <TouchableOpacity onPress={() => setShowResolved((v) => !v)}>
          <Text style={styles.toggleText}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#7B5CFF" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>Couldn't load reports — admin access only.</Text>
      ) : visible.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {pendingCount === 0 ? 'No pending reports. All clear.' : 'Nothing here.'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {visible.map((r) => (
            <View key={r.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.typeBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.text }]}>
                    {CONTENT_TYPE_LABELS[r.content_type] || r.content_type || 'Content'}
                  </Text>
                </View>
                <Text style={[styles.dateText, { color: colors.muted }]}>
                  {new Date(r.created_at).toLocaleDateString()}
                </Text>
              </View>
              {!!r.content_snapshot && (
                <Text style={[styles.snapshot, { color: colors.text }]} numberOfLines={4}>
                  "{r.content_snapshot}"
                </Text>
              )}
              <Text style={[styles.reason, { color: colors.muted }]}>
                Reported for: <Text style={{ fontWeight: '700', color: colors.text }}>{r.reason}</Text>
              </Text>
              <Text style={[styles.reporter, { color: colors.muted }]}>
                Reported by {r.reporter_username || 'unknown user'}
              </Text>
              <TouchableOpacity
                style={[styles.resolveBtn, r.resolved && styles.reopenBtn]}
                onPress={() => resolve(r.id, !r.resolved)}>
                <Ionicons name={r.resolved ? 'refresh-outline' : 'checkmark-circle-outline'} size={15} color="#fff" />
                <Text style={styles.resolveBtnText}>{r.resolved ? 'Reopen' : 'Mark Resolved'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );
}

function TrendingTab({ colors, insets }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase.rpc('get_trending_candidates');
    if (err) { setError(true); setLoading(false); return; }
    setCandidates(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    setBusyId(id);
    const rpcName = action === 'approve' ? 'approve_trending_candidate' : 'reject_trending_candidate';
    const { error } = await supabase.rpc(rpcName, { p_id: id });
    if (!error) {
      setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, status: action === 'approve' ? 'approved' : 'rejected' } : c)));
    }
    setBusyId(null);
  }

  const visible = candidates.filter((c) => showReviewed || c.status === 'pending');
  const pendingCount = candidates.filter((c) => c.status === 'pending').length;

  return (
    <>
      <View style={styles.subHeader}>
        <Text style={[styles.subHeaderText, { color: colors.muted }]}>
          {pendingCount} awaiting review
        </Text>
        <TouchableOpacity onPress={() => setShowReviewed((v) => !v)}>
          <Text style={styles.toggleText}>{showReviewed ? 'Hide reviewed' : 'Show reviewed'}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#7B5CFF" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>Couldn't load candidates — admin access only.</Text>
      ) : visible.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {pendingCount === 0 ? 'No pending trending titles right now.' : 'Nothing here.'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {visible.map((c) => (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.trendingRow}>
                {c.cover_url ? (
                  <Image source={{ uri: c.cover_url }} style={styles.trendingCover} />
                ) : (
                  <View style={[styles.trendingCover, { backgroundColor: c.color || '#0D1A2D' }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trendingTitle, { color: colors.text }]} numberOfLines={2}>{c.title}</Text>
                  <Text style={[styles.trendingMeta, { color: colors.muted }]}>
                    {c.lang?.toUpperCase()} · {c.rating ? `${c.rating}/10` : 'no rating'} · {c.genres?.join(', ') || 'no genres'}
                  </Text>
                  {!!c.source_note && (
                    <Text style={[styles.trendingSource, { color: colors.muted }]} numberOfLines={1}>{c.source_note}</Text>
                  )}
                </View>
              </View>
              {!!c.description && (
                <Text style={[styles.snapshot, { color: colors.text }]} numberOfLines={3}>{c.description}</Text>
              )}
              {c.status === 'pending' ? (
                <View style={styles.trendingActions}>
                  <TouchableOpacity
                    style={[styles.resolveBtn, { flex: 1 }]}
                    disabled={busyId === c.id}
                    onPress={() => act(c.id, 'approve')}>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                    <Text style={styles.resolveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.resolveBtn, styles.reopenBtn, { flex: 1 }]}
                    disabled={busyId === c.id}
                    onPress={() => act(c.id, 'reject')}>
                    <Ionicons name="close-circle-outline" size={15} color="#fff" />
                    <Text style={styles.resolveBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.reason, { color: colors.muted, marginTop: 8 }]}>
                  {c.status === 'approved' ? 'Approved — live in manga_pool' : 'Rejected'}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );
}

export default function ModerationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [tab, setTab] = useState('reports'); // 'reports' | 'trending'

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Moderation</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'reports' && { borderBottomColor: '#7B5CFF', borderBottomWidth: 2 }]}
          onPress={() => setTab('reports')}>
          <Text style={[styles.tabText, { color: tab === 'reports' ? colors.text : colors.muted }]}>Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'trending' && { borderBottomColor: '#7B5CFF', borderBottomWidth: 2 }]}
          onPress={() => setTab('trending')}>
          <Text style={[styles.tabText, { color: tab === 'trending' ? colors.text : colors.muted }]}>Trending</Text>
        </TouchableOpacity>
      </View>

      {tab === 'reports' ? <ReportsTab colors={colors} insets={insets} /> : <TrendingTab colors={colors} insets={insets} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 20, marginBottom: 4 },
  tabBtn: { paddingBottom: 10 },
  tabText: { fontSize: 14, fontWeight: '700' },
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  subHeaderText: { fontSize: 12 },
  toggleText: { color: '#7B5CFF', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 13, paddingHorizontal: 30 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  typeBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11 },
  snapshot: { fontSize: 13, fontStyle: 'italic', lineHeight: 19, marginBottom: 8 },
  reason: { fontSize: 12, marginBottom: 4 },
  reporter: { fontSize: 11, marginBottom: 10 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7B5CFF', borderRadius: 10, paddingVertical: 9, alignSelf: 'flex-start', paddingHorizontal: 14 },
  reopenBtn: { backgroundColor: '#8A8894' },
  resolveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  trendingRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  trendingCover: { width: 56, height: 80, borderRadius: 8 },
  trendingTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  trendingMeta: { fontSize: 11, marginBottom: 2 },
  trendingSource: { fontSize: 10, fontStyle: 'italic' },
  trendingActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
