import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import GoogleLogo from './GoogleLogo';

// Shared OAuth button row + divider for AuthScreen.js and OnboardingScreen.js's
// SignUpGate — both screens offer the same Google sign-in, so a single
// definition keeps the branding/loading treatment in sync everywhere it's used.
// (Apple Sign-In was removed 2026-07-19 — pulled pre-launch since it needs a
// paid Apple Developer account; recoverable from git history, commit 794a24b,
// whenever that's set up.)

export function GoogleButton({ onPress, loading }) {
  return (
    <TouchableOpacity
      style={styles.googleBtn}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: loading, busy: loading }}>
      <View style={styles.iconSlot}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : <GoogleLogo size={18} />}
      </View>
      <Text style={styles.googleBtnText} numberOfLines={1} adjustsFontSizeToFit>Continue with Google</Text>
      <View style={styles.iconSlot} />
    </TouchableOpacity>
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
    flexShrink: 1,
    textAlign: 'center',
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
