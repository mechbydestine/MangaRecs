import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { signInWithGoogle } from '../utils/googleAuth';
import { MangaCover } from '../utils/mangaCovers';
import { GENRES as GENRE_OPTIONS } from '../utils/genres';

const ACCENT = '#1D9E75';

const ACTIVITY = [
  { user: 'AkiraFan99', avatar: 'A', action: 'started', title: 'Solo Leveling', time: '2m ago' },
  { user: 'LunaReads', avatar: 'L', action: 'reached Chapter 124 of', title: 'Frieren: Beyond Journey\'s End', time: '5m ago' },
  { user: 'MangaQueen', avatar: 'M', action: 'recommends', title: 'Jujutsu Kaisen', time: '12m ago' },
  { user: 'NeonReader', avatar: 'N', action: 'just finished', title: 'Chainsaw Man', time: '18m ago' },
];

const REC_CARDS = [
  { title: 'Sakamoto Days', searchKey: 'Sakamoto Days', lang: 'ja', genre: 'Action', match: '98%', color: '#2D1A0A' },
  { title: 'Dungeon Meshi', searchKey: 'Dungeon Meshi', lang: 'ja', genre: 'Fantasy', match: '95%', color: '#0D1A0D' },
  { title: "Omniscient Reader's Viewpoint", lang: 'ko', genre: 'Thriller', match: '91%', color: '#0D1A0D' },
];

const HIGHLIGHTS = [
  { icon: 'sparkles', label: 'Smart Recommendations' },
  { icon: 'book-outline', label: 'Personalized Feed' },
  { icon: 'trending-up', label: 'Trending Stories' },
  { icon: 'star', label: 'Mood-Based Discovery' },
];

const FEATURES = [
  { icon: 'book-outline', label: 'Continue Reading' },
  { icon: 'trending-up', label: 'Reading Statistics' },
  { icon: 'flame', label: 'Reading Streaks' },
  { icon: 'download-outline', label: 'Offline Downloads' },
  { icon: 'notifications-outline', label: 'Chapter Notifications' },
  { icon: 'desktop-outline', label: 'Cross-Device Sync' },
  { icon: 'musical-notes-outline', label: 'Audio Ambience While Reading' },
];


function SignUpGate({ onDone }) {
  const [mode, setMode] = useState('prompt');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <Text style={styles.headline}>Create your account</Text>
        <Text style={styles.sub}>Save your progress, preferences, and library.</Text>

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={googleLoading}>
          <AntDesign name="google" size={18} color="#fff" />
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

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
            secureTextEntry
          />
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

function Screen1() {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>Read. Discover.{'\n'}Connect.</Text>
      <Text style={styles.highlightText}>
        Find your next obsession among manga, manhwa, and webcomics tailored to your taste.
      </Text>
      <Text style={styles.sub}>Join a community of readers discovering incredible stories every day.</Text>

      <View style={styles.miniCardRow}>
        {[
          { title: 'Solo Leveling', searchKey: 'Solo Leveling', lang: 'ko', genre: 'Action', color: '#0D1B2A', rating: '4.9' },
          { title: "Frieren: Beyond Journey's End", searchKey: 'Sousou no Frieren', lang: 'ja', genre: 'Fantasy', color: '#0D2230', rating: '4.9' },
          { title: 'Sweet Home', lang: 'ko', genre: 'Horror', color: '#1A0A0A', rating: '4.8' },
        ].map((c) => (
          <MangaCover key={c.title} title={c.title} searchKey={c.searchKey} lang={c.lang} color={c.color} style={styles.miniCard}>
            <View style={styles.miniCardOverlay}>
              <Text style={styles.miniCardGenre}>{c.genre}</Text>
              <Text style={styles.miniCardTitle}>{c.title}</Text>
              <View style={styles.miniCardMeta}>
                <Ionicons name="star" size={9} color="#FFD700" />
                <Text style={styles.miniCardRating}>{c.rating}</Text>
              </View>
            </View>
          </MangaCover>
        ))}
      </View>
    </View>
  );
}

function Screen2() {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>See What Your{'\n'}Friends Are Reading</Text>
      <Text style={styles.highlightText}>Follow friends, share recommendations, and discover stories through your community.</Text>
      <Text style={styles.sub}>Stay connected to what friends are reading in real time.</Text>

      <View style={{ marginTop: 8 }}>
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
    </View>
  );
}

function Screen3() {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>Your Reading{'\n'}Universe</Text>
      <Text style={styles.highlightText}>AI-powered recommendations built around your unique reading habits.</Text>
      <Text style={styles.sub}>Discover stories based on your interests, history, favorite genres, and trends.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16, marginBottom: 16 }}>
        {REC_CARDS.map((card) => (
          <MangaCover key={card.title} title={card.title} searchKey={card.searchKey} lang={card.lang} color={card.color} style={styles.recCard}>
            <View style={styles.recCardOverlay}>
              <Text style={styles.recCardGenre}>{card.genre}</Text>
              <Text style={styles.recCardTitle}>{card.title}</Text>
              <View style={styles.recCardMatch}>
                <Text style={styles.recCardMatchText}>{card.match} match</Text>
              </View>
            </View>
          </MangaCover>
        ))}
      </ScrollView>

      <View style={styles.highlightGrid}>
        {HIGHLIGHTS.map((h) => (
          <View key={h.label} style={styles.highlightCard}>
            <View style={styles.highlightIconWrap}>
              <Ionicons name={h.icon} size={14} color="#534AB7" />
            </View>
            <Text style={styles.highlightLabel}>{h.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Screen4() {
  return (
    <View style={styles.screenPad}>
      <Text style={styles.headline}>Never Lose{'\n'}Your Place</Text>
      <Text style={styles.highlightText}>Everything stays synced so you can pick up exactly where you left off.</Text>
      <Text style={styles.sub}>Track your journey, build streaks, and enjoy your library anywhere.</Text>

      <View style={{ marginTop: 8 }}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={f.icon} size={14} color="#534AB7" />
            </View>
            <Text style={styles.featureLabel}>{f.label}</Text>
            <View style={styles.featureCheck}>
              <Ionicons name="checkmark" size={10} color={ACCENT} />
            </View>
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
              <Text style={styles.genreEmoji}>{g.emoji}</Text>
              <Text style={[styles.genreLabel, active && styles.genreLabelActive]}>{g.label}</Text>
              {active && <Ionicons name="checkmark" size={14} color="#534AB7" />}
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
              {active && <Ionicons name="checkmark-circle" size={20} color="#534AB7" />}
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

function Screen6({ username, onChange }) {
  return (
    <View style={styles.screenPad}>
      <View style={styles.gateOrb}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>@</Text>
      </View>
      <Text style={styles.headline}>What should we call you?</Text>
      <Text style={styles.highlightText}>Choose a username for your Panelr profile.</Text>
      <Text style={styles.sub}>This is how friends and the community will find you.</Text>

      <View style={styles.usernameWrap}>
        <Text style={styles.usernameAt}>@</Text>
        <TextInput
          style={styles.usernameInput}
          placeholder="yourname"
          placeholderTextColor="rgba(155,154,163,0.4)"
          value={username}
          onChangeText={(v) => onChange(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
          maxLength={20}
          autoCapitalize="none"
        />
      </View>
      {username.length > 0 && <Text style={styles.usernamePreview}>@{username} looks great!</Text>}
      <Text style={styles.sub}>You can always change this later in your profile settings.</Text>
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

  const totalSteps = 7;

  function toggleGenre(g) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : prev.length < 3 ? [...prev, g] : prev));
  }

  function canProceed() {
    if (step === 4) return genres.length === 3;
    if (step === 6) return username.trim().length !== 1; // empty = skip, ≥2 = valid
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
      await AsyncStorage.setItem('@panelr_genre_prefs', JSON.stringify(initialWeights));
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const updates = {};
        if (username.trim()) updates.username = username.trim();
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
    if (step < 6) setStep((s) => s + 1);
    else finishOnboarding();
  }

  function ctaLabel() {
    if (finishing) return null;
    if (step === 3) return 'Almost Done';
    if (step === 6) return 'Start Reading';
    return 'Continue';
  }

  if (step === -1) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>Panelr</Text>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <SignUpGate onDone={() => setStep(0)} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Panelr</Text>
        {step < 5 && (
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {step === 0 && <Screen1 />}
        {step === 1 && <Screen2 />}
        {step === 2 && <Screen3 />}
        {step === 3 && <Screen4 />}
        {step === 4 && <Screen5 selected={genres} onToggle={toggleGenre} />}
        {step === 5 && <ScreenTaste vibe={vibe} onVibe={setVibe} frequency={frequency} onFrequency={setFrequency} />}
        {step === 6 && <Screen6 username={username} onChange={setUsername} />}
      </ScrollView>

      <View style={styles.bottomBar}>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 8,
  },
  logo: { color: '#534AB7', fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  skipText: { color: '#9B9AA3', fontSize: 12, textAlign: 'center', marginTop: 12 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9B9AA3' },
  dotActive: { width: 24, backgroundColor: '#534AB7' },
  screenPad: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  headline: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 8, lineHeight: 32 },
  highlightText: { color: '#534AB7', fontSize: 13, fontWeight: '600', marginBottom: 6, lineHeight: 18 },
  sub: { color: '#9B9AA3', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#534AB7',
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
    backgroundColor: '#534AB7',
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

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D0D0F', borderWidth: 1, borderColor: '#2A2A2F',
    borderRadius: 12, paddingVertical: 14, marginTop: 12, marginBottom: 16, gap: 10,
  },
  googleBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2A2F' },
  dividerText: { color: '#9B9AA3', fontSize: 11, textTransform: 'uppercase', marginHorizontal: 10 },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1F',
    borderWidth: 1, borderColor: '#2A2A2F', borderRadius: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  fieldIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, color: '#fff', fontSize: 14 },
  errorText: { color: '#FF3B30', fontSize: 12, marginBottom: 12 },

  miniCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  miniCard: { width: '31%', height: 140, borderRadius: 16 },
  miniCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.62)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  miniCardGenre: { color: 'rgba(255,255,255,0.6)', fontSize: 9 },
  miniCardTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  miniCardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  miniCardRating: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: '#1A1A1F', borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#2A2A2F',
  },
  activityAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#534AB7',
    alignItems: 'center', justifyContent: 'center',
  },
  activityAvatarText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  activityText: { fontSize: 12, lineHeight: 17 },
  activityUser: { color: '#fff', fontWeight: '600' },
  activityAction: { color: '#9B9AA3' },
  activityTitle: { color: '#534AB7', fontWeight: '600' },
  activityTime: { color: 'rgba(155,154,163,0.5)', fontSize: 10, marginTop: 2 },

  recCard: {
    width: 110, height: 144, borderRadius: 16,
    borderWidth: 1, borderColor: '#2A2A2F', marginRight: 10,
  },
  recCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, paddingTop: 18, backgroundColor: 'rgba(0,0,0,0.62)', borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  recCardGenre: { color: 'rgba(255,255,255,0.5)', fontSize: 9 },
  recCardTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  recCardMatch: { backgroundColor: 'rgba(29,158,117,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  recCardMatchText: { color: ACCENT, fontSize: 9, fontWeight: 'bold', paddingRight: 2 },

  highlightGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  highlightCard: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: '#1A1A1F', borderWidth: 1, borderColor: '#2A2A2F',
    borderRadius: 12, marginBottom: 8,
  },
  highlightIconWrap: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(83,74,183,0.15)' },
  highlightLabel: { color: '#fff', fontSize: 11, fontWeight: '500', flex: 1 },

  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: '#1A1A1F', borderWidth: 1, borderColor: '#2A2A2F',
    borderRadius: 12, marginBottom: 8,
  },
  featureIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(83,74,183,0.15)', alignItems: 'center', justifyContent: 'center' },
  featureLabel: { color: '#fff', fontSize: 13, fontWeight: '500', flex: 1 },
  featureCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(29,158,117,0.2)', alignItems: 'center', justifyContent: 'center' },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16, gap: 10 },
  genreBtn: {
    width: '47%', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A2F', backgroundColor: '#1A1A1F', marginBottom: 4,
  },
  genreBtnActive: { borderColor: '#534AB7', backgroundColor: 'rgba(83,74,183,0.15)' },
  genreBtnMaxed: { opacity: 0.4 },
  genreEmoji: { fontSize: 18 },
  genreLabel: { color: '#9B9AA3', fontSize: 13, fontWeight: '500', flex: 1 },
  genreLabelActive: { color: '#fff' },
  genreCount: { color: '#9B9AA3', fontSize: 12, textAlign: 'center', marginTop: 16 },

  tasteOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2F',
    backgroundColor: '#1A1A1F', marginBottom: 10,
  },
  tasteOptionActive: { borderColor: '#534AB7', backgroundColor: 'rgba(83,74,183,0.12)' },
  tasteOptionEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  tasteOptionLabel: { color: '#9B9AA3', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  tasteOptionDesc: { color: 'rgba(155,154,163,0.55)', fontSize: 11 },
  freqRow: { flexDirection: 'column', gap: 8 },
  freqBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A2F', backgroundColor: '#1A1A1F',
  },
  freqBtnActive: { borderColor: '#534AB7', backgroundColor: 'rgba(83,74,183,0.12)' },
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
