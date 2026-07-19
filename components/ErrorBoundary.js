import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={40} color="#7B5CFF" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>Pull down to refresh or tap below to retry.</Text>
          {/* TEMP debug output — remove once the live crash is diagnosed */}
          {!!this.state.error && (
            <Text selectable style={styles.debug}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
          )}
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0F', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  sub: { color: '#9B9AA3', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  debug: { color: '#FF8A8A', fontSize: 11, textAlign: 'center', marginTop: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  btn: { marginTop: 24, backgroundColor: '#7B5CFF', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
