import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { useState } from 'react';
import { supabase } from '../supabase';
import { signInWithGoogle } from '../utils/googleAuth';

function IconField({ icon, ...props }) {
  return (
    <View style={styles.fieldWrap}>
      <Ionicons name={icon} size={16} color="#9B9AA3" style={styles.fieldIcon} />
      <TextInput
        style={styles.input}
        placeholderTextColor="#9B9AA3"
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

function GoogleButton({ onPress, loading }) {
  return (
    <TouchableOpacity style={styles.googleBtn} onPress={onPress} disabled={loading}>
      <AntDesign name="google" size={18} color="#fff" />
      <Text style={styles.googleBtnText}>Continue with Google</Text>
    </TouchableOpacity>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleRegister() {
    setError('');
    if (username.length < 3) {
      setError('Username must be at least 3 characters (letters and numbers only).');
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Panelr</Text>
        <Text style={styles.tagline}>Your manga universe awaits</Text>

        <View style={styles.card}>
          {mode === 'login' && (
            <>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <GoogleButton onPress={handleGoogle} loading={googleLoading} />
              <Divider />

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                icon="mail-outline"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
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
              <Divider />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <IconField
                icon="person-outline"
                placeholder="Username (letters & numbers only)"
                value={username}
                onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())}
                maxLength={24}
                autoCorrect={false}
              />
              <IconField
                icon="mail-outline"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <IconField
                icon="lock-closed-outline"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
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
                secureTextEntry
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06080F',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    color: '#0891B2',
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  tagline: {
    color: '#9B9AA3',
    fontSize: 16,
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#0C1220',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2A2A2F',
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
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06080F',
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
    backgroundColor: '#06080F',
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
    color: '#0891B2',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 16,
    marginTop: -4,
  },
  btn: {
    backgroundColor: '#0891B2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
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
    color: '#0891B2',
    fontWeight: '600',
  },
});
