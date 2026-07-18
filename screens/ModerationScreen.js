import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
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

export default function ModerationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Moderation Queue</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
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
});
