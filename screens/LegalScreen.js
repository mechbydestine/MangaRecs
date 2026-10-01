import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useResponsive } from '../utils/responsive';

const LAST_UPDATED = 'October 1, 2026';

const PRIVACY_SECTIONS = [
  {
    title: 'What we collect',
    body:
      'Account info (email, username, avatar/banner images you upload), reading activity (series read, progress, streaks, hours read), content you post (comments, direct messages, friend connections), and a device push-notification token if you enable notifications. We do not collect precise location, contacts, or browsing history outside the app.',
  },
  {
    title: 'How we use it',
    body:
      'To run your account (auth, profile, friends, messages), to personalize recommendations (genre preferences learned from what you read, like, and save), to show your reading stats and badges to you and friends you connect with, and to send optional push notifications (new chapters, friend requests, messages).',
  },
  {
    title: 'Third parties',
    body:
      'Reading content and cover art are fetched live from the MangaDex API — the pages you read are served directly from MangaDex/its mirrors, not stored by us except when you explicitly download a chapter for offline reading. Account data, images, and messages are stored with Supabase, our database and file-storage provider. If you choose to import a list, we send the username you enter to AniList (public GraphQL API) or, for MyAnimeList, to Jikan; we send nothing else and no credentials. When crash reporting is enabled in a build, we use Sentry to receive crash and error reports, which include your signed-in user ID so we can tell whether a crash affected one account or many. We do not sell your data or share it with advertisers.',
  },
  {
    title: 'Your choices',
    body:
      'You can turn off AI recommendations, notifications, and adult-content filtering in Settings. You can block another user to stop them from messaging you or seeing your activity. You can delete your account at any time from Settings → Account — this permanently removes your profile, messages, friendships, comments, and uploaded images.',
  },
  {
    title: 'Data retention',
    body:
      'Account data, reading activity, and posted content are kept while your account is active. Deleting your account removes your profile, messages, friendships, comments, and uploaded images immediately and permanently; this cannot be undone. Crash reports are retained by Sentry for up to 90 days. Backups that may still contain deleted records are rotated out within 30 days. We keep nothing after that except where the law requires it.',
  },
  {
    title: 'Your rights',
    body:
      'Wherever you live, you can see your data, correct it, export it, or delete it — Settings covers most of this directly, and anything else you can request at support@mangarecs.net. If you are in the EU, UK, or EEA, you also have the right to object to or restrict processing, the right to data portability, and the right to complain to your local data-protection authority. If you are in California, you have the right to know what we collect, the right to delete it, and the right to opt out of sale or sharing — we do not sell or share personal information, so there is nothing to opt out of. We will not treat you differently for exercising any of these rights.',
  },
  {
    title: "Children's privacy",
    body:
      'MangaRecs is not directed at children under 13. Adult (18+) content is opt-in, gated behind an age check, and disabled by default.',
  },
  {
    title: 'Contact',
    body: 'Questions about this policy? Reach us at support@mangarecs.net.',
  },
];

const TERMS_SECTIONS = [
  {
    title: 'Using MangaRecs',
    body:
      'MangaRecs is a manga/webtoon discovery and social app. You must be at least 13 years old to use it, and old enough to do so under the laws of your country if that age is higher. Adult (18+) content is opt-in and gated behind a separate age check. You’re responsible for keeping your account credentials secure.',
  },
  {
    title: 'Content you post',
    body:
      'You own what you post (comments, bios, uploaded images) but grant us a license to display it within the app to the users you share it with. Do not post pirated download links, copyrighted character art you don’t have rights to, harassment, or spam — see Community Guidelines for the full list. We may remove content or suspend accounts that violate these rules.',
  },
  {
    title: 'Third-party reading content',
    body:
      'Manga/webtoon pages shown in the reader are sourced from MangaDex and, in the in-app browser mode, from third-party manga sites. MangaRecs does not host or claim ownership of this content and is not responsible for its availability or accuracy.',
  },
  {
    title: 'Copyright and DMCA',
    body:
      'MangaRecs does not host manga or webtoon pages. If you own the rights to a work and believe a catalog listing or something a user posted infringes them, email support@mangarecs.net with: the work you own, where in MangaRecs you saw it, your contact details, a statement that you believe in good faith the use is unauthorized, a statement that the information is accurate and that you are the owner or authorized to act for them, and your signature (typing your name is fine). We remove or disable infringing material we can verify and will tell the user who posted it, who may send a counter-notice. Repeat infringers lose their accounts. Creator uploads are covered by the same process.',
  },
  {
    title: 'No warranty',
    body:
      'MangaRecs is provided "as is." We do not guarantee uninterrupted access, and reading sources outside our control (MangaDex, third-party sites) may change or become unavailable.',
  },
  {
    title: 'Limitation of liability',
    body:
      'To the extent the law allows, MangaRecs is not liable for indirect, incidental, or consequential damages, or for lost data or lost profits. Where liability cannot be excluded, it is capped at the greater of the amount you paid us in the twelve months before the claim or US$50. Nothing here limits liability for fraud, death or personal injury caused by negligence, or anything else that cannot legally be limited.',
  },
  {
    title: 'Account termination',
    body:
      'You can delete your account at any time from Settings. We may suspend or terminate accounts that violate these terms or the Community Guidelines.',
  },
  {
    title: 'Changes to these terms',
    body: 'We may update these terms as the app evolves. Continued use after an update means you accept the revised terms.',
  },
  {
    title: 'Contact',
    body: 'Questions? Reach us at support@mangarecs.net.',
  },
];

export default function LegalScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isTablet } = useResponsive();
  const t = useT();
  const [tab, setTab] = useState(route.params?.tab === 'terms' ? 'terms' : 'privacy');

  const sections = tab === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {tab === 'privacy' ? t('legal.privacy') : t('legal.terms')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'privacy' && [styles.tabBtnActive, { backgroundColor: colors.background }]]}
          onPress={() => setTab('privacy')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'privacy' }}
          accessibilityLabel={t('legal.privacy')}>
          <Text style={[styles.tabText, { color: tab === 'privacy' ? colors.text : colors.muted }]}>{t('legal.privacy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'terms' && [styles.tabBtnActive, { backgroundColor: colors.background }]]}
          onPress={() => setTab('terms')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'terms' }}
          accessibilityLabel={t('legal.terms')}>
          <Text style={[styles.tabText, { color: tab === 'terms' ? colors.text : colors.muted }]}>{t('legal.terms')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[isTablet && styles.tabletWrap, { padding: 20, paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: colors.muted }]}>Last updated {LAST_UPDATED}</Text>
        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.muted }]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Caps the reading measure on iPad — full-width body text at 1024pt is
  // unreadable. Matches the 640 used by every other screen.
  tabletWrap: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  tabRow: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 6 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabBtnActive: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '600' },
  updated: { fontSize: 11, marginBottom: 16, fontStyle: 'italic' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  sectionBody: { fontSize: 13, lineHeight: 20 },
});
