import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator,
} from 'react-native';
// expo-image rather than RN's Image: these are remote avatars/covers and
// RN's Android disk cache is effectively absent, so they re-downloaded on
// every render. cachePolicy defaults to 'disk'.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { rgba } from '../utils/recapIdentity';
import { useT } from '../utils/LanguageContext';
import { supabase } from '../supabase';
import MobileHeader from '../components/MobileHeader';
import PickerSheet from '../components/PickerSheet';
import { GENRE_PICKER_OPTIONS as GENRES } from '../utils/genres';
import { useResponsive } from '../utils/responsive';
import { showAppToast } from '../utils/appToast';
import { showAppAlert } from '../utils/appAlert';
import { ensureMediaLibraryPermission } from '../utils/mediaPermissions';
import { HIT_SLOP } from '../utils/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const statMeta = (colors) => [
  { icon: 'book',   label: 'Series Published', color: colors.primary, key: 'count' },
  { icon: 'eye',    label: 'Total Reads',       color: '#1D9E75', key: 'views' },
  { icon: 'people', label: 'Followers',         color: '#EF9F27', key: 'followers' },
];

const WEEK_READS_FALLBACK = [0, 0, 0, 0, 0, 0, 0];

const STATUS_COLOR = {
  Active: { text: '#1D9E75', bg: 'rgba(29,158,117,0.15)' },
  Draft:  { text: '#9B9AA3', bg: 'rgba(155,154,163,0.12)' },
  Hiatus: { text: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
};

function getLast7DayLabels() {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return DAYS[d.getDay()];
  });
}

function MiniBarChart({ data, labels }) {
  const { colors } = useTheme();
  const max = Math.max(...data, 1);
  return (
    <View style={styles.chartWrap}>
      {data.map((val, i) => (
        <View key={i} style={styles.barCol}>
          <View style={[styles.bar, { height: (val / max) * 64, backgroundColor: i === data.length - 1 ? colors.primary : rgba(colors.primary, 0.35) }]} />
          <Text style={styles.barLabel}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CreatorDashboardScreen() {
  const { colors } = useTheme();

  const insets = useSafeAreaInsets();
  const t = useT();
  const navigation = useNavigation();
  const { isTablet } = useResponsive();

  // Series upload state
  const [showUpload, setShowUpload]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [title, setTitle]                 = useState('');
  const [genre, setGenre]                 = useState('');
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [description, setDescription]     = useState('');
  const [uploadDone, setUploadDone]       = useState(false);

  // Chapter upload state
  const [addChapterSeries, setAddChapterSeries] = useState(null);
  const [chapterTitle, setChapterTitle]   = useState('');
  const [chapterPages, setChapterPages]   = useState([]); // { uri, name }
  // Vertical whitespace between pages, in px. Webtoon's pacing grammar is
  // gutters — tight for action, wide for an emotional beat — but readers there
  // can't control it and creators bake it into the art. Here it's a property of
  // the chapter, so the same pages can be re-paced without re-exporting.
  const [pageGap, setPageGap] = useState(0);
  const [uploadingChapter, setUploadingChapter] = useState(false);
  const [chapterProgress, setChapterProgress]   = useState(0); // 0-1
  const [chapterDone, setChapterDone]     = useState(false);

  // Dashboard data
  const [mySeries, setMySeries]           = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [weekReads, setWeekReads]         = useState(WEEK_READS_FALLBACK);
  const [weekLabels]                      = useState(getLast7DayLabels);
  const [followerCount, setFollowerCount] = useState(0);

  // ── Data loaders ────────────────────────────────────────────────────────────

  async function loadMySeries(uid) {
    if (!uid) return;
    setSeriesLoading(true);
    const { data } = await supabase
      .from('series')
      .select('*')
      .eq('creator_id', uid)
      .order('created_at', { ascending: false });
    if (data) {
      const mapped = data.map((s) => ({
        id: s.id,
        title: s.title,
        genre: s.genre || '',
        status: s.status === 'ongoing' ? 'Active' : s.status === 'hiatus' ? 'Hiatus' : 'Draft',
        chapters: s.chapters ?? 0,
        reads: s.views > 0 ? (s.views >= 1000 ? `${(s.views / 1000).toFixed(1)}K` : String(s.views)) : '—',
        views: s.views ?? 0,
        updated: new Date(s.created_at).toLocaleDateString(),
      }));
      setMySeries(mapped);
      loadWeeklyReads(mapped);
    }
    setSeriesLoading(false);
  }

  async function loadFollowers(uid) {
    if (!uid) return;
    // Count distinct readers across all series owned by this creator
    const { data: seriesRows } = await supabase.from('series').select('title').eq('creator_id', uid);
    if (!seriesRows?.length) return;
    const titles = seriesRows.map((s) => s.title);
    const { count } = await supabase
      .from('reading_progress')
      .select('user_id', { count: 'exact', head: true })
      .in('series_title', titles);
    if (count != null) setFollowerCount(count);
  }

  async function loadWeeklyReads(seriesList) {
    if (!seriesList?.length) return;
    const titles = seriesList.map((s) => s.title);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('reading_progress')
      .select('updated_at')
      .in('series_title', titles)
      .gte('updated_at', sevenDaysAgo);
    if (!data?.length) return;
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = Date.now();
    data.forEach((row) => {
      const diffDays = Math.floor((now - new Date(row.updated_at).getTime()) / (24 * 60 * 60 * 1000));
      const idx = 6 - diffDays;
      if (idx >= 0 && idx < 7) counts[idx]++;
    });
    if (counts.some((c) => c > 0)) setWeekReads(counts);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      loadMySeries(uid);
      loadFollowers(uid);
    });
  }, []);

  // ── Series upload ────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!title || !genre || !currentUserId) return;
    setUploading(true);
    const { error } = await supabase.from('series').insert({
      creator_id: currentUserId,
      title,
      description,
      genre,
      status: 'ongoing',
    });
    setUploading(false);
    if (!error) {
      setUploadDone(true);
      setTimeout(() => {
        setUploadDone(false);
        setShowUpload(false);
        setTitle(''); setGenre(''); setDescription('');
        loadMySeries(currentUserId);
      }, 1800);
    } else {
      showAppToast("Couldn't publish your series — try again");
    }
  }

  // ── Chapter image upload ─────────────────────────────────────────────────────

  function openAddChapter(series) {
    setAddChapterSeries(series);
    setChapterTitle('');
    setChapterPages([]);
    setChapterProgress(0);
    setChapterDone(false);
  }

  function closeChapterSheet() {
    if (uploadingChapter) return;
    setAddChapterSeries(null);
  }

  async function pickPages() {
    if (!(await ensureMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.82,
      orderedSelection: true,
    });
    if (!result.canceled && result.assets?.length) {
      setChapterPages((prev) => {
        const existingUris = new Set(prev.map((p) => p.uri));
        const newPages = result.assets
          .filter((a) => !existingUris.has(a.uri))
          .map((a, i) => ({ uri: a.uri, name: `page_${prev.length + i + 1}.jpg` }));
        return [...prev, ...newPages];
      });
    }
  }

  function removePage(index) {
    setChapterPages((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, name: `page_${i + 1}.jpg` })));
  }

  async function uploadPageToStorage(page, chapterNumber, index) {
    const path = `${currentUserId}/${addChapterSeries.id}/${chapterNumber}/${page.name}`;
    const base64 = await FileSystem.readAsStringAsync(page.uri, { encoding: FileSystem.EncodingType.Base64 });
    const { data, error } = await supabase.storage
      .from('chapters')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('chapters').getPublicUrl(path);
    return urlData.publicUrl;
  }

  // base64 string → Uint8Array for Supabase Storage upload (pure-JS, no atob — works on Hermes)
  function decode(base64) {
    const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = {};
    for (let i = 0; i < table.length; i++) lookup[table[i]] = i;
    const clean = base64.replace(/=/g, '').replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.ceil(clean.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const a = lookup[clean[i]]     ?? 0;
      const b = lookup[clean[i + 1]] ?? 0;
      const c = lookup[clean[i + 2]] ?? 0;
      const d = lookup[clean[i + 3]] ?? 0;
      out[o++] = (a << 2) | (b >> 4);
      if (i + 2 < clean.length) out[o++] = ((b & 0xf) << 4) | (c >> 2);
      if (i + 3 < clean.length) out[o++] = ((c & 0x3) << 6) | d;
    }
    return out.subarray(0, o);
  }

  async function handleUploadChapter() {
    if (!addChapterSeries || !chapterPages.length || uploadingChapter) return;
    setUploadingChapter(true);
    setChapterProgress(0);

    try {
      const chapterNumber = (addChapterSeries.chapters || 0) + 1;
      const pageUrls = [];

      for (let i = 0; i < chapterPages.length; i++) {
        const url = await uploadPageToStorage(chapterPages[i], chapterNumber, i);
        pageUrls.push(url);
        setChapterProgress((i + 1) / chapterPages.length);
      }

      // Insert chapter record
      const { error: chErr } = await supabase.from('chapters').insert({
        series_id: addChapterSeries.id,
        chapter_number: chapterNumber,
        title: chapterTitle.trim() || `Chapter ${chapterNumber}`,
        pages: pageUrls,
        page_gap: pageGap,
      });
      if (chErr) throw chErr;

      // Increment series chapter count
      await supabase.from('series')
        .update({ chapters: chapterNumber })
        .eq('id', addChapterSeries.id);

      setChapterDone(true);
      setTimeout(() => {
        setAddChapterSeries(null);
        loadMySeries(currentUserId);
      }, 1800);
    } catch (err) {
      showAppToast(err.message || t('toast.uploadFailed'));
    }
    setUploadingChapter(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <MobileHeader
        title="Creator Dashboard"
        right={
          <View style={[styles.proBadge, { borderColor: 'rgba(120, 88, 255,0.3)' }]}>
            <Ionicons name="diamond" size={11} color={colors.primary} />
            <Text style={styles.proBadgeText}>{t('creator.title')}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        <View style={isTablet ? styles.tabletWrap : null}>

        {/* Stats */}
        <View style={styles.statsRow}>
          {statMeta(colors).map((s) => {
            let value;
            if (s.key === 'count') value = String(mySeries.length);
            else if (s.key === 'views') {
              const total = mySeries.reduce((acc, x) => acc + (x.views ?? 0), 0);
              value = total >= 1000 ? `${(total / 1000).toFixed(1)}K` : String(total);
            } else value = String(followerCount);
            return (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={s.icon} size={16} color={s.color} />
                <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{s.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Upload Series CTA */}
        <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: colors.card }]} onPress={() => setShowUpload(true)}>
          <View style={styles.uploadIconWrap}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.uploadTitle, { color: colors.text }]}>{t('creator.uploadNewSeries')}</Text>
            <Text style={[styles.uploadSub, { color: colors.muted }]}>{t('creator.publishHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </TouchableOpacity>

        {/* Weekly Reads */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('creator.weeklyReads')}</Text>
          <View style={[styles.analyticsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.analyticsHeader}>
              <View>
                <Text style={[styles.analyticsMainVal, { color: colors.text }]}>{weekReads.reduce((a, b) => a + b, 0)}</Text>
                <Text style={[styles.analyticsMainLabel, { color: colors.muted }]}>reads this week</Text>
              </View>
            </View>
            <MiniBarChart data={weekReads} labels={weekLabels} />
          </View>
        </View>

        {/* My Series */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('creator.mySeries')}</Text>
            <Text style={[styles.seriesCount, { color: colors.muted }]}>{mySeries.length} series</Text>
          </View>
          {mySeries.length === 0 && !seriesLoading ? (
            <Text style={[styles.seriesGenre, { color: colors.muted, textAlign: 'center', paddingVertical: 20 }]}>
              No series yet — upload your first one!
            </Text>
          ) : null}
          {mySeries.map((s) => {
            const status = STATUS_COLOR[s.status] || STATUS_COLOR['Draft'];
            return (
              <View key={s.id} style={[styles.seriesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.seriesTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.seriesTitle, { color: colors.text }]}>{s.title}</Text>
                    <Text style={[styles.seriesGenre, { color: colors.muted }]}>{s.genre}</Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{s.status}</Text>
                  </View>
                </View>
                <View style={styles.seriesMeta}>
                  <View style={styles.seriesMetaItem}>
                    <Ionicons name="book-outline" size={11} color={colors.muted} />
                    <Text style={[styles.seriesMetaText, { color: colors.muted }]}>{s.chapters} chapters</Text>
                  </View>
                  <View style={styles.seriesMetaItem}>
                    <Ionicons name="eye-outline" size={11} color={colors.muted} />
                    <Text style={[styles.seriesMetaText, { color: colors.muted }]}>{s.reads} reads</Text>
                  </View>
                  <View style={styles.seriesMetaItem}>
                    <Ionicons name="time-outline" size={11} color={colors.muted} />
                    <Text style={[styles.seriesMetaText, { color: colors.muted }]}>{s.updated}</Text>
                  </View>
                </View>
                <View style={[styles.seriesActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={styles.seriesActionBtn} onPress={() => openAddChapter(s)}>
                    <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                    <Text style={styles.seriesActionText}>{t('creator.addChapter')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.seriesActionBtn}
                    onPress={() => navigation.navigate('Reader', { creatorSeriesId: s.id, title: s.title })}>
                    <Ionicons name="book-outline" size={14} color="#EF9F27" />
                    <Text style={[styles.seriesActionText, { color: '#EF9F27' }]}>{t('creator.readLabel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.seriesActionBtn}
                    onPress={() => showAppAlert(
                      `${s.title}`,
                      `Chapters: ${s.chapters || 0}\nTotal reads: ${(s.reads || 0).toLocaleString()}\nLast updated: ${s.updated || 'recently'}`,
                      [{ text: 'OK' }]
                    )}>
                    <Ionicons name="analytics-outline" size={14} color="#1D9E75" />
                    <Text style={[styles.seriesActionText, { color: '#1D9E75' }]}>{t('creator.analytics')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Monetization */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.monetizationCard}
            activeOpacity={0.82}
            onPress={() => showAppAlert(
              'Monetization',
              t('creator.monetizationSoon'),
              [{ text: 'Got it' }]
            )}>
            <View style={styles.monetizationIcon}>
              <Ionicons name="diamond" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.monetizationTitle, { color: colors.text }]}>{t('creator.enableMonetization')}</Text>
              <Text style={[styles.monetizationSub, { color: colors.muted }]}>{t('creator.monetizationTagline')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>

      {/* ── New Series Upload sheet ── */}
      <Modal visible={showUpload} animationType="slide" transparent onRequestClose={() => setShowUpload(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowUpload(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('creator.newSeries')}</Text>
              <TouchableOpacity hitSlop={HIT_SLOP} onPress={() => setShowUpload(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {uploadDone ? (
              <View style={styles.successWrap}>
                <Ionicons name="checkmark-circle" size={40} color="#1D9E75" />
                <Text style={styles.successText}>{t('creator.seriesCreated')}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.fieldWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="text" size={14} color={colors.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={t('placeholder.seriesTitle')}
                    placeholderTextColor={colors.muted}
                    value={title}
                    onChangeText={setTitle}
                  
                    accessibilityLabel={t('placeholder.seriesTitle')}/>
                </View>

                <TouchableOpacity
                  style={[styles.fieldWrap, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowGenrePicker(true)}
                  activeOpacity={0.7}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.muted} style={{ marginRight: 8 }} />
                  <Text style={[styles.input, { color: genre ? colors.text : colors.muted, paddingVertical: 14 }]}>
                    {genre || 'Select genre'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.muted} />
                </TouchableOpacity>

                <View style={[styles.fieldWrap, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'flex-start', paddingVertical: 10 }]}>
                  <Ionicons name="document-text-outline" size={14} color={colors.muted} style={{ marginRight: 8, marginTop: 2 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text, minHeight: 60 }]}
                    placeholder="Short description..."
                    placeholderTextColor={colors.muted}
                    multiline
                    value={description}
                    onChangeText={setDescription}
                  
                    accessibilityLabel={t('a11y.seriesDescription')}/>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (!title || !genre || uploading) && styles.submitBtnDisabled]}
                  onPress={handleUpload}
                  disabled={!title || !genre || uploading}>
                  {uploading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                        <Text style={styles.submitBtnText}>{t('creator.createSeries')}</Text>
                      </>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Chapter sheet ── */}
      <Modal visible={!!addChapterSeries} animationType="slide" transparent onRequestClose={closeChapterSheet}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={closeChapterSheet}>
          <View style={[styles.sheet, { backgroundColor: colors.card, maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  Chapter {(addChapterSeries?.chapters || 0) + 1}
                </Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]} numberOfLines={1}>
                  {addChapterSeries?.title}
                </Text>
              </View>
              <TouchableOpacity hitSlop={HIT_SLOP} onPress={closeChapterSheet} disabled={uploadingChapter} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {chapterDone ? (
              <View style={styles.successWrap}>
                <Ionicons name="checkmark-circle" size={44} color="#1D9E75" />
                <Text style={styles.successText}>{t('creator.chapterUploaded')}</Text>
                <Text style={[styles.successSub, { color: colors.muted }]}>
                  {chapterPages.length} pages published
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {/* Chapter title (optional) */}
                <View style={[styles.fieldWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="text" size={14} color={colors.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={`Chapter ${(addChapterSeries?.chapters || 0) + 1} title (optional)`}
                    placeholderTextColor={colors.muted}
                    value={chapterTitle}
                    onChangeText={setChapterTitle}
                  
                    accessibilityLabel={t('a11y.chapterNumber')}/>
                </View>

                {/* Page picker */}
                <TouchableOpacity
                  style={[styles.pagePickerBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={pickPages}
                  activeOpacity={0.8}>
                  <Ionicons name="images-outline" size={20} color={colors.primary} />
                  <Text style={styles.pagePickerText}>
                    {chapterPages.length === 0 ? 'Select pages (images)' : `${chapterPages.length} pages selected — add more`}
                  </Text>
                </TouchableOpacity>

                {/* Page thumbnails */}
                {chapterPages.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={styles.thumbRow}>
                      {chapterPages.map((page, i) => (
                        <View key={page.uri} style={styles.thumbWrap}>
                          <Image source={{ uri: page.uri }} style={styles.thumb} resizeMode="cover" />
                          <Text style={styles.thumbLabel}>{i + 1}</Text>
                          <TouchableOpacity hitSlop={HIT_SLOP} style={styles.thumbRemove} onPress={() => removePage(i)} accessibilityRole="button" accessibilityLabel={t('a11y.removePage')}>
                            <Ionicons name="close-circle" size={18} color="#FF3B30" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Page pacing — the gutter between pages in the reader. */}
                <Text style={[styles.gapSectionLabel, { color: colors.muted }]}>{t('creator.pageSpacing')}</Text>
                <View style={styles.gapRow}>
                  {[
                    { v: 0,  label: 'Flush',     hint: 'Continuous art' },
                    { v: 12, label: 'Standard',  hint: 'Normal pacing' },
                    { v: 40, label: 'Breath',    hint: 'Emotional beats' },
                    { v: 96, label: 'Cliffhang', hint: 'Big pause' },
                  ].map((opt) => {
                    const active = pageGap === opt.v;
                    return (
                      <TouchableOpacity
                        key={opt.v}
                        style={[styles.gapOpt, { borderColor: active ? colors.primary : colors.border,
                                                 backgroundColor: active ? colors.primary + '22' : 'transparent' }]}
                        onPress={() => setPageGap(opt.v)}
                        accessibilityRole="radio"
                        accessibilityLabel={`${opt.label} page spacing — ${opt.hint}`}
                        accessibilityState={{ selected: active, checked: active }}>
                        <Text style={[styles.gapOptLabel, { color: active ? colors.primary : colors.text }]}>{opt.label}</Text>
                        <Text style={[styles.gapOptHint, { color: colors.muted }]}>{opt.hint}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Upload progress */}
                {uploadingChapter && (
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${Math.round(chapterProgress * 100)}%` }]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.muted }]}>
                      Uploading {Math.round(chapterProgress * 100)}%…
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, (chapterPages.length === 0 || uploadingChapter) && styles.submitBtnDisabled, { marginTop: 8 }]}
                  onPress={handleUploadChapter}
                  disabled={chapterPages.length === 0 || uploadingChapter}>
                  {uploadingChapter
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                        <Text style={styles.submitBtnText}>
                          Upload {chapterPages.length > 0 ? `${chapterPages.length} Page${chapterPages.length > 1 ? 's' : ''}` : 'Chapter'}
                        </Text>
                      </>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <PickerSheet
        visible={showGenrePicker}
        onClose={() => setShowGenrePicker(false)}
        title="Select Genre"
        options={GENRES}
        value={genre}
        onSelect={setGenre}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },

  proBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(120, 88, 255,0.15)', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  proBadgeText: { color: '#7858FF', fontSize: 11, fontWeight: '600', marginLeft: 4, paddingRight: 2 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1 },
  statValue: { fontSize: 18, fontWeight: 'bold', marginTop: 6, marginBottom: 2 },
  statLabel: { fontSize: 9, textAlign: 'center' },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderWidth: 1, borderColor: 'rgba(120, 88, 255,0.4)', borderRadius: 16, padding: 16, marginBottom: 24 },
  uploadIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7858FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  uploadTitle: { fontSize: 14, fontWeight: '600' },
  uploadSub: { fontSize: 11, marginTop: 2 },

  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  seriesCount: { fontSize: 11 },

  analyticsCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  analyticsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  analyticsMainVal: { fontSize: 24, fontWeight: 'bold' },
  analyticsMainLabel: { fontSize: 11, marginTop: 2 },
  chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 4, marginBottom: 4 },
  barLabel: { color: '#9B9AA3', fontSize: 8 },

  seriesCard: { borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1 },
  seriesTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  seriesTitle: { fontSize: 14, fontWeight: '600' },
  seriesGenre: { fontSize: 11, marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '600', paddingRight: 2 },
  seriesMeta: { flexDirection: 'row', marginBottom: 12 },
  seriesMetaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  seriesMetaText: { fontSize: 10, marginLeft: 4 },
  seriesActions: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 10 },
  seriesActionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  seriesActionText: { color: '#7858FF', fontSize: 12, fontWeight: '500', marginLeft: 4 },

  monetizationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(120, 88, 255,0.06)', borderWidth: 1, borderColor: 'rgba(120, 88, 255,0.25)', borderRadius: 16, padding: 16 },
  monetizationIcon: { backgroundColor: 'rgba(120, 88, 255,0.15)', borderRadius: 20, padding: 10, marginRight: 14 },
  monetizationTitle: { fontSize: 14, fontWeight: '600' },
  monetizationSub: { fontSize: 11, marginTop: 3 },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold' },
  sheetSub: { fontSize: 12, marginTop: 2 },

  fieldWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  input: { flex: 1, paddingVertical: 14, fontSize: 14 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7858FF', borderRadius: 12, padding: 16, gap: 8 },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  successWrap: { alignItems: 'center', paddingVertical: 32 },
  successText: { color: '#1D9E75', fontSize: 16, fontWeight: '700', marginTop: 12 },
  successSub: { fontSize: 13, marginTop: 6 },

  // Chapter page picker
  pagePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 16, marginBottom: 14 },
  pagePickerText: { color: '#7858FF', fontSize: 13, fontWeight: '600', flex: 1 },

  gapSectionLabel: { fontSize: 11, fontWeight: '600', marginBottom: 7, letterSpacing: 0.2 },
  gapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  gapOpt: { flexGrow: 1, minWidth: 74, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  gapOptLabel: { fontSize: 12.5, fontWeight: '700' },
  gapOptHint: { fontSize: 9.5, marginTop: 1 },
  thumbRow: { flexDirection: 'row', paddingBottom: 4 },
  thumbWrap: { width: 72, height: 96, borderRadius: 8, overflow: 'visible', marginRight: 10, position: 'relative' },
  thumb: { width: 72, height: 96, borderRadius: 8, backgroundColor: '#1A1A1F' },
  thumbLabel: { position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  thumbRemove: { position: 'absolute', top: -6, right: -6 },

  progressWrap: { marginBottom: 14 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#7858FF' },
  progressText: { fontSize: 12, textAlign: 'center' },
});
