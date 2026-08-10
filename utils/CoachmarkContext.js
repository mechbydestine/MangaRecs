import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Lets far-apart components (tab bar icons in App.js, the search button
// inside FeedScreen's header) register themselves under a string key so
// CoachmarkOverlay — mounted once near the root — can measure their on-screen
// position without any prop-drilling between them. Also owns the tour's
// visibility so it can be started both automatically (RootNavigator, first
// time reaching the main tabs) and manually (Settings' "Replay app tour").
const CoachmarkContext = createContext(null);

export function CoachmarkProvider({ children }) {
  const nodes = useRef({});
  const [tourVisible, setTourVisible] = useState(false);

  const registerTarget = useCallback((key, node) => {
    if (node) nodes.current[key] = node;
    else delete nodes.current[key];
  }, []);

  // Retries rather than giving up on the first miss. A target legitimately
  // measures as absent for a few frames — the tab bar mounts after the screen
  // it belongs to, a header button is inside a list that is still laying out —
  // and a single-shot measure turned that into a step silently dropping itself
  // from the tour. Resolves null only once the target really isn't coming.
  const measureTarget = useCallback((key, { attempts = 6, interval = 120 } = {}) => (
    new Promise((resolve) => {
      let tries = 0;

      function retry() {
        if (++tries >= attempts) { resolve(null); return; }
        setTimeout(attempt, interval);
      }

      function attempt() {
        const node = nodes.current[key];
        if (!node || typeof node.measureInWindow !== 'function') { retry(); return; }
        try {
          node.measureInWindow((x, y, width, height) => {
            // A node that exists but hasn't been laid out reports zeros, and
            // one inside a collapsed parent reports NaN — neither is a rect
            // worth spotlighting, so both are worth waiting one more frame for.
            if (!width || !height || !Number.isFinite(x) || !Number.isFinite(y)) retry();
            else resolve({ x, y, width, height });
          });
        } catch (_) { retry(); }
      }

      attempt();
    })
  ), []);

  const showTour = useCallback(() => setTourVisible(true), []);
  const hideTour = useCallback(() => setTourVisible(false), []);

  return (
    <CoachmarkContext.Provider value={{ registerTarget, measureTarget, tourVisible, showTour, hideTour }}>
      {children}
    </CoachmarkContext.Provider>
  );
}

// Attach the returned ref-callback to any View/TouchableOpacity that should
// be spotlight-able under `key`, e.g. ref={useCoachmarkTarget('tab-Feed')}.
export function useCoachmarkTarget(key) {
  const ctx = useContext(CoachmarkContext);
  return useCallback((node) => {
    if (ctx) ctx.registerTarget(key, node);
  }, [ctx, key]);
}

export function useCoachmarkRegistry() {
  return useContext(CoachmarkContext);
}
