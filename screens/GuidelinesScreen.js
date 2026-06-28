import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const GUIDELINES = [
  {
    emoji: '💬',
    title: 'Text-only discussions',
    desc: 'Share thoughts, theories, and reviews in text. No uploading or linking manga pages.',
  },
  {
    emoji: '🚫',
    title: 'No piracy links',
    desc: 'Do not post links to pirated chapters, unauthorized scanlations, or illegal downloads.',
  },
  {
    emoji: '🖼️',
    title: 'Original profile images only',
    desc: 'Only upload images you own or have clear rights to use. No copyrighted character art.',
  },
  {
    emoji: '🚩',
    title: 'Report violations',
    desc: 'Use the report button on any content that breaks these rules — we review every report.',
  },
  {
    emoji: '🔗',
    title: 'Your URLs, your responsibility',
    desc: 'You are solely responsible for any links you share. Panelr is not liable for third-party content.',
  },
  {
    emoji: '🤝',
    title: 'Be respectful',
    desc: 'Treat every reader with respect. Harassment and hate speech will result in a permanent ban.',
  },
];

// Used in two modes:
// - Gate mode (onComplete prop): shown once at first login, bottom Agree button
// - Info mode (navigation prop): navigated to from Settings, top Close button
export default function GuidelinesScreen({ onComplete, navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const isInfoMode = !onComplete && !!navigation;

  async function handleAgree() {
    setLoading(true);
    try {
      await AsyncStorage.setItem('@panelr/guidelines_accepted', 'true');
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.from('profiles').upsert({
          id: user.id,
          accepted_guidelines: true,
          guidelines_accepted_at: new Date().toISOString(),
        });
      }
    } catch (_) {}
    setLoading(false);
    onComplete();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {isInfoMode && (
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}>

        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <Ionicons name="book" size={28} color="#fff" />
          </View>
          <Text style={styles.logoText}>Panelr</Text>
        </View>

        <Text style={styles.title}>Community Guidelines</Text>
        <Text style={styles.subtitle}>
          {isInfoMode
            ? 'Our community standards keep Panelr a great place for every reader.'
            : 'Before you enter, please read and agree to our community standards. These rules keep Panelr a great place for every reader.'}
        </Text>

        {GUIDELINES.map((g) => (
          <View key={g.title} style={styles.card}>
            <Text style={styles.cardEmoji}>{g.emoji}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{g.title}</Text>
              <Text style={styles.cardDesc}>{g.desc}</Text>
            </View>
          </View>
        ))}

        <View style={styles.linksRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://panelr.app/privacy')}>
            <Text style={styles.linkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.linkSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://panelr.app/terms')}>
            <Text style={styles.linkText}>Terms of Service</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: isInfoMode ? 40 : 110 }} />
      </ScrollView>

      {!isInfoMode && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.agreeBtn, loading && styles.agreeBtnLoading]}
            onPress={handleAgree}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.agreeBtnText}>I Agree — Let me in</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0F' },
  scroll: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1A1A1F',
    alignItems: 'center', justifyContent: 'center',
  },

  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: '#534AB7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText: { color: '#fff', fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5 },

  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  subtitle: { color: '#9B9AA3', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  card: { flexDirection: 'row', backgroundColor: '#1A1A1F', borderRadius: 14, padding: 16, marginBottom: 10 },
  cardEmoji: { fontSize: 22, marginRight: 14, marginTop: 1 },
  cardBody: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { color: '#9B9AA3', fontSize: 12, lineHeight: 18 },

  linksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  linkText: { color: '#534AB7', fontSize: 12, fontWeight: '500' },
  linkSep: { color: '#9B9AA3', marginHorizontal: 10, fontSize: 12 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0D0D0F',
    borderTopWidth: 1, borderTopColor: '#1A1A1F',
    paddingTop: 16, paddingHorizontal: 24,
  },
  agreeBtn: { backgroundColor: '#534AB7', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  agreeBtnLoading: { opacity: 0.7 },
  agreeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
