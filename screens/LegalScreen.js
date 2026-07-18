import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';

const LAST_UPDATED = 'July 3, 2026';

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
      'Reading content and cover art are fetched live from the MangaDex API — the pages you read are served directly from MangaDex/its mirrors, not stored by us except when you explicitly download a chapter for offline reading. Account data, images, and messages are stored with Supabase, our database and file-storage provider. We do not sell your data or share it with advertisers.',
  },
  {
    title: 'Your choices',
    body:
      'You can turn off AI recommendations, notifications, and adult-content filtering in Settings. You can block another user to stop them from messaging you or seeing your activity. You can delete your account at any time from Settings → Account — this permanently removes your profile, messages, friendships, comments, and uploaded images.',
  },
  {
    title: 'Data retention',
    body:
      'Your data is kept as long as your account is active. Deleting your account removes it immediately and permanently; this cannot be undone.',
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
      'MangaRecs is a manga/webtoon discovery and social app. You must be old enough to use this app under the laws of your country, and you’re responsible for keeping your account credentials secure.',
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
    title: 'No warranty',
    body:
      'MangaRecs is provided "as is." We do not guarantee uninterrupted access, and reading sources outside our control (MangaDex, third-party sites) may change or become unavailable.',
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
  const [tab, setTab] = useState(route.params?.tab === 'terms' ? 'terms' : 'privacy');

  const sections = tab === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {tab === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'privacy' && [styles.tabBtnActive, { backgroundColor: colors.background }]]}
          onPress={() => setTab('privacy')}>
          <Text style={[styles.tabText, { color: tab === 'privacy' ? colors.text : colors.muted }]}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'terms' && [styles.tabBtnActive, { backgroundColor: colors.background }]]}
          onPress={() => setTab('terms')}>
          <Text style={[styles.tabText, { color: tab === 'terms' ? colors.text : colors.muted }]}>Terms of Use</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
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
