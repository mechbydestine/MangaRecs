import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { reportError } from '../utils/crashReporting';

// Class components can't call hooks, so the themed fallback UI lives in its
// own function component that ErrorBoundary's render() delegates to.
function ErrorFallback({ onRetry }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>{t('errorBoundary.title')}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('errorBoundary.sub')}</Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('errorBoundary.retry')}>
        <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('errorBoundary.retry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // Contained here, reported to Sentry. Without the report this boundary was
  // actively hiding crashes: the user saw a retry button, and nobody ever
  // learned the screen had died. `where` names which of the boundaries tripped.
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    reportError(error, `errorBoundary.${this.props.where || 'unknown'}`, {
      componentStack: info?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 17, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
