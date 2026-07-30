import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setCoverTransitionListener } from '../utils/coverTransition';

// Matches MangaDetailScreen's hero cover exactly (its `coverWrap`/`cover`
// styles): 128x182 at 12px radius, sitting at the hero row's left edge
// (paddingHorizontal 20), paddingTop insets.top + 14 below the back button.
const DEST = { left: 20, width: 128, height: 182, radius: 12 };

const MORPH_MS = 300;
const FADE_MS  = 160;

// A measurement that came back as garbage (0/NaN/absurd) must never be turned
// into a rendered box — an unresolved size on a view with elevation 999 paints
// over the whole app.
function isUsableRect(r) {
  if (!r) return false;
  const vals = [r.x, r.y, r.width, r.height];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  return r.width > 1 && r.height > 1 && r.width < 2000 && r.height < 3000;
}

export default function CoverMorphOverlay() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(null);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const running = useRef(null);

  useEffect(() => {
    const unsub = setCoverTransitionListener((payload) => {
      if (!isUsableRect(payload?.rect)) return;
      // Never leave a previous run's animation attached to these nodes.
      running.current?.stop?.();
      progress.setValue(0);
      fade.setValue(1);
      setPending(payload);

      // Both animations MUST stay on the JS driver. This view animates layout
      // props (left/top/width/height/borderRadius), which the native driver
      // cannot handle — but `opacity` used to run with useNativeDriver: true
      // on this same view. Mixing drivers hands the view to the native
      // animated module, after which the JS-driven layout props silently stop
      // applying: from the second transition onward the overlay stayed
      // mounted at an unresolved size with elevation 999, painting an opaque
      // slab over the entire app until it was force-quit.
      const anim = Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: MORPH_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: false }),
      ]);
      running.current = anim;
      anim.start(() => {
        running.current = null;
        setPending(null);
      });
    });
    return () => {
      unsub();
      running.current?.stop?.();
    };
  }, []);

  // Safety net: this overlay sits above the whole app, so it must never
  // outlive the animation it exists to run — even if a completion callback is
  // dropped (interrupted or overlapping transition).
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      running.current?.stop?.();
      running.current = null;
      setPending(null);
    }, MORPH_MS + FADE_MS + 500);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;

  const destTop = insets.top + 14;
  const left   = progress.interpolate({ inputRange: [0, 1], outputRange: [pending.rect.x, DEST.left] });
  const top    = progress.interpolate({ inputRange: [0, 1], outputRange: [pending.rect.y, destTop] });
  const width  = progress.interpolate({ inputRange: [0, 1], outputRange: [pending.rect.width, DEST.width] });
  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [pending.rect.height, DEST.height] });
  const radius = progress.interpolate({ inputRange: [0, 1], outputRange: [pending.rect.radius ?? 0, DEST.radius] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        { left, top, width, height, borderRadius: radius, opacity: fade, backgroundColor: pending.color || '#1A1A2E' },
      ]}>
      {pending.uri ? (
        <ExpoImage source={{ uri: pending.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', overflow: 'hidden', zIndex: 999, elevation: 999 },
});
