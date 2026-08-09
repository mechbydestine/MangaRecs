import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Rect, Circle, Mask, Defs } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useCoachmarkRegistry } from '../utils/CoachmarkContext';
import { light as hapticLight, success as hapticSuccess } from '../utils/haptics';
import { useReducedMotion } from '../utils/a11y';

export const COACHMARK_SEEN_KEY = '@mangarecs/coachmarks_seen';

// Five-to-seven-hint spotlight tour of real navigation, not a full-screen
// carousel — each step dims the app and pokes a hole around one live button.
const STEPS = [
  { key: 'tab-Feed', title: 'Home', description: 'Your personalized feed — trending series and updates from people you follow.' },
  { key: 'header-search', title: 'Search', description: 'Find any manga, manhwa, or manhua by title.' },
  { key: 'tab-Library', title: 'Library', description: 'Everything you’re reading, bookmarked, or finished, all in one place.' },
  { key: 'tab-Social', title: 'Social', description: 'See what friends are reading and join the conversation.' },
  { key: 'tab-For You', title: 'AI Recommendations', description: 'Personalized picks tuned to your taste — rate a few series to sharpen it.' },
  { key: 'tab-Profile', title: 'Profile', description: 'Your stats, badges, streaks, and settings live here.' },
];

const TOOLTIP_WIDTH = 260;
const ESTIMATED_TOOLTIP_HEIGHT = 150;
const MEASURE_DELAY_MS = 220;

function PulseRing({ cx, cy, radius }) {
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
  }, [cx, cy, radius, reduced, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });
  const size = radius * 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - radius,
        top: cy - radius,
        width: size,
        height: size,
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
  const registry = useCoachmarkRegistry();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState('touring'); // 'touring' | 'finale'
  const [targetRect, setTargetRect] = useState(null);
  const cancelledRef = useRef(false);

  const tourVisible = registry?.tourVisible;

  async function finish() {
    try { await AsyncStorage.setItem(COACHMARK_SEEN_KEY, 'true'); } catch (_) {}
    registry?.hideTour();
    // Reset for the next time it's opened (e.g. replayed from Settings).
    setPhase('touring');
    setStepIndex(0);
    setTargetRect(null);
  }

  // Measure the current step's real on-screen target every time the tour
  // opens or moves to a new step. If a target can't be found (e.g. this
  // build's tab names changed), skip it instead of stalling the tour.
  useEffect(() => {
    if (!tourVisible || phase !== 'touring') return;
    cancelledRef.current = false;
    setTargetRect(null);
    const step = STEPS[stepIndex];
    if (!step) { setPhase('finale'); return; }
    const t = setTimeout(async () => {
      const rect = await registry?.measureTarget(step.key);
      if (cancelledRef.current) return;
      if (!rect) {
        if (stepIndex + 1 < STEPS.length) setStepIndex((i) => i + 1);
        else setPhase('finale');
        return;
      }
      setTargetRect(rect);
    }, MEASURE_DELAY_MS);
    return () => { cancelledRef.current = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourVisible, phase, stepIndex]);

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

  let cx = 0, cy = 0, radius = 0, tooltipTop = 0, tooltipLeft = 0, pointerAbove = true;
  if (showSpotlight) {
    cx = targetRect.x + targetRect.width / 2;
    cy = targetRect.y + targetRect.height / 2;
    radius = Math.max(targetRect.width, targetRect.height) / 2 + 14;
    // pointerAbove = true means the TARGET sits above the tooltip (tooltip
    // drawn below it), so the tooltip's own pointer nub goes on its top edge.
    pointerAbove = cy < screenH * 0.5;
    tooltipTop = pointerAbove
      ? cy + radius + 18
      : Math.max(cy - radius - 18 - ESTIMATED_TOOLTIP_HEIGHT, 60);
    tooltipLeft = Math.min(Math.max(cx - TOOLTIP_WIDTH / 2, 16), screenW - TOOLTIP_WIDTH - 16);
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={handleSkip}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="spotlight" maskUnits="userSpaceOnUse" x={0} y={0} width={screenW} height={screenH}>
              <Rect x={0} y={0} width={screenW} height={screenH} fill="#fff" />
              {showSpotlight && <Circle cx={cx} cy={cy} r={radius} fill="#000" />}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={screenW} height={screenH} fill="rgba(4,4,8,0.82)" mask="url(#spotlight)" />
        </Svg>

        {showSpotlight && <PulseRing cx={cx} cy={cy} radius={radius} />}

        {phase === 'touring' && (
          <TouchableOpacity style={styles.skipCorner} onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipCornerText}>{t('common.skip')}</Text>
          </TouchableOpacity>
        )}

        {showSpotlight && step && (
          <View style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border, top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH }]}>
            {!pointerAbove && <View style={[styles.nubPointingDown, { borderTopColor: colors.card }]} />}
            <Text style={[styles.stepCount, { color: colors.textSecondary }]}>{stepIndex + 1}/{STEPS.length}</Text>
            <Text style={[styles.tooltipTitle, { color: colors.primary }]}>{step.title}</Text>
            <Text style={[styles.tooltipDesc, { color: colors.text }]}>{step.description}</Text>
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={handleNext} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>{stepIndex + 1 < STEPS.length ? 'Next' : 'Got it'}</Text>
            </TouchableOpacity>
            {pointerAbove && <View style={[styles.nubPointingUp, { borderBottomColor: colors.card }]} />}
          </View>
        )}

        {phase === 'finale' && (
          <View style={styles.finaleWrap}>
            <View style={[styles.finaleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="sparkles" size={32} color={colors.primary} />
              <Text style={[styles.finaleTitle, { color: colors.text }]}>{t('coachmark.allSet')}</Text>
              <Text style={[styles.finaleSub, { color: colors.textSecondary }]}>{t('coachmark.allSetSub')}</Text>
              <TouchableOpacity style={[styles.finaleBtn, { backgroundColor: colors.primary }]} onPress={handleDone} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>{t('coachmark.letsGo')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  skipCorner: { position: 'absolute', top: 54, right: 20 },
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
  nextBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Points UP toward a target above the tooltip — wide edge merges into the
  // tooltip's top border, apex sticks up above it.
  nubPointingUp: {
    position: 'absolute', top: -8, left: '50%', marginLeft: -8,
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  // Points DOWN toward a target below the tooltip.
  nubPointingDown: {
    position: 'absolute', bottom: -8, left: '50%', marginLeft: -8,
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  finaleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  finaleCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center' },
  finaleTitle: { fontSize: 20, fontWeight: '800', marginTop: 14, marginBottom: 6 },
  finaleSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  finaleBtn: { width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
