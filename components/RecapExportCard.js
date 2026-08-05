// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — the exportable poster
//
// This is deliberately NOT the live Slide 10 — it is a fully static twin
// (no Animated.* components, no loops) rendered off-screen purely so
// react-native-view-shot has something deterministic to capture. Screenshotting
// the live animated finale would risk catching a half-settled spring or a
// mid-loop cover; this always captures the same, finished-looking frame.
//
// `ratio` picks the export shape: 'story' (9:16, Instagram/Snapchat Stories)
// or 'square' (1:1, feed posts). Width/height are passed in explicitly rather
// than relying on CSS aspectRatio, since off-screen layout has to be correct
// the instant view-shot fires — no reflow to wait for.
// ─────────────────────────────────────────────────────────────────────────
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { rgba } from '../utils/recapIdentity';
import { Screentone, Vignette, Stamp } from './RecapStage';

const DISPLAY = 'MangaRecsBrand';

export default function RecapExportCard({ d, id, s, width, height }) {
  const stats = [
    { v: d.chapters, l: 'CHAPTERS' },
    { v: d.series, l: 'SERIES' },
    { v: Math.round(d.hours), l: 'HOURS' },
    { v: d.longest, l: 'DAY STREAK' },
  ];
  const backdrop = d.covers.slice(0, 6);

  return (
    <View style={{ width, height, backgroundColor: s.to, overflow: 'hidden' }}>
      <LinearGradient colors={[s.from, s.to]} style={StyleSheet.absoluteFill} />

      {/* static cover backdrop — no motion, so the capture is deterministic */}
      <View style={StyleSheet.absoluteFill}>
        {backdrop.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={{
              position: 'absolute',
              width: width * 0.36, height: height * 0.24,
              left: (i % 3) * width * 0.34, top: Math.floor(i / 3) * height * 0.26,
              opacity: 0.32, borderRadius: id.mode.radius,
            }}
            contentFit="cover"
          />
        ))}
      </View>
      <Screentone color={s.ink} opacity={s.light ? 0.14 : 0.1} size={6} dot={1.4} />
      <Vignette color={s.to} strength={0.62} />

      <View style={styles.content}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: s.accent }]}>MANGARECAP · {d.period.short.toUpperCase()}</Text>
            <Text style={[styles.name, { color: s.ink }]} numberOfLines={1}>@{d.username}</Text>
            <Text style={[styles.perso, { color: s.accent }]}>{d.personality.title}</Text>
          </View>
          <Stamp text={d.personality.seal} color={s.accent} size={48} rotate={8} />
        </View>

        <View style={styles.grid}>
          {stats.map((x) => (
            <View key={x.l} style={styles.cell}>
              <Text style={[styles.val, { color: s.ink }]}>{x.v}</Text>
              <Text style={[styles.lbl, { color: s.dim }]}>{x.l}</Text>
            </View>
          ))}
        </View>

        {!!d.topSeries.length && (
          <View style={styles.coversRow}>
            {d.topSeries.slice(0, 5).map((x, i) => (
              <View
                key={i}
                style={[styles.coverThumb, { marginLeft: i ? -14 : 0, zIndex: 5 - i, borderColor: rgba(s.ink, 0.3) }]}
              >
                {!!x.cover && <Image source={{ uri: x.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />}
              </View>
            ))}
          </View>
        )}

        <View style={[styles.footRow, { borderTopColor: rgba(s.ink, 0.22) }]}>
          <Text style={[styles.foot, { color: s.dim, flex: 1, marginRight: 8 }]} numberOfLines={1}>{d.dnaCode || 'MANGARECS'}</Text>
          <Text style={[styles.foot, { color: s.accent }]} numberOfLines={1}>mangarecs.net</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 26, justifyContent: 'flex-end' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.6 },
  name: { fontFamily: DISPLAY, fontSize: 24, marginTop: 6 },
  perso: { fontSize: 13, fontWeight: '900', letterSpacing: 0.4, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  cell: { width: '50%', marginBottom: 14 },
  val: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: -1 },
  lbl: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.4, marginTop: -2 },
  coversRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  coverThumb: { width: 46, height: 66, borderWidth: 1.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12 },
  foot: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
});
