import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useTheme } from '../utils/ThemeContext';
import { CHANGELOG } from '../utils/changelog';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const SEEN_KEY = '@mangarecs/whatsnew_auto_shown_version';

// Auto-popup twin of the "What's New" modal in SettingsScreen.js's About
// section — same CHANGELOG data and visual language, but shows itself once
// per version bump instead of waiting for the user to go dig for it. Mount
// once, only once the user is actually inside the app (past onboarding/auth).
export default function WhatsNewModal() {
  const { colors } = useTheme();
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    const current = CHANGELOG.find((e) => e.version === APP_VERSION);
    if (!current) return;
    AsyncStorage.getItem(SEEN_KEY).then((lastShown) => {
      if (lastShown !== APP_VERSION) setEntry(current);
    });
  }, []);

  function dismiss() {
    AsyncStorage.setItem(SEEN_KEY, APP_VERSION).catch(() => {});
    setEntry(null);
  }

  if (!entry) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>What's New</Text>
              <View style={styles.versionPill}>
                <Text style={styles.versionPillText}>v{entry.version}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.date, { color: colors.muted }]}>{entry.date}</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {entry.highlights.map((h, i) => (
              <View key={i} style={styles.row}>
                <Ionicons name="checkmark-circle" size={13} color="#7B5CFF" style={{ marginTop: 1.5 }} />
                <Text style={[styles.itemText, { color: colors.text }]}>{h}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: 'bold' },
  versionPill: { backgroundColor: 'rgba(123,92,255,0.14)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  versionPillText: { color: '#7B5CFF', fontSize: 11, fontWeight: '700' },
  date: { fontSize: 11, marginTop: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 9 },
  itemText: { fontSize: 12.5, lineHeight: 17.5, flex: 1, flexShrink: 1 },
  btn: { backgroundColor: '#7B5CFF', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
