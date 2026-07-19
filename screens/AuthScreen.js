import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../supabase';
import { signInWithGoogle } from '../utils/googleAuth';
import { useKeyboardPadding } from '../utils/keyboard';
import StarLogo from '../components/StarLogo';
import { GoogleButton, AuthDivider } from '../components/AuthButtons';

function IconField({ icon, secure, rightSlot, inputRef, ...props }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.fieldWrap}>
      <Ionicons name={icon} size={16} color="#9B9AA3" style={styles.fieldIcon} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholderTextColor="#9B9AA3"
        autoCapitalize="none"
        secureTextEntry={secure ? hidden : false}
        {...props}
      />
      {secure ? (
        <TouchableOpacity
          onPress={() => setHidden((h) => !h)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color="#9B9AA3" />
        </TouchableOpacity>
      ) : rightSlot}
    </View>
  );
}

// Debounced username availability check against the profiles table.
// Returns 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
export function useUsernameAvailability(username) {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const name = username.trim().toLowerCase();
    if (!name) { setStatus('idle'); return; }
    if (name.length < 3) { setStatus('invalid'); return; }
    setStatus('checking');
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', name)
        .limit(1);
      if (error) { setStatus('idle'); return; } // network hiccup: don't block signup
      setStatus(data && data.length > 0 ? 'taken' : 'available');
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [username]);

  return status;
}

export function UsernameStatusIcon({ status }) {
  if (status === 'checking') return <ActivityIndicator size="small" color="#9B9AA3" />;
  if (status === 'available') return <Ionicons name="checkmark-circle" size={18} color="#1D9E75" />;
  if (status === 'taken') return <Ionicons name="close-circle" size={18} color="#FF453A" />;
  return null;
}

export default function AuthScreen() {
  const [mode, setMode] = useState('login');

  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const keyboardPadding = useKeyboardPadding();
  const usernameStatus = useUsernameAvailability(mode === 'register' ? username : '');
  const usernameInputRef = useRef(null);

  // Stripping invalid characters can produce a filtered value equal to the
  // previous state (e.g. typing a space after "john" filters back to
  // "john"), which means React never re-renders the TextInput — on Android
  // the rejected characters stay stuck on screen even though state never
  // included them. Force the native view back in sync when that happens.
  function handleUsernameChange(raw) {
    const filtered = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    setUsername(filtered);
    if (filtered !== raw) {
      usernameInputRef.current?.setNativeProps({
        text: filtered,
        selection: { start: filtered.length, end: filtered.length },
      });
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setError('');
    const identifier = loginId.trim();
    let loginEmail = identifier;
    if (!identifier.includes('@')) {
      const { data: resolvedEmail, error: lookupError } = await supabase.rpc('email_for_login', { identifier });
      if (lookupError || !resolvedEmail) {
        setError('Invalid login credentials');
        setLoading(false);
        return;
      }
      loginEmail = resolvedEmail;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleRegister() {
    setError('');
    if (username.length < 3) {
      setError('Username must be at least 3 characters (letters and numbers only).');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken — try another.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        username,
        display_name: username,
        streak_count: 0,
        chapters_read: 0,
        hours_read: 0,
        night_reads: 0,
        genres_count: 0,
        shares_count: 0,
        manga_count: 0,
        ratings_count: 0,
        accepted_guidelines: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (profileError) {
        setError(profileError.message || 'Profile setup failed. Please try again.');
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    if (!data.session) {
      setNotice('Account created! Check your email to confirm, then log in.');
      switchMode('login');
    }
  }

  async function handleSendResetCode() {
    if (!email) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMode('forgot-code');
  }

  async function handleResetPassword() {
    setLoading(true);
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: resetCode,
      type: 'recovery',
    });
    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice('Password updated! Log in with your new password.');
    setPassword('');
    setResetCode('');
    setNewPassword('');
    switchMode('login');
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 + keyboardPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={['rgba(123,92,255,0.35)', 'rgba(123,92,255,0)']}
            style={styles.brandGlow}
            pointerEvents="none"
          />
          <StarLogo size={64} />
        </View>
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmarkWhite}>Manga</Text>
          <Text style={styles.wordmarkPurple}>Recs</Text>
        </View>
        <Text style={styles.tagline}>Your next story, recommended.</Text>

        <View style={styles.card}>
          {mode === 'login' && (
            <>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <GoogleButton onPress={handleGoogle} loading={googleLoading} />
              <AuthDivider />

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                icon="person-outline"
                placeholder="Username or email"
                value={loginId}
                onChangeText={setLoginId}
                autoCorrect={false}
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secure
              />

              <TouchableOpacity onPress={() => switchMode('forgot-email')}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Log In</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => switchMode('register')}>
                <Text style={styles.switchText}>
                  Don't have an account? <Text style={styles.switchLink}>Create one</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'register' && (
            <>
              <Text style={styles.cardTitle}>Create your account</Text>
              <GoogleButton onPress={handleGoogle} loading={googleLoading} />
              <AuthDivider />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                inputRef={usernameInputRef}
                icon="person-outline"
                placeholder="Username (letters & numbers only)"
                value={username}
                onChangeText={handleUsernameChange}
                maxLength={24}
                autoCorrect={false}
                rightSlot={<UsernameStatusIcon status={usernameStatus} />}
              />
              {usernameStatus === 'taken' && (
                <Text style={styles.fieldHint}>@{username} is taken — try another.</Text>
              )}
              {usernameStatus === 'available' && (
                <Text style={[styles.fieldHint, { color: '#1D9E75' }]}>@{username} is available!</Text>
              )}
              <IconField
                icon="mail-outline"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Password (6+ characters)"
                value={password}
                onChangeText={setPassword}
                secure
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secure
              />

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={styles.switchText}>
                  Already have an account? <Text style={styles.switchLink}>Log in</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'forgot-email' && (
            <>
              <Text style={styles.cardTitle}>Reset your password</Text>
              <Text style={styles.cardSub}>We'll send a 6-digit code to your email.</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                icon="mail-outline"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleSendResetCode}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send code</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={styles.switchText}>
                  <Text style={styles.switchLink}>Back to log in</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'forgot-code' && (
            <>
              <Text style={styles.cardTitle}>Check your email</Text>
              <Text style={styles.cardSub}>Enter the 6-digit code we sent to {email}, then choose a new password.</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                icon="key-outline"
                placeholder="6-digit code"
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secure
              />

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={loading || resetCode.length < 6 || !newPassword}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset password</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendResetCode} disabled={loading}>
                <Text style={styles.switchText}>
                  Didn't get a code? <Text style={[styles.switchLink, loading && { opacity: 0.4 }]}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  brandRow: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -38,
  },
  wordmarkRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  wordmarkWhite: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wordmarkPurple: {
    color: '#B18CFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: '#9B6BFF',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: {
    color: '#9B9AA3',
    fontSize: 14,
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#16161B',
    borderRadius: 22,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(123,92,255,0.18)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 8 },
    }),
  },
  cardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cardSub: {
    color: '#9B9AA3',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  appleBtn: {
    height: 46,
    marginTop: 16,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: '#2A2A2F',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    marginBottom: 16,
  },
  googleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A2F',
  },
  dividerText: {
    color: '#9B9AA3',
    fontSize: 11,
    textTransform: 'uppercase',
    marginHorizontal: 10,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: '#2A2A2F',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  fieldIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },
  fieldHint: {
    color: '#FF453A',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
    marginLeft: 4,
  },
  notice: {
    color: '#1D9E75',
    fontSize: 13,
    marginBottom: 12,
  },
  error: {
    color: '#FF3B30',
    fontSize: 13,
    marginBottom: 12,
  },
  forgotLink: {
    color: '#7B5CFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 16,
    marginTop: -4,
  },
  btn: {
    backgroundColor: '#7B5CFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
    shadowColor: '#7B5CFF',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#9B9AA3',
    fontSize: 14,
    textAlign: 'center',
  },
  switchLink: {
    color: '#7B5CFF',
    fontWeight: '600',
  },
});
