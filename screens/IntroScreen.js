import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import PANELS from '../assets/intro/panels';

// Riffle through famous B&W manga/manhwa panels (assets/intro/panels.js, built by
// scripts/fetchIntroPanels.js from curated assets/intro-src), landing on the real
// app icon. Whole intro ~4.5s.
const FRAMES = [...PANELS, require('../assets/icon.png')];

// Marvel-style pacing: a few deliberate page turns, a fast riffle through the
// bulk, a ritardando into the landing. SCHEDULE[i] = pause on frame i, then flip to i+1.
const RIFFLE_FLIP_MS = 90;
function buildSchedule(flipCount) {
  const sched = [];
  for (let i = 0; i < flipCount; i++) {
    if (i < 3) {
      sched.push({ flip: 220 - i * 35, hold: 140 - i * 55 }); // wind-up
    } else if (i >= flipCount - 3) {
      const k = i - (flipCount - 3);
      sched.push({ flip: 95 + k * 40, hold: k * 20 }); // slow into the landing
    } else {
      sched.push({ flip: RIFFLE_FLIP_MS, hold: 0 }); // full-speed riffle
    }
  }
  return sched;
}
const SCHEDULE = buildSchedule(FRAMES.length - 1);
const MONTAGE_MS = SCHEDULE.reduce((t, s) => t + s.hold + s.flip, 0);

const ICON_SIZE = 160;
const ICON_RADIUS = ICON_SIZE * 0.2266; // matches the 232/1024 corner rounding baked into icon.png
const GLOW_SIZE = 380;

export default function IntroScreen({ onComplete }) {
  const [frontIndex, setFrontIndex] = useState(0);
  const [backIndex, setBackIndex]   = useState(1);

  const flip           = useRef(new Animated.Value(0)).current;
  const flash          = useRef(new Animated.Value(0)).current;
  const stackScale     = useRef(new Animated.Value(0.94)).current;
  const stackOpacity   = useRef(new Animated.Value(0)).current;
  const glowOpacity    = useRef(new Animated.Value(0)).current;
  const glowScale      = useRef(new Animated.Value(0.75)).current;
  const shineX         = useRef(new Animated.Value(-ICON_SIZE * 0.9)).current;
  const titleOpacity   = useRef(new Animated.Value(0)).current;
  const titleY         = useRef(new Animated.Value(14)).current;
  const sloganOpacity  = useRef(new Animated.Value(0)).current;
  const sloganY        = useRef(new Animated.Value(8)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    function flipTo(nextIdx, duration) {
      return new Promise((resolve) => {
        setBackIndex(nextIdx);
        flip.setValue(0);
        Animated.timing(flip, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setFrontIndex(nextIdx);
          flip.setValue(0);
          resolve();
        });
        // Light catching the page — only on the slow, deliberate turns.
        // At riffle speed it would strobe.
        if (duration >= 150) {
          Animated.sequence([
            Animated.delay(duration * 0.42),
            Animated.timing(flash, { toValue: 0.32, duration: duration * 0.16, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: duration * 0.42, useNativeDriver: true }),
          ]).start();
        }
      });
    }

    function sleep(ms) {
      return new Promise((res) => setTimeout(res, ms));
    }

    function runFinale() {
      Animated.sequence([
        // Icon lands: glow blooms, stack settles with a punch
        Animated.parallel([
          Animated.timing(glowOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1.12, duration: 540, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(stackScale, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 180, mass: 0.7 }),
        ]),
        // Light sweep across the icon face while the glow settles
        Animated.parallel([
          Animated.timing(shineX, { toValue: ICON_SIZE * 1.8, duration: 540, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.45, duration: 540, useNativeDriver: true }),
        ]),
        // Title rises in
        Animated.parallel([
          Animated.timing(titleOpacity, { toValue: 1, duration: 340, useNativeDriver: true }),
          Animated.timing(titleY, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        // Slogan follows
        Animated.parallel([
          Animated.timing(sloganOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(sloganY, { toValue: 0, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.delay(500),
        // Settle out into the app
        Animated.timing(contentOpacity, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        if (!cancelled) onComplete?.();
      });
    }

    async function run() {
      // Frame 1 fades in with a dim standby glow, and the whole stack slowly pushes in
      Animated.parallel([
        Animated.timing(stackOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.18, duration: 400, useNativeDriver: true }),
        Animated.timing(stackScale, { toValue: 1.06, duration: 260 + MONTAGE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      await sleep(260);

      for (let i = 0; i < SCHEDULE.length; i++) {
        if (cancelled) return;
        if (SCHEDULE[i].hold > 0) await sleep(SCHEDULE[i].hold);
        if (cancelled) return;
        await flipTo(i + 1, SCHEDULE[i].flip);
      }
      if (!cancelled) runFinale();
    }

    run();
    return () => { cancelled = true; };
  }, []);

  const frontRotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-110deg'] });
  const backRotateY  = flip.interpolate({ inputRange: [0, 1], outputRange: ['110deg', '0deg'] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity  = flip.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View style={styles.container}>
      {/* Off-screen decode warm-up so the riffle never catches an undecoded frame */}
      <View style={styles.preload} pointerEvents="none">
        {FRAMES.map((src, i) => (
          <Image key={i} source={src} style={styles.preloadImg} />
        ))}
      </View>

      <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
        <View style={styles.iconStage}>
          <Animated.View
            style={[styles.glowWrap, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
            pointerEvents="none">
            <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
              <Defs>
                <RadialGradient id="introGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#8B5CFF" stopOpacity="0.55" />
                  <Stop offset="45%" stopColor="#6B2FD9" stopOpacity="0.28" />
                  <Stop offset="100%" stopColor="#2D1469" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#introGlow)" />
            </Svg>
          </Animated.View>

          <Animated.View style={[styles.iconClip, { opacity: stackOpacity, transform: [{ scale: stackScale }] }]}>
            <Animated.Image
              source={FRAMES[frontIndex]}
              style={[styles.face, { opacity: frontOpacity, transform: [{ perspective: 900 }, { rotateY: frontRotateY }] }]}
              resizeMode="cover"
            />
            <Animated.Image
              source={FRAMES[backIndex]}
              style={[styles.face, { opacity: backOpacity, transform: [{ perspective: 900 }, { rotateY: backRotateY }] }]}
              resizeMode="cover"
            />
            <Animated.View style={[styles.flash, { opacity: flash }]} pointerEvents="none" />
            <Animated.View
              style={[styles.shine, { transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}
              pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.titleRow, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Text style={styles.titleWhite}>Manga</Text>
          <Text style={styles.titlePurple}>Recs</Text>
        </Animated.View>
        <Animated.Text style={[styles.slogan, { opacity: sloganOpacity, transform: [{ translateY: sloganY }] }]}>
          Your next story, recommended.
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  preload: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  preloadImg: { position: 'absolute', width: ICON_SIZE, height: ICON_SIZE },
  content: { alignItems: 'center', justifyContent: 'center' },
  iconStage: { width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' },
  glowWrap: {
    position: 'absolute',
    left: (ICON_SIZE - GLOW_SIZE) / 2,
    top: (ICON_SIZE - GLOW_SIZE) / 2,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  iconClip: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
    overflow: 'hidden',
  },
  face: { position: 'absolute', width: ICON_SIZE, height: ICON_SIZE, backfaceVisibility: 'hidden' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#B18CFF' },
  shine: {
    position: 'absolute',
    width: 70,
    height: ICON_SIZE * 1.6,
    top: -ICON_SIZE * 0.3,
    left: 0,
  },
  titleRow: { flexDirection: 'row', marginTop: 22 },
  titleWhite: { fontFamily: 'MangaRecsBrand', textTransform: 'uppercase', color: '#FFFFFF', fontSize: 30, letterSpacing: 0.5 },
  titlePurple: {
    fontFamily: 'MangaRecsBrand', textTransform: 'uppercase', color: '#B18CFF', fontSize: 30, letterSpacing: 0.5,
    textShadowColor: '#9B6BFF', textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 },
  },
  slogan: { color: '#9C99B8', fontSize: 14, marginTop: 12, letterSpacing: 0.3 },
});
