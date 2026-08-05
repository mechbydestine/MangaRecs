import { View, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { SOURCE_PROBE_JS, pickProbeLink } from '../utils/readSources';

// Resolves whether a site carries a series, for the sites a plain fetch can't
// reach — SPA shells that render results in JS, and anything behind a bot
// challenge. Both need a real browser, and the app already has one.
//
// Invisible and sequential: one WebView walks the targets one at a time,
// reporting each hit as it lands so the source row can fill in progressively
// rather than making the reader wait on the slowest site. A target that
// times out, gets challenged, or returns no matching title is simply skipped —
// the failure mode stays "not listed", never "listed with a wrong link".
//
// Not rendered at all once there's nothing left to check, so the usual case
// (cached sources) costs nothing.

const PER_TARGET_TIMEOUT = 9500;

const UA = Platform.OS === 'ios'
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/UD1A.231105.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36';

export default function SourceProbe({ targets, query, matches, onFound, onDone }) {
  const [index, setIndex] = useState(0);
  const webviewRef = useRef(null);
  const timerRef = useRef(null);
  // Guards against a target being scored twice — the injected script reports on
  // a schedule, and onLoadEnd can fire more than once per page (redirects,
  // challenge pages resolving into the real one).
  const settledRef = useRef(-1);

  const target = targets[index];

  const advance = useCallback(() => {
    if (settledRef.current === index) return;
    settledRef.current = index;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setIndex((i) => i + 1);
  }, [index]);

  // Per-target deadline. Without it a challenge page that never resolves would
  // stall the whole queue, and the sites most worth probing are exactly the
  // ones that serve challenges.
  useEffect(() => {
    if (!target) { onDone?.(); return undefined; }
    settledRef.current = -1;
    timerRef.current = setTimeout(advance, PER_TARGET_TIMEOUT);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, target]);

  if (!target) return null;

  return (
    <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} pointerEvents="none">
      <WebView
        ref={webviewRef}
        // Remounted per target: reusing one instance leaves the previous page's
        // __inkloreProbe guard set, so the script would no-op on every site
        // after the first.
        key={target.host}
        source={{ uri: target.search(query) }}
        userAgent={UA}
        javaScriptEnabled
        domStorageEnabled
        // Nothing here is displayed, so none of the media/scroll machinery is
        // wanted — and third-party cookies are what keep a cleared bot
        // challenge cleared between targets on the same CDN.
        thirdPartyCookiesEnabled
        cacheEnabled
        androidLayerType="software"
        onLoadEnd={() => { webviewRef.current?.injectJavaScript(SOURCE_PROBE_JS); }}
        onError={advance}
        onHttpError={advance}
        onMessage={(e) => {
          let msg;
          try { msg = JSON.parse(e.nativeEvent.data); } catch (_) { return; }
          if (msg?.type !== 'sourceProbe') return;
          const url = pickProbeLink(msg.links, target, matches);
          if (url) onFound?.({ name: target.name, host: target.host, langs: target.langs, url });
          advance();
        }}
      />
    </View>
  );
}
