import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#7B5CFF';

const STEPS = [
  {
    icon: 'home',
    title: 'Discover on the Feed',
    desc: "Browse trending manga, dive into discussions, and see what other readers are talking about right now.",
  },
  {
    icon: 'book',
    title: 'Read Anywhere, Track Everything',
    desc: "Open any chapter right in the app. Your Library keeps score of what you're reading, completed, and bookmarked.",
  },
  {
    icon: 'sparkles',
    title: 'Get Picks Made For You',
    desc: "Rate series and swipe through Recs to fine-tune your taste — the more you use it, the better it gets.",
  },
];

export default function FeatureTutorialScreen({ onComplete }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onComplete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name={current.icon} size={40} color={ACCENT} />
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.desc}>{current.desc}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => (isLast ? onComplete() : setStep((s) => s + 1))}
          activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
          {!isLast && <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0812', justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20 },
  skipText: { color: '#8A8894', fontSize: 14, fontWeight: '600' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(123,92,255,0.14)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  desc: { color: '#B3AFC9', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  footer: { paddingHorizontal: 24, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotActive: { backgroundColor: ACCENT, width: 22 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, width: '100%',
  },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
