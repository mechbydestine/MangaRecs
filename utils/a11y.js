// Shared accessibility state and helpers.
//
// Two things the app needs in more than one place and had in exactly one:
// whether the reader has asked the OS to reduce motion (RecapScreen was the
// only screen honouring it, with its own inline copy of this effect), and a
// way to tell a screen reader that something appeared — a sheet sliding up is
// silent to VoiceOver and TalkBack unless it is announced.

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Speak a message through the active screen reader. No-op when none is on. */
export function announce(message) {
  if (!message) return;
  try {
    AccessibilityInfo.announceForAccessibility?.(String(message));
  } catch (_) {
    // Never let an accessibility nicety take down a render path.
  }
}

/**
 * True when the OS "Reduce Motion" setting is on, and kept in sync if the
 * reader flips it while the app is open. Every optional animation should be
 * gated on this — a parallax drift or a spring is exactly what the setting is
 * asking us not to do.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

/** True while a screen reader is running, so UI can adapt where it must. */
export function useScreenReaderEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => { if (alive) setOn(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', (v) => setOn(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return on;
}

/**
 * Announce `message` on the transition from closed to open — not on every
 * render while open, and not on mount when the sheet starts closed. The delay
 * lets the presentation animation settle; announcing into a view that is still
 * appearing gets swallowed on both platforms.
 */
export function useAnnounceOnOpen(visible, message, delay = 350) {
  const wasVisible = useRef(!!visible);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const id = setTimeout(() => announce(message), delay);
      wasVisible.current = true;
      return () => clearTimeout(id);
    }
    if (!visible) wasVisible.current = false;
    return undefined;
  }, [visible, message, delay]);
}
