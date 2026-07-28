import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setCoverTransitionListener } from '../utils/coverTransition';

// Matches MangaDetailScreen's hero cover exactly (its `coverWrap`/`cover`
// styles): 128x182 at 12px radius, sitting at the hero row's left edge
// (paddingHorizontal 20), paddingTop insets.top + 14 below the back button.
const DEST = { left: 20, width: 128, height: 182, radius: 12 };

export default function CoverMorphOverlay() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(null);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = setCoverTransitionListener((payload) => {
      progress.setValue(0);
      fade.setValue(1);
      setPending(payload);
      Animated.timing(progress, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // animating left/top/width/height — can't run on the native thread
      }).start(() => {
        Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setPending(null));
      });
    });
    return unsub;
  }, []);

  // Safety net: the overlay sits at zIndex 999 above the whole app, so if its
  // completion callback ever failed to fire (an interrupted/overlapping
  // animation), it would otherwise cover the screen indefinitely. Never let
  // it outlive the animation it's supposed to run (300ms + 160ms) by more
  // than a comfortable margin.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 1000);
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
