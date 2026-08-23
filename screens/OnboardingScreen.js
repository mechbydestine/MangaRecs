import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { signInWithGoogle } from '../utils/googleAuth';
import { ensureGuestSession } from '../utils/guestSession';
import { GENRES as GENRE_OPTIONS } from '../utils/genres';
import { useKeyboardPadding } from '../utils/keyboard';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useUsernameAvailability, UsernameStatusIcon } from './AuthScreen';
import { GoogleButton, AuthDivider } from '../components/AuthButtons';
import StarLogo from '../components/StarLogo';
import { useResponsive } from '../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function SignUpGate({ onDone, onBrowse, browsing }) {
  const { colors } = useTheme();

  const insets = useSafeAreaInsets();
  const t = useT();
  const [mode, setMode] = useState('prompt');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      onDone();
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleRegister() {
    setError('');
    if (!email || !password) {
      setError('Please enter your email and a password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    onDone();
  }

  if (mode === 'form') {
    return (
      <View style={styles.screenPad}>
        <Text style={[styles.headline, { color: colors.text }]}>{t('onboarding.createYourAccount')}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('onboarding.saveProgressDesc')}</Text>

        <GoogleButton onPress={handleGoogle} loading={googleLoading} />
        <AuthDivider />

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

        <View style={[styles.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="mail-outline" size={16} color={colors.textSecondary} style={styles.fieldIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          
            accessibilityLabel={t('placeholder.email')}/>
        </View>
        <View style={[styles.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} style={styles.fieldIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder={t('placeholder.createPassword')}
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={passwordHidden}
          
            accessibilityLabel={t('placeholder.createPassword')}/>
          <TouchableOpacity
            onPress={() => setPasswordHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={passwordHidden ? 'Show password' : 'Hide password'}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={passwordHidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: colors.primary }, loading && styles.ctaBtnDisabled]}
          onPress={handleRegister}
          accessibilityRole="button"
          accessibilityLabel={t('auth.createAccount')}
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.ctaBtnText, { color: colors.onPrimary }]}>{t('onboarding.createAccount')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode('prompt')}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Text style={[styles.backLink, { color: colors.textSecondary }]}>{t('onboarding.backLink')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screenPad, { alignItems: 'center' }]}>
      <View style={[styles.gateOrb, { backgroundColor: colors.primary }]}>
        <Ionicons name="sparkles" size={32} color={colors.onPrimary} />
      </View>

      <Text style={[styles.headline, { color: colors.text, textAlign: 'center' }]}>{t('onboarding.saveJourney')}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary, textAlign: 'center' }]}>{t('onboarding.signUpPitch')}</Text>

      <View style={styles.gateFeatureList}>
        {[
          t('onboarding.benefitSync'),
          t('onboarding.benefitRecs'),
          t('onboarding.benefitFriends'),
          t('onboarding.benefitBadges'),
        ].map((f) => (
          <View key={f} style={styles.gateFeatureRow}>
            <View style={[styles.gateFeatureCheck, { backgroundColor: colors.accent + '33' }]}>
              <Ionicons name="checkmark" size={10} color={colors.accent} />
            </View>
            <Text style={[styles.gateFeatureText, { color: colors.textSecondary }]}>{f}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
        onPress={() => setMode('form')}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.signUpFree')}>
        <Text style={[styles.ctaBtnText, { color: colors.onPrimary }]}>{t('onboarding.signUpFree')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
      </TouchableOpacity>
      {/* "Skip for now, explore first" used to just jump to the genre picker —
          it skipped the signup FORM, not onboarding, so nobody could actually
          reach a chapter without finishing setup first. These are now two
          honest, separate choices. */}
      <TouchableOpacity
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.tasteFirstBtn')}>
        <Text style={[styles.skipText, { color: colors.textSecondary }]}>{t('onboarding.tasteFirstBtn')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onBrowse}
        disabled={browsing}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.startWithoutAccount')}
        accessibilityState={{ disabled: !!browsing, busy: !!browsing }}>
        <Text style={[styles.skipText, { color: colors.primary, fontWeight: '600' }]}>
          {browsing ? 'Opening…' : 'Start reading — no account'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const VIBES = [
  { id: 'dark',  label: 'Dark & Intense', emoji: '⚔️', boost: ['Action', 'Horror', 'Thriller'] },
  { id: 'light', label: 'Light & Fun',    emoji: '🌸', boost: ['Comedy', 'Romance', 'Slice of Life'] },
  { id: 'mix',   label: 'Mix of Both',    emoji: '✨', boost: [] },
];

function ScreenGenreVibe({ selected, onToggle, vibe, onVibe }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={styles.screenPad}>
      <Text style={[styles.headline, { color: colors.text }]}>{t('onboarding.whatDoYouLove')}</Text>
      <Text style={[styles.highlightText, { color: colors.primary }]}>{t('onboarding.pick3Genres')}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('onboarding.tailorDesc')}</Text>

      <View style={styles.genreGrid}>
        {GENRE_OPTIONS.map((g) => {
          const active = selected.includes(g.label);
          const maxed = selected.length >= 3 && !active;
          return (
            <TouchableOpacity
              key={g.label}
              onPress={() => !maxed && onToggle(g.label)}
              accessibilityRole="checkbox"
              accessibilityLabel={g.label}
              accessibilityHint={maxed ? 'Deselect another genre first — 3 is the maximum' : undefined}
              accessibilityState={{ checked: active, disabled: maxed }}
              disabled={maxed}
              style={[
                styles.genreBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
                active && { borderColor: colors.primary, backgroundColor: colors.primary + '26' },
                maxed && styles.genreBtnMaxed,
              ]}>
              <Ionicons name={active ? (g.iconActive || g.icon) : g.icon} size={17} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.genreLabel, { color: active ? colors.text : colors.textSecondary }]}>{g.label}</Text>
              {active && <Ionicons name="checkmark" size={14} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.genreCount, { color: colors.textSecondary }]}>
        {selected.length}/3 selected{selected.length === 3 ? '  ✓ Perfect!' : ''}
      </Text>

      <Text style={[styles.vibeLabel, { color: colors.textSecondary }]}>{t('onboarding.whatsYourVibe')}</Text>
      <View style={styles.vibeRow}>
        {VIBES.map((v) => {
          const active = vibe === v.id;
          return (
            <TouchableOpacity
              key={v.id}
              onPress={() => onVibe(v.id)}
              accessibilityRole="radio"
              accessibilityLabel={v.label}
              accessibilityState={{ selected: active, checked: active }}
              style={[
                styles.vibePill,
                { borderColor: colors.border, backgroundColor: colors.card },
                active && { borderColor: colors.primary, backgroundColor: colors.primary + '26' },
              ]}>
              <Text style={styles.vibeEmoji}>{v.emoji}</Text>
              <Text style={[styles.vibePillLabel, { color: active ? colors.text : colors.textSecondary }]}>{v.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ScreenUsername({ username, onChange, status }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={styles.screenPad}>
      <View style={[styles.gateOrb, { backgroundColor: colors.primary }]}>
        <Text style={{ color: colors.onPrimary, fontSize: 22, fontWeight: 'bold' }}>@</Text>
      </View>
      <Text style={[styles.headline, { color: colors.text }]}>{t('onboarding.whatToCallYou')}</Text>
      <Text style={[styles.highlightText, { color: colors.primary }]}>{t('onboarding.chooseUsername')}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('onboarding.usernameDesc')}</Text>

      <View style={[
        styles.usernameWrap,
        { backgroundColor: colors.card, borderColor: colors.border },
        status === 'available' && { borderColor: 'rgba(29,158,117,0.6)' },
        status === 'taken' && { borderColor: 'rgba(255,69,58,0.6)' },
      ]}>
        <Text style={[styles.usernameAt, { color: colors.textSecondary }]}>@</Text>
        <TextInput
          style={[styles.usernameInput, { color: colors.text }]}
          placeholder="yourname"
          placeholderTextColor={colors.textSecondary}
          value={username}
          onChangeText={(v) => onChange(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
        
          accessibilityLabel={t('placeholder.username')}/>
        <UsernameStatusIcon status={status} />
      </View>
      {status === 'available' && <Text style={[styles.usernamePreview, { color: colors.accent }]}>@{username} is available — looks great!</Text>}
      {status === 'taken' && <Text style={[styles.usernamePreview, { color: colors.error }]}>@{username} is already taken — try another.</Text>}
      {status === 'invalid' && <Text style={[styles.usernamePreview, { color: colors.textSecondary }]}>{t('onboarding.usernameTooShort')}</Text>}
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('onboarding.usernamePermanent')}</Text>
    </View>
  );
}

export default function OnboardingScreen({ onComplete }) {
  const { colors } = useTheme();
  const t = useT();
  // Used by both return branches below for the safe-area padding. It was only
  // ever declared inside SignUpGate, a sibling component, so reaching either
  // of those returns threw a ReferenceError.
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(-1);
  const [genres, setGenres] = useState([]);
  const [vibe, setVibe] = useState('mix');
  const [username, setUsername] = useState('');
  const [finishing, setFinishing] = useState(false);

  const keyboardPadding = useKeyboardPadding();
  const usernameStatus = useUsernameAvailability(step === 1 ? username : '');
  const { isTablet } = useResponsive();

  const totalSteps = 2; // 0: genres + vibe, 1: username — the sign-up gate (-1) has no dots

  function toggleGenre(g) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : prev.length < 3 ? [...prev, g] : prev));
  }

  function canProceed() {
    if (step === 0) return genres.length === 3;
    if (step === 1) {
      if (username.trim().length === 0) return true; // empty = skip (already has a handle)
      return username.trim().length >= 2 && usernameStatus !== 'taken' && usernameStatus !== 'checking';
    }
    return true;
  }

  // Used by both the "Continue"/"Start Reading" CTA and the top-bar Skip —
  // skipping now finishes with whatever's already been picked instead of
  // discarding it, so a genre pick made just before tapping Skip still saves.
  async function finishOnboarding() {
    setFinishing(true);
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');

      const initialWeights = {};
      genres.forEach((g) => { initialWeights[g] = 10; });
      const selectedVibe = VIBES.find((v) => v.id === vibe);
      if (selectedVibe?.boost?.length) {
        selectedVibe.boost.forEach((g) => { initialWeights[g] = (initialWeights[g] || 0) + 5; });
      }
      if (Object.keys(initialWeights).length > 0) {
        await AsyncStorage.setItem('@mangarecs_genre_prefs', JSON.stringify(initialWeights));
      }

      await ensureGuestSession();
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        if (username.trim()) {
          await supabase.rpc('claim_username', { new_username: username.trim() });
        }
        const profileUpdates = {};
        if (genres.length > 0) profileUpdates.favorite_genre = genres[0];
        if (vibe) profileUpdates.reading_vibe = vibe;
        if (Object.keys(profileUpdates).length > 0) {
          await supabase.from('profiles').update(profileUpdates).eq('id', data.user.id);
        }
        // Seed the table the real recommendation engine reads
        // (get_personalized_feed → user_genre_preferences) directly, instead
        // of only profiles.genre_weights — that field is a legacy fallback
        // that stops being consulted the moment any row exists here, which
        // silently discarded onboarding's weighting the instant a user liked
        // or disliked anything anywhere else in the app.
        await Promise.all(Object.entries(initialWeights).map(([genre, delta]) =>
          supabase.rpc('upsert_genre_weight', { p_user_id: data.user.id, p_genre: genre, p_delta: delta }).catch(() => {})
        ));
      }
    } catch (e) {
      // best-effort sync; never block the user from entering the app
    }
    setFinishing(false);
    onComplete();
  }

  function handleNext() {
    if (step < 1) setStep((s) => s + 1);
    else finishOnboarding();
  }

  function ctaLabel() {
    if (finishing) return null;
    if (step === 1) return 'Start Reading';
    return 'Continue';
  }

  if (step === -1) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <StarLogo size={22} />
            <Text style={[styles.logo, { color: colors.primary }]}>MangaRecs</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardPadding }}
          keyboardShouldPersistTaps="handled">
          <View style={isTablet ? styles.tabletWrap : null}>
            <SignUpGate onDone={() => setStep(0)} onBrowse={finishOnboarding} browsing={finishing} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <StarLogo size={22} />
          <Text style={[styles.logo, { color: colors.primary }]}>MangaRecs</Text>
        </View>
        <TouchableOpacity
          onPress={finishOnboarding}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.skipSetup')}
          accessibilityState={{ disabled: finishing, busy: finishing }}
          disabled={finishing}>
          <Text style={[styles.skipText, { color: colors.textSecondary, marginTop: 0 }]}>{t('common.skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* The dots are decorative individually — announce the row once as progress
          so a screen reader says "step 1 of 2" instead of nothing at all. */}
      <View
        style={styles.dotsRow}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('a11y.stepOf', { n: step + 1, total: totalSteps })}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const active = i === step;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: active ? colors.primary : colors.textSecondary, opacity: i <= step ? 1 : 0.3 },
                active && styles.dotActive,
              ]}
            />
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardPadding }}
        keyboardShouldPersistTaps="handled">
        <View style={isTablet ? styles.tabletWrap : null}>
          {step === 0 && <ScreenGenreVibe selected={genres} onToggle={toggleGenre} vibe={vibe} onVibe={setVibe} />}
          {step === 1 && <ScreenUsername username={username} onChange={setUsername} status={usernameStatus} />}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, isTablet && styles.tabletWrap]}>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: colors.primary }, (!canProceed() || finishing) && styles.ctaBtnDisabled]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel()}
          accessibilityState={{ disabled: !canProceed() || finishing, busy: finishing }}
          disabled={!canProceed() || finishing}>
          {finishing ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Text style={[styles.ctaBtnText, { color: colors.onPrimary }]}>{ctaLabel()}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
        {step > 0 && (
          <TouchableOpacity
            onPress={() => setStep((s) => s - 1)}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}>
            <Text style={[styles.backLink, { color: colors.textSecondary }]}>{t('onboarding.backLink')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  skipText: { fontSize: 12, textAlign: 'center', marginTop: 12 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 24 },
  screenPad: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  headline: { fontSize: 32, fontWeight: '800', marginBottom: 8, lineHeight: 37, letterSpacing: -0.3 },
  highlightText: { fontSize: 13, fontWeight: '600', marginBottom: 6, lineHeight: 18 },
  sub: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  backLink: { fontSize: 12, textAlign: 'center', marginTop: 12 },

  gateOrb: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  gateFeatureList: { width: '100%', marginVertical: 16, gap: 10 },
  gateFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gateFeatureCheck: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  gateFeatureText: { fontSize: 12 },

  fieldWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  fieldIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontSize: 14 },
  errorText: { fontSize: 12, marginBottom: 12 },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16, gap: 10 },
  genreBtn: {
    width: '47%', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, marginBottom: 4,
  },
  genreBtnMaxed: { opacity: 0.4 },
  genreLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  genreCount: { fontSize: 12, textAlign: 'center', marginTop: 16 },

  vibeLabel: { fontSize: 12, fontWeight: '600', marginTop: 22, marginBottom: 10 },
  vibeRow: { flexDirection: 'row', gap: 8 },
  vibePill: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1,
  },
  vibeEmoji: { fontSize: 20 },
  vibePillLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  usernameWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 16,
    marginTop: 20, marginBottom: 12,
  },
  usernameAt: { fontSize: 16, fontWeight: '600', marginRight: 6 },
  usernameInput: { flex: 1, paddingVertical: 16, fontSize: 16 },
  usernamePreview: { fontSize: 12, marginBottom: 12 },
});
