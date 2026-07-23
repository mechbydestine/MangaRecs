import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRef, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import MobileHeader from '../components/MobileHeader';
import { useTheme } from '../utils/ThemeContext';
import { supabase } from '../supabase';

// The Reading Recap only exists as the fully-built web experience
// (docs/catalog/index.html) — this screen renders that same page in-app
// via WebView instead of duplicating its animation engine natively.
// Since the WebView has its own separate session storage from the app's
// Supabase client, we hydrate it by injecting the app's real access/
// refresh tokens into the page's own `sb` client once it's loaded, then
// re-fire its hash router so it re-renders as signed in.
const RECAP_URL = 'https://mangarecs.net/catalog/#/recap';

export default function RecapScreen() {
  const { colors } = useTheme();
  const webviewRef = useRef(null);

  const injectSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !webviewRef.current) return;
    const script = `
      (function () {
        function go() {
          if (window.sb) {
            sb.auth.setSession({
              access_token: ${JSON.stringify(session.access_token)},
              refresh_token: ${JSON.stringify(session.refresh_token)},
            }).then(function () { window.dispatchEvent(new Event('hashchange')); });
          } else {
            setTimeout(go, 50);
          }
        }
        go();
      })();
      true;
    `;
    webviewRef.current.injectJavaScript(script);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileHeader title="Reading Recap" />
      <WebView
        ref={webviewRef}
        source={{ uri: RECAP_URL }}
        onLoadEnd={injectSession}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: colors.background }]}>
            <ActivityIndicator color="#7B5CFF" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
