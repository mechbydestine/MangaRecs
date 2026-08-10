import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import StarLogo from '../components/StarLogo';
import { HIT_SLOP } from '../utils/tokens';
import { useResponsive } from '../utils/responsive';

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
    emoji: '🔞',
    title: 'Tag mature content honestly',
    desc: 'Keep 18+ series marked as adult content so age verification and filters work correctly for every reader.',
  },
  {
    emoji: '🎭',
    title: 'No spoiler dumping',
    desc: 'Mark major spoilers before posting, and keep chapter-specific reveals inside that chapter\'s discussion.',
  },
  {
    emoji: '🚩',
    title: 'Report violations',
    desc: 'Use the report button on any content that breaks these rules — we review every report.',
  },
  {
    emoji: '🔗',
    title: 'Your URLs, your responsibility',
    desc: 'You are solely responsible for any links you share. MangaRecs is not liable for third-party content.',
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
  const { colors } = useTheme();
  const { isTablet } = useResponsive();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const isInfoMode = !onComplete && !!navigation;

  async function handleAgree() {
    setLoading(true);
    try {
      await AsyncStorage.setItem('@mangarecs/guidelines_accepted', 'true');
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
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {isInfoMode && (
        <View style={styles.topBar}>
          <TouchableOpacity
            hitSlop={HIT_SLOP}
            style={[styles.closeBtn, { backgroundColor: colors.card }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scroll, isTablet && styles.tabletWrap]}
        showsVerticalScrollIndicator={false}
        bounces={false}>

        <View style={styles.logoWrap}>
          <StarLogo size={52} />
          <View style={styles.logoTextRow}>
            <Text style={[styles.logoTextWhite, { color: colors.text }]}>Manga</Text>
            <Text style={[styles.logoTextPurple, { color: colors.primary, textShadowColor: colors.primary }]}>Recs</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{t('nav.guidelines')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isInfoMode
            ? 'Our community standards keep MangaRecs a great place for every reader.'
            : 'Before you enter, please read and agree to our community standards. These rules keep MangaRecs a great place for every reader.'}
        </Text>

        {GUIDELINES.map((g) => (
          <View key={g.title} style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={styles.cardEmoji}>{g.emoji}</Text>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{g.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{g.desc}</Text>
            </View>
          </View>
        ))}

        {isInfoMode && (
          <View style={styles.linksRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Legal', { tab: 'privacy' })}
              accessibilityRole="link"
              accessibilityLabel={t('legal.privacy')}>
              <Text style={[styles.linkText, { color: colors.primary }]}>{t('legal.privacy')}</Text>
            </TouchableOpacity>
            <Text style={[styles.linkSep, { color: colors.textSecondary }]}>·</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Legal', { tab: 'terms' })}
              accessibilityRole="link"
              accessibilityLabel={t('legal.terms')}>
              <Text style={[styles.linkText, { color: colors.primary }]}>{t('legal.termsOfService')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: isInfoMode ? 40 : 110 }} />
      </ScrollView>

      {!isInfoMode && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.agreeBtn, { backgroundColor: colors.primary }, loading && styles.agreeBtnLoading]}
            onPress={handleAgree}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('guidelines.agree')}
            accessibilityState={{ disabled: loading, busy: loading }}>
            {loading
              ? <ActivityIndicator size="small" color={colors.onPrimary} />
              : <Text style={[styles.agreeBtnText, { color: colors.onPrimary }]}>I Agree — Let me in</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Caps the reading measure on iPad — full-width body text at 1024pt is
  // unreadable. Matches the 640 used by every other screen.
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  root: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoTextRow: { flexDirection: 'row', marginTop: 12 },
  logoTextWhite: { fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5 },
  logoTextPurple: {
    fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5,
    textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 },
  },

  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  card: { flexDirection: 'row', borderRadius: 14, padding: 16, marginBottom: 10 },
  cardEmoji: { fontSize: 22, marginRight: 14, marginTop: 1 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { fontSize: 12, lineHeight: 18 },

  linksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  linkText: { fontSize: 12, fontWeight: '500' },
  linkSep: { marginHorizontal: 10, fontSize: 12 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopWidth: 1,
    paddingTop: 16, paddingHorizontal: 24,
  },
  agreeBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  agreeBtnLoading: { opacity: 0.7 },
  agreeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
