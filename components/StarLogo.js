import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, Easing, Image, Platform } from 'react-native';
import { useReducedMotion } from '../utils/a11y';

// The brand mark. This used to hand-draw the old eight-pointed star in SVG;
// 47c3baf1 replaced that star with the new MangaRecs logo on the website and
// in the launcher/splash assets, but every in-app surface was still drawing
// the old star, so the app and the site disagreed about the brand.
//
// The logo is a wordmark: it already contains the name, which is why the site
// renders its <h1>MangaRecs</h1> as sr-only next to it. The screens that used
// to pair the star with a separate "Manga"/"Recs" text row no longer do.
//
// `size` is the HEIGHT. The source art is 460x345, a clean 4:3, so width is
// derived rather than letting the image letterbox inside a square.
const RATIO = 4 / 3;
const SOURCE = require('../assets/logo-mark.png');

const StarLogo = forwardRef(function StarLogo({ size = 38 }, ref) {
  const pop     = useRef(new Animated.Value(0)).current;
  const running = useRef(false);
  const reduced = useReducedMotion();

  // The old mark span a full 360 on tab-press. A wordmark cannot: half of that
  // rotation has the name upside down. Same job (a visible acknowledgement
  // that the tap registered), done as a quick scale pop instead.
  useImperativeHandle(ref, () => ({
    spin() {
      if (running.current || reduced) return;
      running.current = true;
      pop.setValue(0);
      Animated.sequence([
        Animated.timing(pop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pop, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => { running.current = false; });
    },
  }));

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <Animated.View
      style={{
        width: Math.round(size * RATIO),
        height: size,
        transform: [{ scale }],
        shadowColor: '#7858FF',
        shadowOpacity: 0.7,
        shadowRadius: size * 0.35,
        shadowOffset: { width: 0, height: 0 },
        elevation: Platform.OS === 'android' ? Math.round(size * 0.5) : 0,
      }}
    >
      <Image
        source={SOURCE}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="MangaRecs"
      />
    </Animated.View>
  );
});

export default StarLogo;
