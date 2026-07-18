import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../supabase';
import { signInWithGoogle } from '../utils/googleAuth';
import { signInWithApple } from '../utils/appleAuth';
import { MangaCover } from '../utils/mangaCovers';
import { GENRES as GENRE_OPTIONS } from '../utils/genres';
import { useKeyboardPadding } from '../utils/keyboard';
import { useUsernameAvailability, UsernameStatusIcon } from './AuthScreen';
import { GoogleButton, AppleButton, AuthDivider } from '../components/AuthButtons';
import StarLogo from '../components/StarLogo';
import { useResponsive } from '../utils/responsive';

const ACCENT = '#1D9E75';

const DISCOVER_CARDS = [
  { title: 'Solo Leveling', searchKey: 'Solo Leveling', lang: 'ko', genre: 'Action', color: '#0D1B2A', rating: '4.9' },
  { title: "Frieren: Beyond Journey's End", searchKey: 'Sousou no Frieren', lang: 'ja', genre: 'Fantasy', color: '#0D2230', rating: '4.9' },
  { title: 'Sakamoto Days', searchKey: 'Sakamoto Days', lang: 'ja', genre: 'Action', color: '#2D1A0A', rating: '4.8' },
  { title: 'Dungeon Meshi', searchKey: 'Dungeon Meshi', lang: 'ja', genre: 'Fantasy', color: '#0D1A0D', rating: '4.8' },
  { title: "Omniscient Reader's Viewpoint", lang: 'ko', genre: 'Thriller', color: '#1A0A0A', rating: '4.9' },
];

const DISCOVER_CHIPS = [
  { icon: 'sparkles', label: 'AI Picks' },
  { icon: 'trending-up', label: 'Trending' },
  { icon: 'star', label: 'By Mood' },
];

const ACTIVITY = [
  { user: 'AkiraFan99', avatar: 'A', action: 'started', title: 'Solo Leveling', time: '2m ago' },
  { user: 'LunaReads', avatar: 'L', action: 'reached Chapter 124 of', title: 'Frieren: Beyond Journey\'s End', time: '5m ago' },
  { user: 'MangaQueen', avatar: 'M', action: 'recommends', title: 'Jujutsu Kaisen', time: '12m ago' },
];

const FEATURES = [
  { icon: 'flame', label: 'Streaks' },
  { icon: 'download-outline', label: 'Offline reading' },
  { icon: 'notifications-outline', label: 'New chapter alerts' },
  { icon: 'desktop-outline', label: 'Synced everywhere' },
];


function SignUpGate({ onDone }) {
  const [mode, setMode] = useState('prompt');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

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

  async function handleApple() {
    setAppleLoading(true);
    setError('');
    try {
      await signInWithApple();
      onDone();
    } catch (err) {
      setError(err.message || 'Apple sign-in failed');
    } finally {
      setAppleLoading(false);
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
        <Text style={styles.headline}>Create your account</Text>
        <Text style={styles.sub}>Save your progress, preferences, and library.</Text>

        {appleAvailable && <AppleButton onPress={handleApple} loading={appleLoading} />}
        <GoogleButton onPress={handleGoogle} loading={googleLoading} />
        <AuthDivider />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.fieldWrap}>
          <Ionicons name="mail-outline" size={16} color="#9B9AA3" style={styles.fieldIcon} />
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9B9AA3"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View style={styles.fieldWrap}>
          <Ionicons name="lock-closed-outline" size={16} color="#9B9AA3" style={styles.fieldIcon} />
          <TextInput
            style={styles.input}
            placeholder="Create a password"
            placeholderTextColor="#9B9AA3"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={passwordHidden}
          />
          <TouchableOpacity
            onPress={() => setPasswordHidden((h) => !h)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={passwordHidden ? 'eye-outline' : 'eye-off-outline'} size={18} color="#9B9AA3" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
          onPress={handleRegister}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode('prompt')}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screenPad, { alignItems: 'center' }]}>
      <View style={styles.gateOrb}>
        <Ionicons name="sparkles" size={32} color="#fff" />
      </View>

      <Text style={[styles.headline, { textAlign: 'center' }]}>Save your journey</Text>
      <Text style={[styles.sub, { textAlign: 'center' }]}>
        Sign up to save your reading progress, genre preferences, friends, and library — all synced to your account.
      </Text>

      <View style={styles.gateFeatureList}>
        {[
          'Reading progress synced across devices',
          'Personalized recommendations',
          'Connect with friends',
          'Earn badges & build streaks',
        ].map((f) => (
          <View key={f} style={styles.gateFeatureRow}>
            <View style={styles.gateFeatureCheck}>
              <Ionicons name="checkmark" size={10} color={ACCENT} />
            </View>
            <Text style={styles.gateFeatureText}>{f}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.ctaBtn} onPress={() => setMode('form')}>
        <Text style={styles.ctaBtnText}>Sign Up — It's Free</Text>
        <Ionicons name="chevron-forward" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDone}>
        <Text style={styles.skipText}>Skip for now, explore first</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScreenDiscover() {
  return (
    <View style={styles.screenPadBleed}>
      <View style={styles.screenPad}>
        <Text style={styles.headline}>Your next{'\n'}obsession is here</Text>
        <Text style={styles.sub}>AI-tuned picks from manga, manhwa & webcomics — swipe to peek.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoverScroll}>
        {DISCOVER_CARDS.map((card) => (
          <MangaCover key={card.title} title={card.title} searchKey={card.searchKey} lang={card.lang} color={card.color} style={styles.discoverCard}>
            <View style={styles.discoverCardOverlay}>
              <Text style={styles.discoverCardGenre}>{card.genre}</Text>
              <Text style={styles.discoverCardTitle} numberOfLines={2}>{card.title}</Text>
              <View style={styles.miniCardMeta}>
                <Ionicons name="star" size={10} color="#FFD700" />
                <Text style={styles.miniCardRating}>{card.rating}</Text>
              </View>
            </View>
          </MangaCover>
        ))}
      </ScrollView>

      <View style={styles.screenPad}>
        <View style={styles.chipRow}>
          {DISCOVER_CHIPS.map((c) => (
            <View key={c.label} style={styles.chip}>
              <Ionicons name={c.icon} size={13} color="#7B5CFF" />
              <Text style={styles.chipLabel}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ScreenConnect() {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>Read together,{'\n'}not alone</Text>
      <Text style={styles.sub}>Follow friends and never lose your place.</Text>

      <View style={{ marginTop: 18 }}>
        {ACTIVITY.map((item) => (
          <View key={item.user} style={styles.activityRow}>
            <View style={styles.activityAvatar}>
              <Text style={styles.activityAvatarText}>{item.avatar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityText}>
                <Text style={styles.activityUser}>{item.user}</Text>
                <Text style={styles.activityAction}> {item.action} </Text>
                <Text style={styles.activityTitle}>{item.title}</Text>
              </Text>
              <Text style={styles.activityTime}>{item.time}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.highlightGrid}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.highlightCard}>
            <View style={styles.highlightIconWrap}>
              <Ionicons name={f.icon} size={14} color="#7B5CFF" />
            </View>
            <Text style={styles.highlightLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Screen5({ selected, onToggle }) {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>What do you love?</Text>
      <Text style={styles.highlightText}>Pick your 3 favourite genres.</Text>
      <Text style={styles.sub}>We'll tailor your entire experience around your taste.</Text>

      <View style={styles.genreGrid}>
        {GENRE_OPTIONS.map((g) => {
          const active = selected.includes(g.label);
          const maxed = selected.length >= 3 && !active;
          return (
            <TouchableOpacity
              key={g.label}
              onPress={() => !maxed && onToggle(g.label)}
              disabled={maxed}
              style={[styles.genreBtn, active && styles.genreBtnActive, maxed && styles.genreBtnMaxed]}>
              <Ionicons name={active ? (g.iconActive || g.icon) : g.icon} size={17} color={active ? '#7B5CFF' : '#9B9AA3'} />
              <Text style={[styles.genreLabel, active && styles.genreLabelActive]}>{g.label}</Text>
              {active && <Ionicons name="checkmark" size={14} color="#7B5CFF" />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.genreCount}>
        {selected.length}/3 selected{selected.length === 3 ? '  ✓ Perfect!' : ''}
      </Text>
    </View>
  );
}

const VIBES = [
  { id: 'dark',  label: 'Dark & Intense', emoji: '⚔️', desc: 'Action, Horror, Thriller',    boost: ['Action', 'Horror', 'Thriller'] },
  { id: 'light', label: 'Light & Fun',    emoji: '🌸', desc: 'Comedy, Romance, Slice of Life', boost: ['Comedy', 'Romance', 'Slice of Life'] },
  { id: 'mix',   label: 'Mix of Both',    emoji: '✨', desc: 'A little of everything',       boost: [] },
];
const FREQUENCIES = [
  { id: 'daily',  label: 'Every day',              emoji: '🔥' },
  { id: 'weekly', label: 'A few times a week',     emoji: '📅' },
  { id: 'casual', label: 'Whenever I feel like it', emoji: '😊' },
];

function ScreenTaste({ vibe, onVibe, frequency, onFrequency }) {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>Tell us your{'\n'}vibe</Text>
      <Text style={styles.highlightText}>We'll fine-tune your taste profile right away.</Text>

      <View style={{ marginTop: 16, marginBottom: 24 }}>
        {VIBES.map((v) => {
          const active = vibe === v.id;
          return (
            <TouchableOpacity
              key={v.id}
              onPress={() => onVibe(v.id)}
              style={[styles.tasteOption, active && styles.tasteOptionActive]}>
              <Text style={styles.tasteOptionEmoji}>{v.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tasteOptionLabel, active && { color: '#fff' }]}>{v.label}</Text>
                <Text style={styles.tasteOptionDesc}>{v.desc}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color="#7B5CFF" />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.sub, { marginBottom: 10 }]}>How often do you read?</Text>
      <View style={styles.freqRow}>
        {FREQUENCIES.map((f) => {
          const active = frequency === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => onFrequency(f.id)}
              style={[styles.freqBtn, active && styles.freqBtnActive]}>
              <Text style={styles.freqEmoji}>{f.emoji}</Text>
              <Text style={[styles.freqLabel, active && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Screen6({ username, onChange, status }) {
  return (
    <View style={styles.screenPad}>
      <View style={styles.gateOrb}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>@</Text>
      </View>
      <Text style={styles.headline}>What should we call you?</Text>
      <Text style={styles.highlightText}>Choose a username for your MangaRecs profile.</Text>
      <Text style={styles.sub}>This is how friends and the community will find you.</Text>

      <View style={[
        styles.usernameWrap,
        status === 'available' && { borderColor: 'rgba(29,158,117,0.6)' },
        status === 'taken' && { borderColor: 'rgba(255,69,58,0.6)' },
      ]}>
        <Text style={styles.usernameAt}>@</Text>
        <TextInput
          style={styles.usernameInput}
          placeholder="yourname"
          placeholderTextColor="rgba(155,154,163,0.4)"
          value={username}
          onChangeText={(v) => onChange(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <UsernameStatusIcon status={status} />
      </View>
      {status === 'available' && <Text style={styles.usernamePreview}>@{username} is available — looks great!</Text>}
      {status === 'taken' && <Text style={[styles.usernamePreview, { color: '#FF453A' }]}>@{username} is already taken — try another.</Text>}
      {status === 'invalid' && <Text style={[styles.usernamePreview, { color: '#9B9AA3' }]}>Usernames need at least 3 characters.</Text>}
      <Text style={styles.sub}>This is permanent and can't be changed later — choose carefully. Already have one? Leave this blank.</Text>
    </View>
  );
}

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(-1);
  const [genres, setGenres] = useState([]);
  const [vibe, setVibe] = useState('mix');
  const [frequency, setFrequency] = useState('weekly');
  const [username, setUsername] = useState('');
  const [finishing, setFinishing] = useState(false);

  const keyboardPadding = useKeyboardPadding();
  const usernameStatus = useUsernameAvailability(step === 4 ? username : '');
  const { isTablet } = useResponsive();

  const totalSteps = 5;

  function toggleGenre(g) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : prev.length < 3 ? [...prev, g] : prev));
  }

  function canProceed() {
    if (step === 2) return genres.length === 3;
    if (step === 4) {
      if (username.trim().length === 0) return true; // empty = skip (already has a handle)
      return username.trim().length >= 2 && usernameStatus !== 'taken' && usernameStatus !== 'checking';
    }
    return true;
  }

  async function finishOnboarding() {
    setFinishing(true);
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      await AsyncStorage.setItem('preferred_genres', JSON.stringify(genres));
      const initialWeights = {};
      genres.forEach((g) => { initialWeights[g] = 10; });
      // Apply vibe bonus to fine-tune initial weights
      const selectedVibe = VIBES.find((v) => v.id === vibe);
      if (selectedVibe?.boost?.length) {
        selectedVibe.boost.forEach((g) => { initialWeights[g] = (initialWeights[g] || 0) + 5; });
      } else if (vibe === 'mix') {
        GENRE_OPTIONS.forEach((g) => { initialWeights[g.label] = (initialWeights[g.label] || 0) + 2; });
      }
      await AsyncStorage.setItem('@mangarecs_genre_prefs', JSON.stringify(initialWeights));
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        if (username.trim()) {
          await supabase.rpc('claim_username', { new_username: username.trim() });
        }
        const updates = {};
        if (genres.length > 0) updates.favorite_genre = genres[0];
        if (Object.keys(initialWeights).length > 0) updates.genre_weights = initialWeights;
        if (vibe) updates.reading_vibe = vibe;
        if (frequency) updates.reading_frequency = frequency;
        if (Object.keys(updates).length > 0) {
          await supabase.from('profiles').update(updates).eq('id', data.user.id);
        }
      }
    } catch (e) {
      // best-effort sync; never block the user from entering the app
    }
    setFinishing(false);
    onComplete();
  }

  function handleSkipAll() {
    AsyncStorage.setItem('onboarding_complete', 'true').finally(onComplete);
  }

  function handleNext() {
    if (step < 4) setStep((s) => s + 1);
    else finishOnboarding();
  }

  function ctaLabel() {
    if (finishing) return null;
    if (step === 4) return 'Start Reading';
    return 'Continue';
  }

  if (step === -1) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <StarLogo size={22} />
            <Text style={styles.logo}>MangaRecs</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardPadding }}
          keyboardShouldPersistTaps="handled">
          <View style={isTablet ? styles.tabletWrap : null}>
            <SignUpGate onDone={() => setStep(0)} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <StarLogo size={22} />
          <Text style={styles.logo}>MangaRecs</Text>
        </View>
        {step < 3 && (
          <TouchableOpacity onPress={handleSkipAll}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === step && styles.dotActive,
              i <= step && { opacity: 1 },
              i > step && { opacity: 0.3 },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardPadding }}
        keyboardShouldPersistTaps="handled">
        <View style={isTablet ? styles.tabletWrap : null}>
          {step === 0 && <ScreenDiscover />}
          {step === 1 && <ScreenConnect />}
          {step === 2 && <Screen5 selected={genres} onToggle={toggleGenre} />}
          {step === 3 && <ScreenTaste vibe={vibe} onVibe={setVibe} frequency={frequency} onFrequency={setFrequency} />}
          {step === 4 && <Screen6 username={username} onChange={setUsername} status={usernameStatus} />}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, isTablet && styles.tabletWrap]}>
        <TouchableOpacity
          style={[styles.ctaBtn, (!canProceed() || finishing) && styles.ctaBtnDisabled]}
          onPress={handleNext}
          disabled={!canProceed() || finishing}>
          {finishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.ctaBtnText}>{ctaLabel()}</Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </>
          )}
        </TouchableOpacity>
        {step > 0 && (
          <TouchableOpacity onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.backLink}>← Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0F' },
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
  logo: { color: '#7B5CFF', fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  skipText: { color: '#9B9AA3', fontSize: 12, textAlign: 'center', marginTop: 12 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9B9AA3' },
  dotActive: { width: 24, backgroundColor: '#7B5CFF' },
  screenPad: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  headline: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 8, lineHeight: 37, letterSpacing: -0.3 },
  highlightText: { color: '#7B5CFF', fontSize: 13, fontWeight: '600', marginBottom: 6, lineHeight: 18 },
  sub: { color: '#9B9AA3', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7B5CFF',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  backLink: { color: '#9B9AA3', fontSize: 12, textAlign: 'center', marginTop: 12 },

  gateOrb: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#7B5CFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  gateFeatureList: { width: '100%', marginVertical: 16, gap: 10 },
  gateFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gateFeatureCheck: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(29,158,117,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  gateFeatureText: { color: '#9B9AA3', fontSize: 12 },

  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1F',
    borderWidth: 1, borderColor: '#2A2A2F', borderRadius: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  fieldIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, color: '#fff', fontSize: 14 },
  errorText: { color: '#FF3B30', fontSize: 12, marginBottom: 12 },

  screenPadBleed: { paddingTop: 16, paddingBottom: 24 },
  discoverScroll: { paddingLeft: 24, paddingRight: 14, paddingVertical: 16, gap: 12 },
  discoverCard: {
    width: 152, height: 214, borderRadius: 20, marginRight: 12,
    borderWidth: 1, borderColor: 'rgba(123,92,255,0.25)',
  },
  discoverCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, paddingTop: 24, backgroundColor: 'rgba(0,0,0,0.68)', borderBottomLeftRadius: 19, borderBottomRightRadius: 19 },
  discoverCardGenre: { color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  discoverCardTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 3, lineHeight: 17 },
  miniCardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 3 },
  miniCardRating: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: 'rgba(123,92,255,0.12)', borderWidth: 1, borderColor: 'rgba(123,92,255,0.25)',
  },
  chipLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: '#1A1A1F', borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#2A2A2F',
  },
  activityAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B5CFF',
    alignItems: 'center', justifyContent: 'center',
  },
  activityAvatarText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  activityText: { fontSize: 12, lineHeight: 17 },
  activityUser: { color: '#fff', fontWeight: '600' },
  activityAction: { color: '#9B9AA3' },
  activityTitle: { color: '#7B5CFF', fontWeight: '600' },
  activityTime: { color: 'rgba(155,154,163,0.5)', fontSize: 10, marginTop: 2 },

  highlightGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  highlightCard: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: '#1A1A1F', borderWidth: 1, borderColor: '#2A2A2F',
    borderRadius: 12, marginBottom: 8,
  },
  highlightIconWrap: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(123,92,255,0.15)' },
  highlightLabel: { color: '#fff', fontSize: 11, fontWeight: '500', flex: 1 },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16, gap: 10 },
  genreBtn: {
    width: '47%', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A2F', backgroundColor: '#1A1A1F', marginBottom: 4,
  },
  genreBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  genreBtnMaxed: { opacity: 0.4 },
  genreLabel: { color: '#9B9AA3', fontSize: 13, fontWeight: '500', flex: 1 },
  genreLabelActive: { color: '#fff' },
  genreCount: { color: '#9B9AA3', fontSize: 12, textAlign: 'center', marginTop: 16 },

  tasteOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2F',
    backgroundColor: '#1A1A1F', marginBottom: 10,
  },
  tasteOptionActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.12)' },
  tasteOptionEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  tasteOptionLabel: { color: '#9B9AA3', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  tasteOptionDesc: { color: 'rgba(155,154,163,0.55)', fontSize: 11 },
  freqRow: { flexDirection: 'column', gap: 8 },
  freqBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A2F', backgroundColor: '#1A1A1F',
  },
  freqBtnActive: { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.12)' },
  freqEmoji: { fontSize: 16 },
  freqLabel: { color: '#9B9AA3', fontSize: 13, fontWeight: '500', flex: 1 },

  usernameWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1F',
    borderWidth: 1, borderColor: '#2A2A2F', borderRadius: 16, paddingHorizontal: 16,
    marginTop: 20, marginBottom: 12,
  },
  usernameAt: { color: '#9B9AA3', fontSize: 16, fontWeight: '600', marginRight: 6 },
  usernameInput: { flex: 1, paddingVertical: 16, color: '#fff', fontSize: 16 },
  usernamePreview: { color: ACCENT, fontSize: 12, marginBottom: 12 },
});
