import { View, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { SOURCE_PROBE_JS, pickProbeLink } from '../utils/readSources';

// Resolves whether a site carries a series, for the sites a plain fetch can't
// reach — SPA shells that render results in JS, and anything behind a bot
// challenge. Both need a real browser, and the app already has one.
//
// Invisible, and several sites at a time. This used to walk the targets one
// after another, which made the worst case the SUM of every site's timeout:
// seven targets at 9.5s each is over a minute, and nobody stays on a detail
// screen that long — so the row stopped filling wherever the reader happened
// to leave, and a site that would have matched simply never got asked. Running
// a few concurrently makes the worst case a few rounds instead of seven, and
// the row fills fast enough to still be filling while it's being looked at.
//
// Not more than LANES at once on purpose: each lane is a full browser context
// executing someone else's JavaScript, and a phone that opens seven of those
// simultaneously drops frames on the screen in front of it.
//
// A target that times out, gets challenged, or returns no matching title is
// skipped — the failure mode stays "not listed", never "listed with a wrong
// link". Nothing renders once the queue is drained, so the usual case (cached
// sources) costs nothing.

const PER_TARGET_TIMEOUT = 9500;
const LANES = 3;

const UA = Platform.OS === 'ios'
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/UD1A.231105.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36';

// One lane: owns a single target at a time and reports when it's finished with
// it, either way. Kept as its own component so each lane's WebView has its own
// ref and deadline — sharing those across lanes is what made concurrency
// awkward to bolt onto the sequential version.
function ProbeLane({ target, query, matches, onFound, onSettled }) {
  const webviewRef = useRef(null);
  const timerRef = useRef(null);
  // The injected script reports on a schedule and onLoadEnd can fire more than
  // once per page (redirects, a challenge resolving into the real page), so a
  // target must only ever be settled once.
  const settledRef = useRef(false);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    onSettled(target.host);
  }, [target.host, onSettled]);

  // Per-target deadline. Without it a challenge page that never resolves holds
  // its lane forever, and the sites most worth probing are exactly the ones
  // that serve challenges.
  useEffect(() => {
    settledRef.current = false;
    timerRef.current = setTimeout(settle, PER_TARGET_TIMEOUT);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [settle]);

  return (
    <WebView
      ref={webviewRef}
      // Keyed by host so React tears the instance down between targets: reusing
      // one leaves the previous page's __inkloreProbe guard set, and the script
      // would no-op on every site after the first.
      key={target.host}
      source={{ uri: target.search(query) }}
      userAgent={UA}
      javaScriptEnabled
      domStorageEnabled
      // Nothing here is displayed, so none of the media/scroll machinery is
      // wanted — and third-party cookies are what keep a cleared bot challenge
      // cleared between targets on the same CDN.
      thirdPartyCookiesEnabled
      cacheEnabled
      androidLayerType="software"
      onLoadEnd={() => { webviewRef.current?.injectJavaScript(SOURCE_PROBE_JS); }}
      onError={settle}
      onHttpError={settle}
      onMessage={(e) => {
        let msg;
        try { msg = JSON.parse(e.nativeEvent.data); } catch (_) { return; }
        if (msg?.type !== 'sourceProbe') return;
        const url = pickProbeLink(msg.links, target, matches);
        if (url) onFound?.({ name: target.name, host: target.host, langs: target.langs, url });
        settle();
      }}
    />
  );
}

export default function SourceProbe({ targets, query, matches, onFound, onDone }) {
  // Cursor for the next target to hand out. A ref, not state, and advanced
  // outside the setActive updater: a state updater has to be pure and is not
  // guaranteed to run synchronously, so reading the next target from inside
  // one either hands the same site to two lanes or skips one entirely.
  //
  // Lanes are refilled from the front, so whichever frees up first takes the
  // next site rather than each lane owning a fixed slice — one stalled site
  // then costs one lane instead of a third of the queue.
  const cursorRef = useRef(LANES);
  const [active, setActive] = useState(() => targets.slice(0, LANES));
  const doneRef = useRef(false);

  const onSettled = useCallback((host) => {
    const next = cursorRef.current < targets.length ? targets[cursorRef.current++] : null;
    setActive((prev) => {
      const remaining = prev.filter((t) => t.host !== host);
      return next ? [...remaining, next] : remaining;
    });
  }, [targets]);

  // `active` is state, so this re-runs whenever a lane drains — and the ref is
  // current by then.
  useEffect(() => {
    if (doneRef.current) return;
    if (cursorRef.current >= targets.length && active.length === 0) {
      doneRef.current = true;
      onDone?.();
    }
  }, [active.length, targets.length, onDone]);

  // Fresh target list (different series) restarts the queue.
  useEffect(() => {
    doneRef.current = false;
    cursorRef.current = LANES;
    setActive(targets.slice(0, LANES));
  }, [targets]);

  if (active.length === 0) return null;

  return (
    <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} pointerEvents="none">
      {active.map((t) => (
        <ProbeLane
          key={t.host}
          target={t}
          query={query}
          matches={matches}
          onFound={onFound}
          onSettled={onSettled}
        />
      ))}
    </View>
  );
}
