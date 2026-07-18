import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import GoogleLogo from './GoogleLogo';

// Shared OAuth button row + divider for AuthScreen.js and OnboardingScreen.js's
// SignUpGate — both screens offer the same Google/Apple sign-in, so a single
// definition keeps the branding/loading treatment in sync everywhere it's used.

export function GoogleButton({ onPress, loading }) {
  return (
    <TouchableOpacity style={styles.googleBtn} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      <View style={styles.iconSlot}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : <GoogleLogo size={18} />}
      </View>
      <Text style={styles.googleBtnText}>Continue with Google</Text>
      <View style={styles.iconSlot} />
    </TouchableOpacity>
  );
}

export function AppleButton({ onPress, loading }) {
  return (
    <View style={{ opacity: loading ? 0.6 : 1 }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={styles.appleBtn}
        onPress={loading ? () => {} : onPress}
      />
    </View>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  appleBtn: {
    height: 48,
    marginTop: 14,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151519',
    borderWidth: 1,
    borderColor: '#2E2E35',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  // Fixed-width slots on both sides of the label keep the button's content
  // perfectly centered and prevent any layout shift/blank flash when the
  // left slot swaps between the Google mark and a loading spinner.
  iconSlot: {
    width: 18,
    height: 18,
    marginHorizontal: 10,
  },
  googleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
});
