import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Modal, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Rect, Mask, Defs } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useCoachmarkRegistry } from '../utils/CoachmarkContext';
import { light as hapticLight, success as hapticSuccess } from '../utils/haptics';
import { useReducedMotion } from '../utils/a11y';

export const COACHMARK_SEEN_KEY = '@mangarecs/coachmarks_seen';

// Six-hint spotlight tour of real navigation, not a full-screen carousel —
// each step dims the app and cuts a hole around one live button.
//
// `key` must match what the target registers via useCoachmarkTarget. Tab keys
// are built from the Tab.Screen route names in App.js (`tab-${route.name}`),
// so renaming a tab there renames its coachmark target with it. That drifted
// once: two steps still pointed at 'tab-Social' and 'tab-For You' long after
// those tabs became Community and Discover, and since a missing target skips
// its step, a third of the tour had quietly stopped existing.
const STEPS = [
  { key: 'tab-Feed',      title: 'coachmark.homeTitle',      desc: 'coachmark.homeDesc' },
  { key: 'header-search', title: 'coachmark.searchTitle',    desc: 'coachmark.searchDesc' },
  { key: 'tab-Library',   title: 'coachmark.libraryTitle',   desc: 'coachmark.libraryDesc' },
  { key: 'tab-Discover',  title: 'coachmark.discoverTitle',  desc: 'coachmark.discoverDesc' },
  { key: 'tab-Community', title: 'coachmark.communityTitle', desc: 'coachmark.communityDesc' },
  { key: 'tab-Profile',   title: 'coachmark.profileTitle',   desc: 'coachmark.profileDesc' },
];

const TOOLTIP_MAX_W = 300;
// Only used for the single frame before the tooltip reports its real height;
// it stays invisible until then, so this never places anything the user sees.
const ESTIMATED_TOOLTIP_H = 160;
const MEASURE_DELAY_MS = 150;
const SPOT_PAD = 8;    // breathing room between the button and the hole's edge
const SPOT_RADIUS = 14;
const GAP = 16;        // spotlight edge to tooltip
const EDGE = 16;       // tooltip to screen edge
const NUB = 8;         // half the pointer nub's width

function PulseRing({ x, y, w, h, radius }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    pulse.setValue(0);
    // The ring is a pointer, not decoration — with motion off it stays drawn
    // at its resting size so the coachmark still indicates what it is about.
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [x, y, w, h, reduced, pulse]);

  // Scales from the ring's own centre, so it expands evenly around the target
  // whatever the target's shape — a wide tab button included.
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: radius,
        borderWidth: 2,
        borderColor: '#fff',
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

export default function CoachmarkOverlay() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const registry = useCoachmarkRegistry();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState('touring'); // 'touring' | 'finale'
  const [targetRect, setTargetRect] = useState(null);
  // Real laid-out height of the current step's tooltip. Placement needs it to
  // decide whether the thing fits above the target, and guessing was how the
  // tooltip ended up half off-screen on short phones and floating miles from
  // its target on tall ones.
  const [tooltipH, setTooltipH] = useState(0);
  const cancelledRef = useRef(false);

  const tourVisible = registry?.tourVisible;

  async function finish() {
    try { await AsyncStorage.setItem(COACHMARK_SEEN_KEY, 'true'); } catch (_) {}
    registry?.hideTour();
    // Reset for the next time it's opened (e.g. replayed from Settings).
    setPhase('touring');
    setStepIndex(0);
    setTargetRect(null);
    setTooltipH(0);
  }

  // Measure the current step's real on-screen target every time the tour
  // opens, moves to a new step, or the window changes size (rotation, split
  // screen, a foldable opening) — a rect measured at the old size would put
  // the spotlight somewhere the button no longer is. measureTarget retries on
  // its own, so a target that simply hasn't laid out yet is waited for; only
  // one that genuinely isn't in this build skips its step.
  useEffect(() => {
    if (!tourVisible || phase !== 'touring') return undefined;
    cancelledRef.current = false;
    setTargetRect(null);
    setTooltipH(0);
    const step = STEPS[stepIndex];
    if (!step) { setPhase('finale'); return undefined; }
    const timer = setTimeout(async () => {
      const rect = await registry?.measureTarget(step.key);
      if (cancelledRef.current) return;
      if (!rect) {
        if (stepIndex + 1 < STEPS.length) setStepIndex((i) => i + 1);
        else setPhase('finale');
        return;
      }
      setTargetRect(rect);
    }, MEASURE_DELAY_MS);
    return () => { cancelledRef.current = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourVisible, phase, stepIndex, screenW, screenH]);

  if (!tourVisible) return null;

  function handleNext() {
    hapticLight();
    if (stepIndex + 1 < STEPS.length) setStepIndex((i) => i + 1);
    else setPhase('finale');
  }

  function handleSkip() {
    finish();
  }

  function handleDone() {
    hapticSuccess();
    finish();
  }

  const step = STEPS[stepIndex];
  const showSpotlight = phase === 'touring' && !!targetRect;

  // Everything below is derived from the measured rect and the live window
  // size — no fixed pixel positions anywhere, which is what lets one layout
  // land correctly on a small phone, a tall one, and a tablet.
  const tooltipW = Math.min(TOOLTIP_MAX_W, screenW - EDGE * 2);
  let spot = null;
  let tooltipTop = 0;
  let tooltipLeft = 0;
  let nubLeft = 0;
  let nubBelow = false;
  if (showSpotlight) {
    const x = Math.max(0, targetRect.x - SPOT_PAD);
    const y = Math.max(0, targetRect.y - SPOT_PAD);
    spot = {
      x,
      y,
      w: Math.min(screenW - x, targetRect.width + SPOT_PAD * 2),
      h: Math.min(screenH - y, targetRect.height + SPOT_PAD * 2),
    };
    // A rounded rect traces the button itself. A circle around a wide target
    // (a tab button is roughly 70x50) has to be big enough to swallow the
    // corners, so it always reads as pointing at a region rather than at the
    // control — which is exactly the "that isn't where the button is" feel.
    spot.radius = Math.min(SPOT_RADIUS, spot.w / 2, spot.h / 2);

    const height = tooltipH || ESTIMATED_TOOLTIP_H;
    const topLimit = insets.top + EDGE;
    const bottomLimit = screenH - insets.bottom - EDGE;
    const roomBelow = bottomLimit - (spot.y + spot.h) - GAP;
    const roomAbove = spot.y - GAP - topLimit;
    // Below the target when it fits there; otherwise above; and if neither
    // side fits (a short window), whichever has more room, clamped in place.
    const placeBelow = roomBelow >= height || roomBelow >= roomAbove;
    nubBelow = !placeBelow;
    tooltipTop = placeBelow ? spot.y + spot.h + GAP : spot.y - GAP - height;
    tooltipTop = Math.max(topLimit, Math.min(tooltipTop, bottomLimit - height));

    const cx = targetRect.x + targetRect.width / 2;
    tooltipLeft = Math.max(EDGE, Math.min(cx - tooltipW / 2, screenW - EDGE - tooltipW));
    // The nub tracks the target's centre inside the clamped tooltip, so an
    // edge tab (Home, Profile) still gets a pointer aimed at its button
    // instead of one stuck under the middle of the card.
    nubLeft = Math.max(14, Math.min(cx - tooltipLeft - NUB, tooltipW - 14 - NUB * 2));
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={handleSkip}>
      <View style={StyleSheet.absoluteFill}>
        {/* Anywhere on the dimmed area advances — the tooltip's button is the
            discoverable way through, but nobody should have to hunt for it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={phase === 'touring' ? handleNext : undefined}
          accessible={false}>
          <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Mask id="spotlight" maskUnits="userSpaceOnUse" x={0} y={0} width={screenW} height={screenH}>
                <Rect x={0} y={0} width={screenW} height={screenH} fill="#fff" />
                {showSpotlight && (
                  <Rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx={spot.radius} ry={spot.radius} fill="#000" />
                )}
              </Mask>
            </Defs>
            <Rect x={0} y={0} width={screenW} height={screenH} fill="rgba(4,4,8,0.82)" mask="url(#spotlight)" />
          </Svg>
        </Pressable>

        {showSpotlight && <PulseRing x={spot.x} y={spot.y} w={spot.w} h={spot.h} radius={spot.radius} />}

        {phase === 'touring' && (
          <TouchableOpacity
            style={[styles.skipCorner, { top: insets.top + 12 }]}
            onPress={handleSkip}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipCornerText}>{t('common.skip')}</Text>
          </TouchableOpacity>
        )}

        {showSpotlight && step && (
          <View
            onLayout={(e) => setTooltipH(e.nativeEvent.layout.height)}
            style={[
              styles.tooltip,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                top: tooltipTop,
                left: tooltipLeft,
                width: tooltipW,
                // Hidden for the one frame between mounting and reporting its
                // height, so the tooltip is never seen at the estimated
                // position before snapping to the real one.
                opacity: tooltipH ? 1 : 0,
              },
            ]}>
            {nubBelow && <View style={[styles.nubPointingDown, { left: nubLeft, borderTopColor: colors.card }]} />}
            <Text style={[styles.stepCount, { color: colors.textSecondary }]}>{stepIndex + 1}/{STEPS.length}</Text>
            <Text style={[styles.tooltipTitle, { color: colors.primary }]}>{t(step.title)}</Text>
            <Text style={[styles.tooltipDesc, { color: colors.text }]}>{t(step.desc)}</Text>
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={handleNext}
              accessibilityRole="button"
              activeOpacity={0.85}>
              <Text style={[styles.nextBtnText, { color: colors.onPrimary }]}>
                {stepIndex + 1 < STEPS.length ? t('common.next') : t('coachmark.gotIt')}
              </Text>
            </TouchableOpacity>
            {!nubBelow && <View style={[styles.nubPointingUp, { left: nubLeft, borderBottomColor: colors.card }]} />}
          </View>
        )}

        {phase === 'finale' && (
          <View style={styles.finaleWrap}>
            <View style={[styles.finaleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="sparkles" size={32} color={colors.primary} />
              <Text style={[styles.finaleTitle, { color: colors.text }]}>{t('coachmark.allSet')}</Text>
              <Text style={[styles.finaleSub, { color: colors.textSecondary }]}>{t('coachmark.allSetSub')}</Text>
              <TouchableOpacity
                style={[styles.finaleBtn, { backgroundColor: colors.primary }]}
                onPress={handleDone}
                accessibilityRole="button"
                activeOpacity={0.85}>
                <Text style={[styles.nextBtnText, { color: colors.onPrimary }]}>{t('coachmark.letsGo')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  skipCorner: { position: 'absolute', right: 20 },
  skipCornerText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  tooltip: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  stepCount: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  tooltipTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  tooltipDesc: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  nextBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  nextBtnText: { fontSize: 13, fontWeight: '700' },
  // Points UP toward a target above the tooltip — wide edge merges into the
  // tooltip's top border, apex sticks up above it. `left` is set inline so the
  // nub can follow the target rather than sitting at a fixed 50%.
  nubPointingUp: {
    position: 'absolute', top: -8,
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  // Points DOWN toward a target below the tooltip.
  nubPointingDown: {
    position: 'absolute', bottom: -8,
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  finaleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  finaleCard: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center' },
  finaleTitle: { fontSize: 20, fontWeight: '800', marginTop: 14, marginBottom: 6 },
  finaleSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  finaleBtn: { width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
