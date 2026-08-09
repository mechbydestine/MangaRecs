import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, StyleSheet, Easing } from 'react-native';
import BadgeIcon from './BadgeIcon';
import { BADGE_GRADES, GRADE_ORDER, ensureBadgeRarity, formatRarity } from '../utils/badges';
import { useProfile } from '../utils/ProfileContext';
import { medium as hapticMedium, heavy as hapticHeavy, success as hapticSuccess } from '../utils/haptics';
import { maybeAskForReview } from '../utils/reviewPrompt';
import { useT } from '../utils/LanguageContext';
import { useReducedMotion } from '../utils/a11y';

// Full-screen unlock ceremony. The spectacle scales with the tier: Bronze gets
// a clean pop, Diamond+ adds a particle burst, Mythic gets the full show.
// Mounted once in App.js; fed by ProfileContext.newBadges.

const PARTICLE_COUNT = { 4: 10, 5: 14, 6: 20 }; // rank → burst dots (Diamond/Master/Mythic)

function ParticleBurst({ color, count, radius }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.35 : 0);
        const dist = radius * (0.75 + (i % 3) * 0.25);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: '50%', top: '50%',
              width: i % 3 === 0 ? 7 : 5, height: i % 3 === 0 ? 7 : 5,
              borderRadius: 4, backgroundColor: color,
              opacity: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

export default function BadgeCeremony() {
  const { newBadges, clearNewBadges, setCeremonyActive } = useProfile();
  const t = useT();
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [, setRarityReady] = useState(false);

  const scale    = useRef(new Animated.Value(0)).current;
  const glow     = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const spin     = useRef(new Animated.Value(0)).current;
  const reduced  = useReducedMotion();

  useEffect(() => { ensureBadgeRarity().then(() => setRarityReady(true)); }, []);

  // Pull pending unlocks into a local queue so the context can keep collecting
  useEffect(() => {
    if (newBadges.length === 0) return;
    setQueue((prev) => {
      const seen = new Set(prev.map((b) => b.id));
      return [...prev, ...newBadges.filter((b) => !seen.has(b.id))];
    });
    clearNewBadges();
    setCeremonyActive(true);
  }, [newBadges]);

  const badge = queue[index];
  const rank = badge ? Math.max(0, GRADE_ORDER.indexOf(badge.grade)) : 0;

  // Play the reveal each time a new badge takes the stage — bigger tier, bigger show
  useEffect(() => {
    if (!badge) return;
    scale.setValue(0);
    glow.setValue(0);
    textFade.setValue(0);
    spin.setValue(0);
    (rank >= 4 ? hapticHeavy : hapticMedium)();
    // Reduce Motion: present the badge already landed rather than springing,
    // pulsing and (at Mythic) rotating a halo. The reward still arrives — the
    // haptic above still fires and the card is fully readable — it just does
    // not perform. Nothing here gates dismissal, so the queue advances the same.
    if (reduced) {
      scale.setValue(1);
      glow.setValue(0.7);
      textFade.setValue(1);
      const tq = setTimeout(hapticSuccess, 420);
      return () => clearTimeout(tq);
    }
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: Math.max(5, 11 - rank),      // higher tier = bouncier landing
        stiffness: 130 + rank * 15,
        mass: 0.9,
      }),
      Animated.parallel([
        Animated.timing(textFade, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glow, { toValue: 1, duration: 900 - rank * 60, useNativeDriver: true }),
            Animated.timing(glow, { toValue: 0.35, duration: 900 - rank * 60, useNativeDriver: true }),
          ]),
          { iterations: 3 + rank }
        ),
        // Mythic: slow halo rotation under everything
        ...(rank >= 6 ? [Animated.loop(
          Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
        )] : []),
      ]),
    ]).start();
    const t = setTimeout(hapticSuccess, 420);
    const t2 = rank >= 5 ? setTimeout(hapticHeavy, 650) : null;
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); };
  }, [badge?.id, reduced]);

  if (!badge) return null;

  const grade = BADGE_GRADES[badge.grade] || BADGE_GRADES.grey;
  const isLast = index >= queue.length - 1;
  const rarity = formatRarity(badge);
  const haloBase = 200 + rank * 26;
  const particles = PARTICLE_COUNT[rank] || 0;

  function advance() {
    if (isLast) {
      // Diamond+ is a genuine milestone worth asking after — anything lower
      // unlocks too often and would turn the review prompt into a nag.
      if (rank >= 4) setTimeout(maybeAskForReview, 900);
      setQueue([]);
      setIndex(0);
      setCeremonyActive(false);
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={advance}>
      <View style={styles.overlay}>
        {/* tier glow halo — grows with rank */}
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, {
            width: haloBase, height: haloBase, borderRadius: haloBase / 2,
            backgroundColor: grade.glow || grade.bg,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.28 + rank * 0.05] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18 + rank * 0.04] }) }],
          }]}
        />
        {/* Mythic: rotating outer ring */}
        {rank >= 6 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.mythicRing, {
              borderColor: grade.border,
              transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }]}
          />
        )}

        <View style={styles.stage}>
          {particles > 0 && !reduced && <ParticleBurst color={grade.color} count={particles} radius={130 + rank * 12} />}
          <Animated.View style={{ transform: [{ scale }] }}>
            <BadgeIcon badge={badge} size={150 + rank * 6} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.textBlock, { opacity: textFade }]}>
          <Text style={styles.unlockedLabel}>{t('badge.unlocked')}</Text>
          <Text style={[styles.badgeName, { color: grade.color }]}>{badge.name}</Text>
          <Text style={styles.badgeDesc}>{badge.desc}</Text>
          <View style={[styles.tierChip, { backgroundColor: grade.bg, borderColor: grade.border }]}>
            <Text style={[styles.tierChipText, { color: grade.color }]}>{grade.label}</Text>
          </View>
          {rarity && (
            <Text style={[styles.rarityText, { color: grade.color }]}>{rarity}</Text>
          )}
          {queue.length > 1 && (
            <Text style={styles.queueCount}>{index + 1} of {queue.length}</Text>
          )}
        </Animated.View>

        <TouchableOpacity style={[styles.continueBtn, { borderColor: grade.border }]} onPress={advance} activeOpacity={0.8}>
          <Text style={[styles.continueText, { color: grade.color }]}>{isLast ? 'Continue' : 'Next badge'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,5,8,0.94)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  halo: { position: 'absolute' },
  mythicRing: { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 1.5, borderStyle: 'dashed', opacity: 0.4 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  textBlock: { alignItems: 'center', marginTop: 26 },
  unlockedLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  badgeName: { fontSize: 24, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  badgeDesc: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  tierChip: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  tierChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  rarityText: { fontSize: 12, fontWeight: '700', marginTop: 10 },
  queueCount: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 10 },
  continueBtn: { marginTop: 34, paddingHorizontal: 34, paddingVertical: 11, borderRadius: 22, borderWidth: 1.5 },
  continueText: { fontSize: 14, fontWeight: '700' },
});
