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
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import StarLogo from '../components/StarLogo';
import { GoogleButton, AuthDivider } from '../components/AuthButtons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../utils/responsive';

function IconField({ icon, secure, rightSlot, inputRef, ...props }) {
  const [hidden, setHidden] = useState(true);
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={[styles.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={styles.fieldIcon} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.text }]}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        secureTextEntry={secure ? hidden : false}
        // The field has no visible <Text> label — the placeholder IS the label
        // here, so it doubles as the accessible name unless a caller passes a
        // better one. Spread last so an explicit prop still wins.
        accessibilityLabel={props.placeholder}
        {...props}
      />
      {secure ? (
        <TouchableOpacity
          onPress={() => setHidden((h) => !h)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? t('a11y.showPassword') : t('a11y.hidePassword')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.textSecondary} />
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
  const { colors } = useTheme();
  const t = useT();
  if (status === 'checking') return <ActivityIndicator size="small" color={colors.textSecondary} />;
  if (status === 'available') return <Ionicons name="checkmark-circle" size={18} color={colors.accent} />;
  if (status === 'taken') return <Ionicons name="close-circle" size={18} color={colors.error} />;
  return null;
}

export default function AuthScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const t = useT();
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isTablet && styles.tabletWrap, { paddingBottom: 24 + keyboardPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={[colors.primary + '59', colors.primary + '00']}
            style={styles.brandGlow}
            pointerEvents="none"
          />
          <StarLogo size={64} />
        </View>
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wordmarkWhite, { color: colors.text }]}>Manga</Text>
          <Text style={[styles.wordmarkPurple, { color: colors.primary, textShadowColor: colors.primary }]}>Recs</Text>
        </View>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>{t('auth.tagline')}</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary + '2E' }]}>
          {mode === 'login' && (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('auth.signInTitle')}</Text>
              <GoogleButton onPress={handleGoogle} loading={googleLoading} />
              <AuthDivider />

              {notice ? <Text style={[styles.notice, { color: colors.accent }]}>{notice}</Text> : null}
              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

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

              <TouchableOpacity
                onPress={() => switchMode('forgot-email')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password">
                <Text style={[styles.forgotLink, { color: colors.primary }]}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleLogin}
                accessibilityRole="button"
                accessibilityLabel="Log in"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('auth.logIn')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => switchMode('register')}
                accessibilityRole="button"
                accessibilityLabel="Create an account">
                <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                  {t('auth.noAccount')} <Text style={[styles.switchLink, { color: colors.primary }]}>{t('auth.createOne')}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'register' && (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('auth.signUpTitle')}</Text>
              <GoogleButton onPress={handleGoogle} loading={googleLoading} />
              <AuthDivider />

              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

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
                <Text style={[styles.fieldHint, { color: colors.error }]}>@{username} is taken — try another.</Text>
              )}
              {usernameStatus === 'available' && (
                <Text style={[styles.fieldHint, { color: colors.accent }]}>@{username} is available!</Text>
              )}
              <IconField
                icon="mail-outline"
                placeholder={t('placeholder.email')}
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
                placeholder={t('placeholder.confirmPassword')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secure
              />

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleRegister}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('onboarding.createAccount')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => switchMode('login')}
                accessibilityRole="button"
                accessibilityLabel="Log in to an existing account">
                <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                  {t('auth.haveAccount')} <Text style={[styles.switchLink, { color: colors.primary }]}>{t('auth.logIn')}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'forgot-email' && (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('auth.resetYourPassword')}</Text>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t('auth.codeSentHint')}</Text>

              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

              <IconField
                icon="mail-outline"
                placeholder={t('placeholder.email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleSendResetCode}
                accessibilityRole="button"
                accessibilityLabel="Send reset code"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('auth.sendCode')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => switchMode('login')}
                accessibilityRole="button"
                accessibilityLabel="Back to log in">
                <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                  <Text style={[styles.switchLink, { color: colors.primary }]}>{t('auth.backToLogIn')}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'forgot-code' && (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('auth.checkEmail')}</Text>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Enter the 6-digit code we sent to {email}, then choose a new password.</Text>

              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

              <IconField
                icon="key-outline"
                placeholder={t('placeholder.sixDigitCode')}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
              />
              <IconField
                icon="lock-closed-outline"
                placeholder={t('placeholder.newPassword')}
                value={newPassword}
                onChangeText={setNewPassword}
                secure
              />

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                accessibilityRole="button"
                accessibilityLabel="Reset password"
                accessibilityState={{ disabled: loading || resetCode.length < 6 || !newPassword, busy: loading }}
                disabled={loading || resetCode.length < 6 || !newPassword}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('auth.resetPassword')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSendResetCode}
                accessibilityRole="button"
                accessibilityLabel="Resend code"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}>
                <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                  {t('auth.noCode')} <Text style={[styles.switchLink, { color: colors.primary }, loading && { opacity: 0.4 }]}>{t('auth.resend')}</Text>
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
  // Caps the reading measure on iPad — full-width body text at 1024pt is
  // unreadable. Matches the 640 used by every other screen.
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  container: {
    flex: 1,
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
    borderRadius: 32, // rounded-square to match the app icon's shape, not a circle
    top: -38,
  },
  wordmarkRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  wordmarkWhite: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wordmarkPurple: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: {
    fontSize: 14,
    marginBottom: 32,
  },
  card: {
    borderRadius: 22,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 8 },
    }),
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  appleBtn: {
    height: 46,
    marginTop: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerText: {
    fontSize: 11,
    textTransform: 'uppercase',
    marginHorizontal: 10,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
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
    fontSize: 15,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
    marginLeft: 4,
  },
  notice: {
    fontSize: 13,
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 16,
    marginTop: -4,
  },
  btn: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
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
    fontSize: 14,
    textAlign: 'center',
  },
  switchLink: {
    fontWeight: '600',
  },
});
