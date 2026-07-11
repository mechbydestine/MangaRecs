import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Modal, Animated, Alert, ActivityIndicator, Image, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { useProfile } from '../utils/ProfileContext';
import { useTheme } from '../utils/ThemeContext';
import MobileHeader from '../components/MobileHeader';
import { ALL_SUPPORTED_SITES } from '../utils/mangaSearch';
import { getFaviconUrl, AI_REC_KEY, clearAllCoversCache, NSFW_KEY, invalidateNsfwCache } from '../utils/mangaCovers';
import AgeGateModal, { AGE_VERIFIED_KEY } from '../components/AgeGateModal';
import { clearBadgeCache } from '../utils/badgeEngine';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { CHANGELOG } from '../utils/changelog';
import { useResponsive } from '../utils/responsive';

const NOTIFS_KEY      = '@mangarecs/notifPrefs';
const READER_MODE_KEY = '@mangarecs/readerMode';
const PAGE_ANIM_KEY   = '@mangarecs/pageAnim';
const APP_VERSION     = Constants.expoConfig?.version || '1.0.0';

function WebtoonIcon({ active }) {
  const arrowY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(arrowY, { toValue: 3, duration: 600, useNativeDriver: true }),
          Animated.timing(arrowY, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      arrowY.setValue(0);
    }
  }, [active]);
  return (
    <View style={[iconStyles.webtoonBox, { borderColor: active ? '#7B5CFF' : '#5C5B63' }]}>
      <Animated.View style={{ transform: [{ translateY: arrowY }] }}>
        <View style={[iconStyles.triangleDown, { borderTopColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      </Animated.View>
    </View>
  );
}

function MangaIcon({ active }) {
  const arrowX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(arrowX, { toValue: 3, duration: 600, useNativeDriver: true }),
          Animated.timing(arrowX, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      arrowX.setValue(0);
    }
  }, [active]);
  return (
    <View style={iconStyles.mangaRow}>
      <View style={[iconStyles.mangaBox, { borderColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
        <View style={[iconStyles.triangleRight, { borderLeftColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      </Animated.View>
    </View>
  );
}

function SlideIcon({ active }) {
  const x = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(x, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.delay(500),
          Animated.timing(x, { toValue: 8, duration: 1, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [active]);
  return (
    <View style={[iconStyles.animPreviewBox, { overflow: 'hidden' }]}>
      <Animated.View
        style={[
          iconStyles.animPreviewInner,
          { transform: [{ translateX: x }], borderColor: active ? '#7B5CFF' : '#5C5B63', backgroundColor: active ? 'rgba(123,92,255,0.2)' : 'rgba(155,154,163,0.1)' },
        ]}
      />
    </View>
  );
}

function FadeIcon({ active }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 750, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        ])
      ).start();
    } else {
      opacity.setValue(1);
    }
  }, [active]);
  return (
    <Animated.View
      style={[
        iconStyles.animPreviewBox,
        { opacity, borderColor: active ? '#7B5CFF' : '#5C5B63', backgroundColor: active ? 'rgba(123,92,255,0.2)' : 'rgba(155,154,163,0.1)' },
      ]}
    />
  );
}

function NoneIcon({ active }) {
  return (
    <View style={[iconStyles.animPreviewBox, { alignItems: 'center', justifyContent: 'center', borderColor: active ? '#7B5CFF' : '#5C5B63', backgroundColor: active ? 'rgba(123,92,255,0.2)' : 'rgba(155,154,163,0.1)' }]}>
      <View style={{ width: 12, height: 1, backgroundColor: active ? '#7B5CFF' : '#5C5B63' }} />
    </View>
  );
}


const THEMES = [
  { id: 'light', label: 'Light', icon: 'sunny' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'desktop' },
];

const READER_MODES = [
  { id: 'webtoon', label: 'Webtoon', desc: 'Scroll down', Icon: WebtoonIcon },
  { id: 'manga', label: 'Manga', desc: 'Tap sides', Icon: MangaIcon },
];

const PAGE_ANIMS = [
  { id: 'slide', label: 'Slide', Icon: SlideIcon },
  { id: 'fade', label: 'Fade', Icon: FadeIcon },
  { id: 'none', label: 'None', Icon: NoneIcon },
];

function SectionCard({ title, icon, children }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={15} color="#7B5CFF" />
        <Text style={[styles.cardHeaderTitle, { color: colors.muted }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function SettingsRow({ icon, label, desc, onPress }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} activeOpacity={0.6}>
      {icon && <Ionicons name={icon} size={16} color={colors.muted} style={{ marginRight: 12 }} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
        {desc && <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>{desc}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={14} color="rgba(155,154,163,0.4)" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  const { theme, setTheme, colors } = useTheme();
  const { profile, updateProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();

  const [displayName, setDisplayName] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [displayNameSaved, setDisplayNameSaved] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // Sync display name and tracker usernames from Supabase profile. The
  // @handle (profile.username) is permanent and set at signup — it's shown
  // read-only below, never edited here.
  useEffect(() => {
    const name = profile?.display_name || profile?.username;
    if (name) {
      setDisplayName(name);
      setDisplayNameDraft(name);
    }
    if (profile?.mal_username) setMalUsername(profile.mal_username);
    if (profile?.anilist_username) setAnilistUsername(profile.anilist_username);
  }, [profile?.display_name, profile?.username, profile?.mal_username, profile?.anilist_username]);


  const [readerMode, setReaderMode] = useState('webtoon');
  const [pageAnim, setPageAnim] = useState('slide');

  const [aiRec, setAiRecState] = useState(true);
  const [notifs, setNotifs] = useState({ newChapter: true, friendActivity: true, recommendations: false, comments: true, directMessages: true });
  const [malUsername, setMalUsername] = useState('');
  const [anilistUsername, setAnilistUsername] = useState('');
  const [trackerSaved, setTrackerSaved] = useState(false);
  const [allowNsfw, setAllowNsfwState] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);

  const [cacheCleared, setCacheCleared] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [maxBilling, setMaxBilling] = useState('monthly');

  useEffect(() => {
    AsyncStorage.multiGet([AI_REC_KEY, NOTIFS_KEY, READER_MODE_KEY, PAGE_ANIM_KEY, '@mangarecs/mal_username', '@mangarecs/anilist_username', AGE_VERIFIED_KEY, NSFW_KEY]).then(([[, aiRecRaw], [, notifsRaw], [, savedMode], [, savedAnim], [, malRaw], [, anilistRaw], [, ageRaw], [, nsfwRaw]]) => {
      if (aiRecRaw !== null) setAiRecState(aiRecRaw === 'true');
      if (notifsRaw) {
        // Merge onto current defaults, not replace — otherwise a prefs blob
        // saved before "comments"/"directMessages" existed would make those
        // keys undefined (renders as off) instead of defaulting to on.
        try { setNotifs((prev) => ({ ...prev, ...JSON.parse(notifsRaw) })); } catch (_) {}
      }
      if (savedMode) setReaderMode(savedMode);
      if (savedAnim) setPageAnim(savedAnim);
      if (malRaw) setMalUsername(malRaw);
      if (anilistRaw) setAnilistUsername(anilistRaw);
      setAgeVerified(ageRaw === 'true');
      if (nsfwRaw !== null) setAllowNsfwState(nsfwRaw === 'true');
    });
  }, []);

  async function toggleAiRec(value) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAiRecState(value);
    await AsyncStorage.setItem(AI_REC_KEY, value ? 'true' : 'false');
  }

  async function toggleNsfw(value) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAllowNsfwState(value);
    await AsyncStorage.setItem(NSFW_KEY, value ? 'true' : 'false');
    invalidateNsfwCache();
  }

  async function toggleNotif(key) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    await AsyncStorage.setItem(NOTIFS_KEY, JSON.stringify(updated));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        const allOff = Object.values(updated).every((v) => !v);
        const patch = { notification_prefs: updated };
        if (allOff) patch.push_token = null;
        supabase.from('profiles').update(patch).eq('id', session.user.id).then(() => {});
      }
    });
  }

  const showActivity = profile?.show_activity !== false;
  const isBusy = !!profile?.is_busy;

  async function toggleShowActivity(value) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateProfile({ show_activity: value });
  }

  async function toggleBusy(value) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateProfile({ is_busy: value });
  }

  async function handleSaveDisplayName() {
    const trimmed = displayNameDraft.trim();
    if (!trimmed || trimmed.length < 3) {
      setDisplayNameError('Display name must be at least 3 characters.');
      return;
    }
    if (trimmed === displayName) {
      setDisplayNameError("That's already your display name.");
      return;
    }
    setDisplayNameSaving(true);
    setDisplayNameError('');

    const { error } = await updateProfile({ display_name: trimmed });
    setDisplayNameSaving(false);

    if (error) {
      setDisplayNameError('Failed to save. Please try again.');
      return;
    }

    setDisplayName(trimmed);
    setDisplayNameSaved(true);
    setTimeout(() => setDisplayNameSaved(false), 2000);
  }

  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');

  async function handleCheckForUpdate() {
    if (!Updates.isEnabled) {
      setUpdateStatus('Updates disabled in this build (Expo Go / dev client)');
      return;
    }
    setUpdateChecking(true);
    setUpdateStatus('');
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateStatus("You're on the latest version");
        setUpdateChecking(false);
        return;
      }
      setUpdateStatus('Update found — downloading…');
      await Updates.fetchUpdateAsync();
      setUpdateStatus('Downloaded — restarting…');
      await Updates.reloadAsync();
    } catch (e) {
      setUpdateStatus(`Check failed: ${e.message || 'unknown error'}`);
      setUpdateChecking(false);
    }
  }

  async function handleClearCache() {
    clearAllCoversCache();
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const items = await FileSystem.readDirectoryAsync(cacheDir).catch(() => []);
        await Promise.all(items.map((name) => FileSystem.deleteAsync(cacheDir + name, { idempotent: true }).catch(() => {})));
      }
    } catch (_) {}
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    const { error } = await supabase.rpc('delete_user');
    setDeleteLoading(false);
    if (error) {
      Alert.alert('Error', 'Could not delete account. Please contact support.');
      return;
    }
    try { await AsyncStorage.clear(); } catch (_) {}
    await clearBadgeCache();
    await supabase.auth.signOut();
  }

  async function handleExportLibrary() {
    try {
      const [libRaw, histRaw] = await AsyncStorage.multiGet(['@mangarecs_saved', '@mangarecs_reading_history']).then((pairs) => pairs.map(([, v]) => v));
      const lib = libRaw ? JSON.parse(libRaw) : [];
      const hist = histRaw ? JSON.parse(histRaw) : {};
      const libLines = lib.map((s) => `• ${s.title} — Ch. ${s.chapter || 1}`).join('\n') || 'None';
      const histValues = Object.values(hist);
      const histLines = histValues.map((h) => `• ${h.title} — Ch. ${h.chapter || 1}`).join('\n') || 'None';
      const text = `📚 My MangaRecs Library\n\nBookmarked (${lib.length}):\n${libLines}\n\nReading History (${histValues.length}):\n${histLines}`;
      await Share.share({ message: text, title: 'My MangaRecs Library' });
    } catch (_) {}
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileHeader title="Settings" />

      <ScrollView showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        <View style={isTablet ? styles.tabletWrap : null}>

        <SectionCard title="Display name" icon="person-outline">
          <Text style={[styles.cardSub, { color: colors.muted }]}>Shown across MangaRecs — change this anytime</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={displayNameDraft}
              onChangeText={(t) => { setDisplayNameDraft(t); setDisplayNameError(''); }}
              maxLength={24}
              placeholder="Enter display name"
              placeholderTextColor={colors.muted}
            />
            <TouchableOpacity
              style={[styles.smallCta, (displayNameDraft.trim() === displayName || displayNameSaving) && { opacity: 0.4 }]}
              onPress={handleSaveDisplayName}
              disabled={displayNameDraft.trim() === displayName || displayNameSaving}>
              {displayNameSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : displayNameSaved ? (
                <>
                  <Ionicons name="checkmark" size={13} color="#fff" />
                  <Text style={styles.smallCtaText}>Saved</Text>
                </>
              ) : (
                <Text style={styles.smallCtaText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          {!!displayNameError && (
            <View style={styles.warningRow}>
              <Ionicons name="alert-circle-outline" size={12} color="#E24B4A" />
              <Text style={styles.warningTextDanger}>{displayNameError}</Text>
            </View>
          )}
          <View style={[styles.warningRow, { marginTop: displayNameError ? 6 : 10 }]}>
            <Ionicons name="at-outline" size={12} color={colors.muted} />
            <Text style={[styles.cardSub, { color: colors.muted, marginBottom: 0 }]}>
              @{profile?.username} — your permanent handle, set at signup and used to identify you. Can't be changed.
            </Text>
          </View>
        </SectionCard>

        <SectionCard title="Appearance" icon="color-palette-outline">
          <Text style={[styles.cardTitle, { color: colors.text }]}>App Theme</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.themeBtn, { borderColor: colors.border }, theme === t.id && styles.themeBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setTheme(t.id); }}
                activeOpacity={0.8}>
                <Ionicons name={t.icon} size={20} color={theme === t.id ? '#7B5CFF' : colors.muted} />
                <Text style={[styles.themeBtnText, { color: colors.muted }, theme === t.id && styles.themeBtnTextActive]}>{t.label}</Text>
                {theme === t.id && <View style={styles.activeDot} />}
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Reading Sources" icon="globe-outline">
          <Text style={[styles.cardSub, { color: colors.muted, marginBottom: 12 }]}>
            MangaRecs automatically picks the best site based on content type — no setup needed.
          </Text>
          {ALL_SUPPORTED_SITES.map((site) => (
            <View key={site.url} style={[styles.sourceSiteRow, { borderColor: colors.border }]}>
              <Image source={{ uri: getFaviconUrl(site.url) }} style={styles.topSiteFavicon} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.sourceSiteName, { color: colors.text }]}>{site.emoji} {site.name}</Text>
                <Text style={[styles.sourceSiteDesc, { color: colors.muted }]}>{site.desc}</Text>
              </View>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="Content" icon="shield-outline">
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>AI Recommendations</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Personalize your Recs feed using your reading history and genre taste profile. When off, shows popular picks only.</Text>
            </View>
            <Switch
              value={aiRec}
              onValueChange={toggleAiRec}
              trackColor={{ false: colors.border, true: '#7B5CFF' }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.toggleRow, styles.borderTop, { borderColor: colors.border }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Adult Content (18+)</Text>
                {ageVerified && (
                  <View style={{ backgroundColor: 'rgba(123,92,255,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, color: '#7B5CFF', fontWeight: '700' }}>VERIFIED</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>
                {ageVerified
                  ? 'Show 18+ content clearly. When off, mature covers stay blurred throughout the app.'
                  : 'Verify your age to unlock adult content.'}
              </Text>
            </View>
            {ageVerified ? (
              <Switch
                value={allowNsfw}
                onValueChange={toggleNsfw}
                trackColor={{ false: colors.border, true: '#f03f3f' }}
                thumbColor="#fff"
              />
            ) : (
              <TouchableOpacity
                style={{ backgroundColor: '#7B5CFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
                onPress={() => setShowAgeGate(true)}
                activeOpacity={0.8}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Verify Age</Text>
              </TouchableOpacity>
            )}
          </View>
        </SectionCard>

        <AgeGateModal
          visible={showAgeGate}
          onVerified={() => { setAgeVerified(true); setShowAgeGate(false); }}
          onDismiss={() => setShowAgeGate(false)}
        />

        <SectionCard title="Notifications" icon="notifications-outline">
          {[
            { key: 'newChapter', label: 'New chapter alerts', desc: 'Get notified when your series update' },
            { key: 'friendActivity', label: 'Friend activity', desc: 'See what your friends are reading' },
            { key: 'comments', label: 'Comments', desc: 'Get notified when someone comments on your series' },
            { key: 'directMessages', label: 'Direct messages', desc: 'Get notified when a friend sends you a message' },
          ].map((item, i) => (
            <View key={item.key} style={[styles.toggleRow, i > 0 && [styles.borderTop, { borderTopColor: colors.border }]]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{item.label}</Text>
                <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>{item.desc}</Text>
              </View>
              <Switch
                value={notifs[item.key]}
                onValueChange={() => toggleNotif(item.key)}
                trackColor={{ false: colors.border, true: '#7B5CFF' }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </SectionCard>

        <SectionCard title="Status" icon="radio-button-on-outline">
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Show online status</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Let friends see when you're online, idle, or reading</Text>
            </View>
            <Switch
              value={showActivity}
              onValueChange={toggleShowActivity}
              trackColor={{ false: colors.border, true: '#7B5CFF' }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.toggleRow, styles.borderTop, { borderColor: colors.border }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Appear busy</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Shows a red "busy" status to friends, even while online</Text>
            </View>
            <Switch
              value={isBusy}
              onValueChange={toggleBusy}
              trackColor={{ false: colors.border, true: '#E5534B' }}
              thumbColor="#fff"
              disabled={!showActivity}
            />
          </View>
        </SectionCard>

        <SectionCard title="External Trackers" icon="sync-outline">
          <Text style={[styles.cardSub, { color: colors.muted }]}>
            Link your tracker profiles to jump to any series directly from MangaRecs.
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text }]}>MyAnimeList Username</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="your-mal-username"
              placeholderTextColor={colors.muted}
              value={malUsername}
              onChangeText={setMalUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.smallCta, (!malUsername.trim()) && { opacity: 0.35 }]}
              disabled={!malUsername.trim()}
              onPress={() => Linking.openURL(`https://myanimelist.net/profile/${malUsername.trim()}`)}>
              <Ionicons name="open-outline" size={13} color="#fff" />
              <Text style={styles.smallCtaText}>Open</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 12 }]}>AniList Username</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="your-anilist-username"
              placeholderTextColor={colors.muted}
              value={anilistUsername}
              onChangeText={setAnilistUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.smallCta, (!anilistUsername.trim()) && { opacity: 0.35 }]}
              disabled={!anilistUsername.trim()}
              onPress={() => Linking.openURL(`https://anilist.co/user/${anilistUsername.trim()}`)}>
              <Ionicons name="open-outline" size={13} color="#fff" />
              <Text style={styles.smallCtaText}>Open</Text>
            </TouchableOpacity>
          </View>
          {(malUsername.trim() || anilistUsername.trim()) ? (
            <TouchableOpacity
              style={[styles.smallCta, { marginTop: 12, alignSelf: 'flex-end' }]}
              onPress={async () => {
                const mal = malUsername.trim();
                const anilist = anilistUsername.trim();
                await AsyncStorage.multiSet([
                  ['@mangarecs/mal_username', mal],
                  ['@mangarecs/anilist_username', anilist],
                ]);
                updateProfile({ mal_username: mal || null, anilist_username: anilist || null });
                setTrackerSaved(true);
                setTimeout(() => setTrackerSaved(false), 1500);
              }}>
              {trackerSaved ? (
                <><Ionicons name="checkmark" size={13} color="#fff" /><Text style={styles.smallCtaText}>Saved</Text></>
              ) : (
                <Text style={styles.smallCtaText}>Save Links</Text>
              )}
            </TouchableOpacity>
          ) : null}
          <View style={[styles.exportRow, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportLibrary} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={15} color="#7B5CFF" />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Export Library</Text>
                <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Share your reading list as text</Text>
              </View>
            </TouchableOpacity>
          </View>
        </SectionCard>

        <SectionCard title="Audio Ambience" icon="musical-notes-outline">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="headset-outline" size={18} color="#7B5CFF" />
            <Text style={[styles.cardSub, { color: colors.muted, flex: 1, marginTop: 0 }]}>
              Ambience controls are inside the Reader. Open any manga, tap the headset icon at the top.
            </Text>
          </View>
        </SectionCard>

        <SectionCard title="Reader" icon="book-outline">
          <Text style={[styles.cardTitle, { color: colors.text }]}>Default mode</Text>
          <View style={styles.readerRow}>
            {READER_MODES.map((mode) => {
              const active = readerMode === mode.id;
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[styles.readerBtn, { borderColor: colors.border }, active && styles.readerBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setReaderMode(mode.id); AsyncStorage.setItem(READER_MODE_KEY, mode.id); }}
                  activeOpacity={0.8}>
                  <mode.Icon active={active} />
                  <Text style={[styles.readerBtnText, { color: colors.muted }, active && styles.readerBtnTextActive]}>{mode.label}</Text>
                  <Text style={styles.readerBtnSub}>{mode.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 18 }]}>Page animation</Text>
          <Text style={[styles.cardSub, { color: colors.muted, marginBottom: 8, marginTop: 0 }]}>Applies in Manga mode only</Text>
          <View style={styles.animRow}>
            {PAGE_ANIMS.map((anim) => {
              const active = pageAnim === anim.id;
              return (
                <TouchableOpacity
                  key={anim.id}
                  style={[styles.animBtn, { borderColor: colors.border }, active && styles.animBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setPageAnim(anim.id); AsyncStorage.setItem(PAGE_ANIM_KEY, anim.id); }}
                  activeOpacity={0.8}>
                  <anim.Icon active={active} />
                  <Text style={[styles.animBtnText, { color: colors.muted }, active && styles.animBtnTextActive]}>{anim.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionCard>

        <TouchableOpacity style={styles.upgradeCard} onPress={() => setShowPlans(true)} activeOpacity={0.85}>
          <View style={styles.upgradeLeft}>
            <Ionicons name="diamond" size={20} color="#7B5CFF" />
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.upgradeTitle, { color: colors.text }]}>Upgrade Plan</Text>
              <Text style={[styles.upgradeSub, { color: colors.muted }]}>Free · Pro · MAX — see what's included</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.muted} />
        </TouchableOpacity>

        <SectionCard title="Storage & Data" icon="trash-outline">
          <View style={styles.cacheRow}>
            <View>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Clear Cache</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Free up locally cached images & chapters</Text>
            </View>
            <TouchableOpacity
              style={[styles.clearBtn, { backgroundColor: colors.border }, cacheCleared && { backgroundColor: 'rgba(29,158,117,0.2)' }]}
              onPress={handleClearCache}>
              <Text style={[styles.clearBtnText, { color: colors.text }, cacheCleared && { color: '#1D9E75' }]}>
                {cacheCleared ? '✓ Cleared' : 'Clear'}
              </Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        <SectionCard title="About" icon="information-circle-outline">
          <SettingsRow icon="help-circle-outline" label="Help & Support" desc="FAQs, contact us, report a bug" onPress={() => Linking.openURL('mailto:support@mangarecs.app?subject=Help%20%26%20Support')} />
          <SettingsRow icon="people-outline" label="Community Guidelines" desc="Read our community standards" onPress={() => navigation.navigate('Guidelines')} />
          <SettingsRow icon="shield-outline" label="Privacy Policy" onPress={() => navigation.navigate('Legal', { tab: 'privacy' })} />
          <SettingsRow icon="document-text-outline" label="Terms of Use" onPress={() => navigation.navigate('Legal', { tab: 'terms' })} />
          <TouchableOpacity
            style={[styles.settingsRow, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={() => setShowChangelog(true)}
            activeOpacity={0.7}>
            <Ionicons name="information-circle-outline" size={16} color={colors.muted} style={{ marginRight: 12 }} />
            <Text style={[styles.settingsRowLabel, { flex: 1, color: colors.text }]}>App Version</Text>
            <Text style={[styles.versionText, { color: colors.muted }]}>v{APP_VERSION}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <View style={[styles.settingsRow, { borderTopWidth: 1, borderTopColor: colors.border, flexWrap: 'wrap' }]}>
            <Ionicons name="cloud-download-outline" size={16} color={colors.muted} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Live Update</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>
                {Updates.isEmbeddedLaunch ? 'Running built-in code' : `Running update ${(Updates.updateId || '').slice(0, 8)}`}
                {Updates.channel ? ` · ${Updates.channel}` : ''}
              </Text>
              {!!updateStatus && <Text style={[styles.settingsRowDesc, { color: colors.muted, marginTop: 2 }]}>{updateStatus}</Text>}
            </View>
            <TouchableOpacity
              style={[styles.smallCta, updateChecking && { opacity: 0.6 }]}
              onPress={handleCheckForUpdate}
              disabled={updateChecking}>
              {updateChecking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallCtaText}>Check Now</Text>}
            </TouchableOpacity>
          </View>
        </SectionCard>

        <SectionCard title="Account" icon="person-circle-outline">
          <View style={styles.cacheRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Delete Account</Text>
              <Text style={[styles.settingsRowDesc, { color: colors.muted }]}>Permanently remove your account and all data</Text>
            </View>
            <TouchableOpacity
              style={[styles.clearBtn, { backgroundColor: 'rgba(139,32,32,0.12)' }]}
              onPress={() => setShowDeleteConfirm(true)}>
              <Text style={[styles.clearBtnText, { color: '#C0392B' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={async () => { await clearBadgeCache(); supabase.auth.signOut(); }}
          activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.signOutText}>Log Out</Text>
        </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ── Delete Account Confirmation ── */}
      <Modal visible={showDeleteConfirm} animationType="fade" transparent onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.deleteIconWrap, { backgroundColor: 'rgba(139,32,32,0.15)' }]}>
              <Ionicons name="warning-outline" size={28} color="#8B2020" />
            </View>
            <Text style={[styles.deleteTitle, { color: colors.text }]}>Delete your account?</Text>
            <Text style={[styles.deleteSub, { color: colors.muted }]}>
              This will permanently delete your MangaRecs account, reading history, badges, friends, and all saved data. This action cannot be undone.
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={[styles.deleteCancelBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowDeleteConfirm(false)}>
                <Text style={[styles.deleteCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={handleDeleteAccount}
                disabled={deleteLoading}>
                <Text style={styles.deleteConfirmText}>{deleteLoading ? 'Deleting...' : 'Yes, delete my account'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPlans} animationType="slide" transparent onRequestClose={() => setShowPlans(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Your Plan</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>Upgrade anytime, cancel anytime</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPlans(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.plansRow}>
              {[
                { id: 'free', icon: 'flash-outline', label: 'Free', price: '$0' },
                { id: 'pro', icon: 'diamond-outline', label: 'Pro', price: '$3.99/mo' },
                { id: 'max', icon: 'sparkles', label: 'MAX', price: maxBilling === 'monthly' ? '$9.99/mo' : '$60/yr', best: true },
              ].map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, { backgroundColor: colors.inputBg, borderColor: colors.border }, selectedPlan === plan.id && styles.planCardActive, plan.best && styles.planCardBest]}
                  onPress={() => setSelectedPlan(plan.id)}>
                  {plan.best && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>BEST VALUE</Text>
                    </View>
                  )}
                  <Ionicons name={plan.icon} size={20} color={selectedPlan === plan.id ? '#7B5CFF' : plan.best ? '#FFD700' : colors.muted} />
                  <Text style={[styles.planLabel, { color: colors.muted }, plan.best && styles.planLabelBest]}>{plan.label}</Text>
                  <Text style={[styles.planPrice, { color: colors.text }, selectedPlan === plan.id && styles.planPriceActive]}>{plan.price}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedPlan === 'max' && (
              <View style={styles.billingRow}>
                <TouchableOpacity
                  style={[styles.billingBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }, maxBilling === 'monthly' && styles.billingBtnActive]}
                  onPress={() => setMaxBilling('monthly')}>
                  <Text style={[styles.billingBtnText, { color: colors.muted }, maxBilling === 'monthly' && styles.billingBtnTextActive]}>$9.99/Mo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.billingBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }, maxBilling === 'yearly' && styles.billingBtnActive]}
                  onPress={() => setMaxBilling('yearly')}>
                  <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>50% OFF</Text></View>
                  <Text style={[styles.billingBtnText, { color: colors.muted }, maxBilling === 'yearly' && styles.billingBtnTextActive]}>$60/Yr</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.whatsIncluded, { color: colors.muted }]}>WHAT'S INCLUDED</Text>
            {selectedPlan === 'free' && [
              'Ad-supported experience',
              'Community access & social features',
              'Audio Ambience (default presets)',
              'Download chapters (30 chapter limit)',
              'Full reading analytics & streak tracking',
              'AI-powered recommendations',
              'Recs page & taste profile',
            ].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark" size={16} color={colors.muted} />
                <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}
            {selectedPlan === 'pro' && [
              'Everything in Free',
              'No ads',
              'Custom Audio Ambience uploads',
              'Early chapter release reminders',
              'Chapter countdown timers',
              'Priority support',
            ].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#7B5CFF" />
                <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}
            {selectedPlan === 'max' && [
              'Everything in Pro',
              'Unlimited chapter downloads',
              'Exclusive MAX badge & profile flair',
              'Beta features & early access',
              'Creator insights & analytics',
              'Offline reading mode',
              'MAX-only community channels',
            ].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#FFD700" />
                <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.ctaBtn, selectedPlan === 'max' && styles.ctaBtnMax]}
              onPress={() => {
                if (selectedPlan !== 'free') {
                  Alert.alert('Coming Soon', 'Paid plans will be available in the next update. Stay tuned!');
                }
              }}>
              <Text style={styles.ctaBtnText}>
                {selectedPlan === 'free' ? "You're on the Free plan" :
                 selectedPlan === 'pro' ? 'Start Free Trial' :
                 `Get MAX — ${maxBilling === 'yearly' ? '$60/yr (Save $60)' : '$9.99/mo'}`}
              </Text>
            </TouchableOpacity>
            {selectedPlan !== 'free' && (
              <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel anytime · No commitment</Text>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showChangelog} animationType="slide" transparent onRequestClose={() => setShowChangelog(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>What's New</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>Updates & bug fixes</Text>
              </View>
              <TouchableOpacity onPress={() => setShowChangelog(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {CHANGELOG.map((entry, i) => (
                <View key={entry.version} style={[styles.changelogEntry, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={styles.changelogEntryHeader}>
                    <Text style={[styles.changelogVersion, { color: colors.text }]}>v{entry.version}</Text>
                    <Text style={[styles.changelogDate, { color: colors.muted }]}>{entry.date}</Text>
                  </View>
                  {entry.highlights.map((h, hi) => (
                    <View key={hi} style={[styles.featureRow, { alignItems: 'flex-start' }]}>
                      <Ionicons name="checkmark-circle" size={16} color="#7B5CFF" style={{ marginTop: 2 }} />
                      <Text style={[styles.featureText, { color: colors.text, flex: 1, flexShrink: 1 }]}>{h}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  webtoonBox: { width: 20, height: 28, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  triangleDown: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  mangaRow: { flexDirection: 'row', alignItems: 'center' },
  mangaBox: { width: 28, height: 20, borderRadius: 4, borderWidth: 2 },
  triangleRight: { width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 5, borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 2 },
  animPreviewBox: { width: 32, height: 24, borderRadius: 6, borderWidth: 1 },
  animPreviewInner: { width: '100%', height: '100%', borderRadius: 6, borderWidth: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  card: { borderRadius: 16, marginBottom: 16, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  cardHeaderTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginLeft: 8, textTransform: 'uppercase' },
  cardBody: { paddingHorizontal: 16, paddingBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  cardSub: { fontSize: 12, marginBottom: 10 },
  urlRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, marginRight: 8 },
  smallCta: { backgroundColor: '#7B5CFF', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  smallCtaText: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4, paddingRight: 2 },
  warningRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  warningTextDanger: { color: '#E24B4A', fontSize: 11, marginLeft: 5 },
  topSiteFavicon: { width: 16, height: 16, borderRadius: 3, backgroundColor: '#2A2A2F' },
  sourceSiteRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  sourceSiteName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  sourceSiteDesc: { fontSize: 11 },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  themeBtn: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: 'rgba(155,154,163,0.06)', marginHorizontal: 4, borderWidth: 1, position: 'relative' },
  themeBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  themeBtnText: { fontSize: 12, fontWeight: '500', marginTop: 8 },
  themeBtnTextActive: { color: '#7B5CFF' },
  activeDot: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#7B5CFF' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  borderTop: { borderTopWidth: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  settingsRowLabel: { fontSize: 13.5, fontWeight: '400' },
  settingsRowDesc: { fontSize: 11, marginTop: 2 },
  versionText: { fontSize: 12, fontFamily: 'monospace' },
  readerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readerBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(155,154,163,0.06)', marginHorizontal: 4, borderWidth: 1 },
  readerBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  readerBtnText: { fontSize: 12, fontWeight: '600', marginTop: 8, paddingHorizontal: 2 },
  readerBtnTextActive: { color: '#7B5CFF' },
  readerBtnSub: { color: 'rgba(155,154,163,0.5)', fontSize: 10, marginTop: 2 },
  animRow: { flexDirection: 'row', justifyContent: 'space-between' },
  animBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(155,154,163,0.06)', marginHorizontal: 4, borderWidth: 1 },
  animBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  animBtnText: { fontSize: 12, fontWeight: '600', marginTop: 8, paddingHorizontal: 2 },
  animBtnTextActive: { color: '#7B5CFF' },
  upgradeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(123,92,255,0.1)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(123,92,255,0.3)' },
  upgradeLeft: { flexDirection: 'row', alignItems: 'center' },
  upgradeTitle: { fontSize: 14, fontWeight: '600' },
  upgradeSub: { fontSize: 11, marginTop: 2 },
  cacheRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  clearBtnText: { fontSize: 12, fontWeight: '500', paddingRight: 2 },
  exportRow: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FF3B30' },
  signOutText: { color: '#FF3B30', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: 24 },
  deleteSheet: { borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'center' },
  deleteIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  deleteTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  deleteSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  deleteActions: { flexDirection: 'row', width: '100%', gap: 10 },
  deleteCancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  deleteCancelText: { fontSize: 14, fontWeight: '600' },
  deleteConfirmBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#8B2020', alignItems: 'center' },
  deleteConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalSub: { fontSize: 13, marginTop: 4 },
  plansRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  planCard: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, marginHorizontal: 4, borderWidth: 1, position: 'relative' },
  planCardActive: { borderColor: '#7B5CFF', backgroundColor: '#1A1633' },
  planCardBest: { borderColor: '#FFD700' },
  bestBadge: { position: 'absolute', top: -10, backgroundColor: '#FFD700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bestBadgeText: { color: '#000', fontSize: 8, fontWeight: 'bold', paddingRight: 2 },
  planLabel: { fontSize: 12, marginTop: 6 },
  planLabelBest: { color: '#FFD700' },
  planPrice: { fontSize: 13, fontWeight: 'bold', marginTop: 4 },
  planPriceActive: { color: '#7B5CFF' },
  billingRow: { flexDirection: 'row', marginBottom: 16 },
  billingBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, marginHorizontal: 4, borderWidth: 1, flexDirection: 'row', justifyContent: 'center' },
  billingBtnActive: { borderColor: '#7B5CFF', backgroundColor: '#1A1633' },
  billingBtnText: { fontSize: 13, fontWeight: '500' },
  billingBtnTextActive: { color: '#7B5CFF' },
  saveBadge: { backgroundColor: '#FFD700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  saveBadgeText: { color: '#000', fontSize: 9, fontWeight: 'bold', paddingRight: 2 },
  whatsIncluded: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featureText: { fontSize: 14, marginLeft: 10 },
  changelogEntry: { paddingTop: 12, paddingBottom: 4 },
  changelogEntryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  changelogVersion: { fontSize: 16, fontWeight: '700' },
  changelogDate: { fontSize: 12 },
  ctaBtn: { backgroundColor: '#7B5CFF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  ctaBtnMax: { backgroundColor: '#FFD700' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelText: { fontSize: 12, textAlign: 'center', marginTop: 10 },
});
