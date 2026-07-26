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

  const measureTarget = useCallback((key) => (
    new Promise((resolve) => {
      const node = nodes.current[key];
      if (!node || typeof node.measureInWindow !== 'function') { resolve(null); return; }
      try {
        node.measureInWindow((x, y, width, height) => {
          if (!width && !height) resolve(null);
          else resolve({ x, y, width, height });
        });
      } catch (_) { resolve(null); }
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
