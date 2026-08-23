import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import GoogleLogo from './GoogleLogo';
import { useT } from '../utils/LanguageContext';
import { useTheme } from '../utils/ThemeContext';

// Shared OAuth button row + divider for AuthScreen.js and OnboardingScreen.js's
// SignUpGate — both screens offer the same Google sign-in, so a single
// definition keeps the branding/loading treatment in sync everywhere it's used.
// (Apple Sign-In was removed 2026-07-19 — pulled pre-launch since it needs a
// paid Apple Developer account; recoverable from git history, commit 794a24b,
// whenever that's set up.)

export function GoogleButton({ onPress, loading }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('auth.continueWithGoogle')}
      accessibilityState={{ disabled: loading, busy: loading }}>
      <View style={styles.iconSlot}>
        {loading ? <ActivityIndicator size="small" color={colors.text} /> : <GoogleLogo size={18} />}
      </View>
      <Text style={[styles.googleBtnText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{t('auth.continueWithGoogle')}</Text>
      <View style={styles.iconSlot} />
    </TouchableOpacity>
  );
}

export function AuthDivider() {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.dividerText, { color: colors.muted }]}>{t('common.or')}</Text>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  },
  dividerText: {
    fontSize: 11,
    textTransform: 'uppercase',
    marginHorizontal: 10,
  },
});
