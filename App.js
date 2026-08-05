import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Animated, Platform, AppState, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as Updates from 'expo-updates';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { ThemeProvider, useTheme } from './utils/ThemeContext';
import { LanguageProvider, useT } from './utils/LanguageContext';
import { refreshPushTokenIfGranted } from './utils/pushNotifications';
import { ProfileProvider } from './utils/ProfileContext';
import { ensureGuestSession } from './utils/guestSession';
import { NotificationsProvider, useNotifications } from './utils/NotificationsContext';
import { loadSaved as loadSavedAmbience } from './utils/ambiencePlayer';
import { hydrateCoverCache } from './utils/mangaCovers';
import { hydrateLibraryBadges, prewarmLibraryBadges } from './utils/libraryBadges';
import { checkForNewChapters } from './utils/chapterUpdates';
import { markTouch, startPresenceHeartbeat, stopPresenceHeartbeat } from './utils/presence';
import { light } from './utils/haptics';
import { setCrashUser } from './utils/crashReporting';
import CoverMorphOverlay from './components/CoverMorphOverlay';
import WhatsNewModal from './components/WhatsNewModal';

import FeedScreen from './screens/FeedScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import LibraryScreen from './screens/LibraryScreen';
import SocialScreen from './screens/SocialScreen';
import ForYouScreen from './screens/ForYouScreen';
import ProfileScreen from './screens/ProfileScreen';
import AuthScreen from './screens/AuthScreen';
import SettingsScreen from './screens/SettingsScreen';
import ReaderScreen from './screens/ReaderScreen';
import MangaDetailScreen from './screens/MangaDetailScreen';
import FriendProfileScreen from './screens/FriendProfileScreen';
import DiscussionScreen from './screens/DiscussionScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import GuidelinesScreen from './screens/GuidelinesScreen';
import IntroScreen from './screens/IntroScreen';
import CreatorDashboardScreen from './screens/CreatorDashboardScreen';
import RecapScreen from './screens/RecapScreen';
import ModerationScreen from './screens/ModerationScreen';
import DMScreen from './screens/DMScreen';
import LegalScreen from './screens/LegalScreen';
import AllDiscussionsScreen from './screens/AllDiscussionsScreen';
import ErrorBoundary from './components/ErrorBoundary';
import ToastHost from './components/ToastHost';
import OfflineBanner from './components/OfflineBanner';
import AlertHost from './components/AlertHost';
import BadgeCeremony from './components/BadgeCeremony';
import CoachmarkOverlay, { COACHMARK_SEEN_KEY } from './components/CoachmarkOverlay';
import { CoachmarkProvider, useCoachmarkRegistry, useCoachmarkTarget } from './utils/CoachmarkContext';
import StarLogo from './components/StarLogo';

const navigationRef = createNavigationContainerRef();

// ── Notification tap routing ──────────────────────────────────────────────
// A tap can arrive long before we're able to act on it: on a cold start the
// response fires while the navigation container is still mounting, and even
// once it's ready the target routes (Reader/Tabs) only exist inside
// AppNavigator, which isn't rendered until the session has been restored.
// This used to be a bare `if (!navigationRef.isReady()) return;`, which
// silently dropped the tap in exactly those cases — so launching the app by
// tapping a notification just dumped you on the default screen. Instead,
// hold the response and replay it once both conditions are actually true.
let _pendingNotifResponse = null;
let _navReady = false;
let _sessionActive = false;
// Expo's docs point at getLastNotificationResponseAsync for the launch case
// but don't guarantee the listener won't also fire for the same tap, and
// warn to manage this explicitly — dedupe on the notification's identifier
// so a tap is never routed twice.
const _handledNotifIds = new Set();

function routeNotificationResponse(response) {
  if (!response) return;
  const id = response.notification?.request?.identifier;
  if (id && _handledNotifIds.has(id)) return;

  if (!_navReady || !_sessionActive || !navigationRef.isReady()) {
    _pendingNotifResponse = response;
    return;
  }

  _pendingNotifResponse = null;
  if (id) _handledNotifIds.add(id);

  const data = response.notification?.request?.content?.data || {};
  if ((data.type === 'new_chapter' || data.type === 'chapter_update') && (data.series_title || data.title)) {
    navigationRef.navigate('Reader', {
      searchQuery: data.series_title || data.title,
      title: data.series_title || data.title,
      chapters: data.chapter || 0,
    });
  } else if (data.type === 'friend_request' || data.type === 'direct_message') {
    // Friends/DMs live under Profile now (the Social tab is gone), so this has
    // to push through the Profile stack or the notification dead-ends.
    navigationRef.navigate('Tabs', { screen: 'Feed', params: { screen: 'Messages' } });
  } else {
    navigationRef.navigate('Tabs', { screen: 'Feed', params: { screen: 'Notifications' } });
  }
}

function flushPendingNotifResponse() {
  if (_pendingNotifResponse) routeNotificationResponse(_pendingNotifResponse);
}

// Deep links: mangarecs://series/<title> opens the Reader on that series,
// mangarecs://discussion/<title> opens its discussion. Share messages include
// these links so a friend with the app lands directly on the series.
const linking = {
  prefixes: ['mangarecs://'],
  config: {
    screens: {
      Reader: 'series/:searchQuery',
      Discussion: 'discussion/:title',
      Tabs: {
        screens: {
          Feed: { screens: { FeedHome: 'home', Notifications: 'notifications' } },
          Discover: { screens: { ForYouHome: 'discover' } },
          Community: { screens: { CommunityHome: 'community' } },
          // mangarecs://social predates the split — keep it working, pointed at
          // the inbox, which is what it always meant in practice.
          Profile: { screens: { ProfileHome: 'profile', Friends: 'social' } },
        },
      },
    },
  },
};

const CURRENT_APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const LAST_SEEN_VERSION_KEY = '@mangarecs/last_seen_version';
// Tracks the OTA update the intro has already played for — separate from
// LAST_SEEN_VERSION_KEY, which only bumps on a native release. Most updates
// ship as OTA between native versions, so this is what actually catches "an
// update just landed" and re-triggers the intro for it.
const LAST_SEEN_UPDATE_KEY = '@mangarecs/last_seen_update_id';

const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
let Notifications = null;
if (!isExpoGo) {
  Notifications = require('expo-notifications');
}

const NOTIF_SOUND = require('./assets/sounds/notification.mp3');
function playNotificationSound() {
  try {
    const { createAudioPlayer } = require('expo-audio');
    const p = createAudioPlayer(NOTIF_SOUND);
    p.play();
    setTimeout(() => { try { p.remove(); } catch (_) {} }, 4000);
  } catch (_) {}
}

const queryClient = new QueryClient();

async function checkGuidelinesAccepted(userId) {
  // Fast path: local cache (avoids Supabase round-trip on every launch)
  try {
    const local = await AsyncStorage.getItem('@mangarecs/guidelines_accepted');
    if (local === 'true') return true;
  } catch (_) {}

  // Slow path: Supabase (only on first install or reinstall)
  try {
    const { data } = await supabase
      .from('profiles')
      .select('accepted_guidelines')
      .eq('id', userId)
      .maybeSingle();
    if (data?.accepted_guidelines === true) {
      AsyncStorage.setItem('@mangarecs/guidelines_accepted', 'true').catch(() => {});
      return true;
    }
    return false;
  } catch (_) {
    return true; // network error: don't gate users out
  }
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// ── Animated tab icon ─────────────────────────────────────────────────────

function AnimatedTabIcon({ name, focused, color, targetKey }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0.7)).current;
  const registerTarget = useCoachmarkTarget(targetKey);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1.2 : 1,
        useNativeDriver: true,
        damping: 10,
        stiffness: 260,
        mass: 0.65,
      }),
      Animated.timing(opacity, {
        toValue: focused ? 1 : 0.7,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <Animated.View ref={registerTarget} style={{ transform: [{ scale }], opacity }}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
  );
}

// ── Per-tab stack navigators ──────────────────────────────────────────────

const SLIDE = { animation: 'slide_from_right' };

function FeedStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="feed">
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="FeedHome" component={FeedScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        {/* Friends + DMs. Reached from the ✉ icon in the Home header — the
            Instagram placement — so messaging is one tap from launch and its
            unread badge stays separate from Community's. */}
        <Stack.Screen name="Messages" component={SocialScreen} initialParams={{ mode: 'messages' }} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function LibraryStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="library">
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="LibraryHome" component={LibraryScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// Discover absorbs what used to be split across the "Recs" and "Comms" tabs:
// recommendations, trending discussions, and finding people. Those were three
// separate tabs that all answered the same question — "what's out there that
// I haven't seen" — so a first-time user had no way to predict which held what.
function DiscoverStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="discover">
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="ForYouHome" component={ForYouScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// Community is a place, not a feed: per-series rooms, the weekly poll, the
// leaderboard, and later events and mini-games. Distinct from Home (your feed)
// and Discover (finding new series), which is why it earns its own tab.
function CommunityStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="community">
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="CommunityHome" component={SocialScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function ProfileStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="profile">
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      {/* Friends/DMs used to be their own "Comms" tab. Moved under Profile —
          the same place Discord and Instagram keep friend management — so the
          bar is four distinct destinations instead of five overlapping ones. */}
      <Stack.Screen name="Friends" component={SocialScreen} initialParams={{ mode: 'messages' }} />
      <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
      <Stack.Screen name="DM" component={DMScreen} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="Creator"
        component={CreatorDashboardScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="Guidelines"
        component={GuidelinesScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="Moderation"
        component={ModerationScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ── Tab navigator ─────────────────────────────────────────────────────────

function TabNavigator() {
  const { colors, isDark } = useTheme();
  const { unreadCount } = useNotifications();
  const t = useT();
  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => light() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'Feed') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Library') iconName = focused ? 'book' : 'book-outline';
          else if (route.name === 'Discover') iconName = focused ? 'sparkles' : 'sparkles-outline';
          else if (route.name === 'Community') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <AnimatedTabIcon name={iconName} focused={focused} color={color} targetKey={`tab-${route.name}`} />;
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          // 0.70 was too sheer: manga cover art read straight through the bar
          // and collided with the labels. Screens reserve the bar's height via
          // useBottomTabBarHeight(), so what shows through now is only what's
          // mid-scroll — but it still has to stay legible while it passes.
          backgroundColor: isDark ? 'rgba(5,5,5,0.92)' : 'rgba(255,255,255,0.95)',
          borderTopWidth: isDark ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: isDark ? 'transparent' : 'rgba(0,0,0,0.1)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          overflow: 'hidden',
          paddingTop: 8,
          paddingBottom: Platform.OS === 'android' ? 10 : 4,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      })}>
      <Tab.Screen
        name="Feed"
        component={FeedStack}
        options={{ tabBarLabel: t('tabs.home'), tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Feed', {
                screen: 'FeedHome',
                params: { refreshAt: Date.now() },
              });
            }
          },
        })}
      />
      <Tab.Screen name="Library" component={LibraryStack} options={{ tabBarLabel: t('tabs.library') }} />
      <Tab.Screen
        name="Discover"
        component={DiscoverStack}
        options={{ tabBarLabel: t('tabs.discover') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Discover', {
                screen: 'ForYouHome',
                params: { refreshAt: Date.now() },
              });
            }
          },
        })}
      />
      <Tab.Screen
        name="Community"
        component={CommunityStack}
        options={{ tabBarLabel: t('tabs.community') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Community', {
                screen: 'CommunityHome',
                params: { refreshAt: Date.now() },
              });
            }
          },
        })}
      />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ tabBarLabel: t('tabs.profile') }} />
    </Tab.Navigator>
  );
}

// ── App navigator ─────────────────────────────────────────────────────────

function AppNavigator() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary where="root">
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      {/* Recap lives on the ROOT stack, not inside ProfileStack — nested in the
          tab navigator the bottom tab bar stayed on top of the story and cut
          off the bottom of every slide (footer caption, peak-time pill). */}
      <Stack.Screen
        name="Recap"
        component={RecapScreen}
        options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }}
      />
      <Stack.Screen
        name="Reader"
        component={ReaderScreen}
        options={{
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="MangaDetail"
        component={MangaDetailScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="Discussion"
        component={DiscussionScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="AllDiscussions"
        component={AllDiscussionsScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ── Root navigator — lives inside ThemeProvider so useTheme() works ───────

function RootNavigator({ session, needsOnboarding, onOnboardingComplete, needsGuidelines, onGuidelinesComplete }) {
  const { colors, isDark } = useTheme();
  const coachmarks = useCoachmarkRegistry();
  // Sticks true for the rest of the session once a brand-new user finishes
  // onboarding — used to skip WhatsNewModal below. A "here's what's new"
  // changelog popup is meaningless to someone who has never used any prior
  // version, and onboarding/the coachmark tour already cover what the app does.
  const [justOnboarded, setJustOnboarded] = useState(false);

  // A queued notification tap can only be routed once AppNavigator is really
  // mounted — before that, Reader/Tabs don't exist as routes yet. Track the
  // session here (rather than reading it inside the module-level router) and
  // replay whatever's pending the moment it becomes available.
  useEffect(() => {
    _sessionActive = !!session && !needsOnboarding && !needsGuidelines;
    if (_sessionActive) flushPendingNotifResponse();
  }, [session, needsOnboarding, needsGuidelines]);

  // Auto-start the coachmark tour the first time this device reaches the
  // main tabs signed in — covers brand-new users right after onboarding
  // (below) AND existing users who onboarded before this tour existed.
  // Skipped entirely for signed-out/guideline-gated states so it only ever
  // fires once real navigation (tab bar, Feed header) is actually mounted.
  useEffect(() => {
    if (needsOnboarding || (session && needsGuidelines) || !session) return;
    let cancelled = false;
    AsyncStorage.getItem(COACHMARK_SEEN_KEY).then((seen) => {
      if (!cancelled && seen !== 'true') {
        setTimeout(() => { if (!cancelled) coachmarks?.showTour(); }, 700);
      }
    });
    return () => { cancelled = true; };
  }, [needsOnboarding, needsGuidelines, session]);

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => {
      setJustOnboarded(true);
      // A new install starts on the current version — there's no "before" for
      // a changelog to describe, so mark it seen now rather than surfacing it
      // confusingly on their very next (still brand-new) open.
      AsyncStorage.setItem('@mangarecs/whatsnew_auto_shown_version', CURRENT_APP_VERSION).catch(() => {});
      onOnboardingComplete();
    }} />;
  }

  if (session && needsGuidelines) {
    return <GuidelinesScreen onComplete={onGuidelinesComplete} />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={linking}
      onReady={() => { _navReady = true; flushPendingNotifResponse(); }}>
      <ThemedStatusBar />
      {session ? (
        <>
          <AppNavigator />
          {!justOnboarded && <WhatsNewModal />}
        </>
      ) : <AuthScreen />}
    </NavigationContainer>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  // Brand wordmark font (the site's nav/footer "MangaRecs" lockup, Libre
  // Franklin ExtraBold under the hood) — loaded here so it's ready before the
  // splash fallback and intro ever paint, instead of flashing in afterward.
  const [fontsLoaded] = useFonts({
    MangaRecsBrand: require('./assets/fonts/MangaRecsBrand-ExtraBold.ttf'),
  });
  const [session, setSession]                 = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsGuidelines, setNeedsGuidelines] = useState(false);
  const [showIntro, setShowIntro]             = useState(null); // null = not determined yet
  const [introDone, setIntroDone]             = useState(false);

  // Splash: stays up at least 2s while a real (foreground) update check runs,
  // silently — no "checking for update" text. An update found here is fetched
  // and applied via reload, which naturally replays this same sequence on the
  // new bundle and lets the existing isNewUpdate check trigger the intro. No
  // update: the splash just crossfades into the app once everything's ready.
  const [minSplashElapsed, setMinSplashElapsed]     = useState(false);
  const [updateCheckDone, setUpdateCheckDone]       = useState(false);
  const [updateReadyToReload, setUpdateReadyToReload] = useState(false);
  const [splashMounted, setSplashMounted]           = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadSavedAmbience();

    const init = async () => {
      try {
        const [sessionResult, onboardingDone, guidelinesLocal, lastSeenVersion, lastSeenUpdateId] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem('onboarding_complete'),
          AsyncStorage.getItem('@mangarecs/guidelines_accepted'),
          AsyncStorage.getItem(LAST_SEEN_VERSION_KEY),
          AsyncStorage.getItem(LAST_SEEN_UPDATE_KEY),
          hydrateCoverCache(),
          // Last session's resolved Library badges (new-chapter counts, site
          // favicons) — a single AsyncStorage read, no network, so they're in
          // memory before any screen mounts and the grid paints them on its
          // very first render instead of popping them in seconds later.
          hydrateLibraryBadges(),
        ]);
        // Show the intro once per app version, and again whenever a new OTA
        // update took effect since we last showed it — Updates.updateId is
        // null on the embedded/dev bundle, so that case never counts as "new"
        // (the intro would otherwise replay on every single dev/Expo Go launch).
        const currentUpdateId = Updates.updateId || null;
        const isNewUpdate = !!currentUpdateId && currentUpdateId !== lastSeenUpdateId;
        setShowIntro(lastSeenVersion !== CURRENT_APP_VERSION || isNewUpdate);
        const onboardingComplete = onboardingDone === 'true';
        setNeedsOnboarding(!onboardingComplete);
        let s = sessionResult?.data?.session ?? null;

        // Self-healing: sign-in is only ever supposed to be "recommended", not
        // required — a first-time user who skips or finishes onboarding gets a
        // real (anonymous) session behind the scenes so their data still has
        // somewhere to attach. If that one attempt silently failed (network
        // blip, anonymous auth briefly unavailable), onboarding was still
        // marked complete and there was no way back into that flow — every
        // future launch landed straight on the sign-in screen with no escape.
        // Retry it here instead of leaving anyone stranded there permanently.
        if (!s && onboardingComplete) {
          await ensureGuestSession().catch(() => {});
          const retry = await supabase.auth.getSession();
          s = retry?.data?.session ?? null;
        }

        setSession(s);
        if (s?.user?.id) {
          // No permission prompt here. The OS notification dialog is a one-shot —
          // spending it on a cold start, before the user has read anything, is how
          // you earn a permanent "no". The ask now happens in the reader after a
          // finished chapter, where the benefit is self-evident.
          // This call only refreshes the token of someone who ALREADY granted it
          // (Expo tokens rotate); it never prompts.
          refreshPushTokenIfGranted(s.user.id);
          if (guidelinesLocal === 'true') {
            setNeedsGuidelines(false);
          } else {
            const accepted = await checkGuidelinesAccepted(s.user.id);
            setNeedsGuidelines(!accepted);
          }
          checkForNewChapters(s.user.id);
          // Refresh badges against the live library in the background so
          // they're already up to date by the time the Library is opened.
          // Fire-and-forget — rate-limited network work must never gate boot.
          prewarmLibraryBadges(s.user.id);
        }
      } catch (_) {}
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      // So a crash report says *which* account hit it, without carrying any
      // personal data into Sentry — the Supabase user id and nothing else.
      setCrashUser(session?.user?.id ?? null);
      if (session?.user?.id) {
        // Same reasoning — this used to fire the OS dialog seconds after signup.
        refreshPushTokenIfGranted(session.user.id);
        const guidelinesLocal = await AsyncStorage.getItem('@mangarecs/guidelines_accepted').catch(() => null);
        if (guidelinesLocal === 'true') {
          setNeedsGuidelines(false);
        } else {
          const accepted = await checkGuidelinesAccepted(session.user.id);
          setNeedsGuidelines(!accepted);
        }
        // Mark user online on sign-in
        supabase.from('profiles').update({ online: true }).eq('id', session.user.id).then(() => {});
      } else {
        setNeedsGuidelines(false);
      }
    });

    // Online presence: toggle based on app foreground/background state
    let _presenceUserId = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      _presenceUserId = session?.user?.id ?? null;
      if (_presenceUserId) {
        supabase.from('profiles').update({ online: true }).eq('id', _presenceUserId).then(() => {});
        markTouch();
        startPresenceHeartbeat(_presenceUserId);
      }
    });

    // AFK/background auto-update: while the app is backgrounded (not actively
    // in use), silently check for and download a new OTA update; apply it the
    // next time the user returns, so most updates are already there without
    // anyone having to tap "Check Now" in Settings (that manual button stays
    // for forcing it immediately instead of waiting for a background window).
    let updateReadyToApply = false;
    async function checkAndFetchUpdateInBackground() {
      if (!Updates.isEnabled) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          updateReadyToApply = true;
        }
      } catch (_) {}
    }

    // Supabase's own auto-refresh timer only runs while something is actively
    // calling into it — on React Native it does NOT keep ticking reliably in
    // the background, so a session (including the anonymous guest session
    // onboarding creates) can quietly go stale while the app is backgrounded.
    // This is the exact wiring Supabase's RN docs call for: pause the refresh
    // loop on background, restart it on foreground, so the token is always
    // current by the time the user is back and something tries to use it.
    // Missing this is what caused intermittent forced-to-sign-in-again and
    // silently-failed writes (stale token → RLS rejects the request).
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (!_presenceUserId) {
        supabase.auth.getSession().then(({ data: { session } }) => { _presenceUserId = session?.user?.id ?? null; });
      }
      const isActive = nextState === 'active';
      if (isActive) supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
      if (_presenceUserId) {
        supabase.from('profiles').update({ online: isActive }).eq('id', _presenceUserId).then(() => {});
      }
      if (isActive) {
        if (_presenceUserId) {
          markTouch();
          startPresenceHeartbeat(_presenceUserId);
          // Check for new chapters when the app comes back to foreground (fire-and-forget)
          checkForNewChapters(_presenceUserId);
        }
        // A background fetch already finished while the user was away — apply
        // it now. App.js's own updateId-vs-LAST_SEEN_UPDATE_KEY check picks
        // this up on the reload and plays the intro to signal what changed.
        if (updateReadyToApply) {
          updateReadyToApply = false;
          Updates.reloadAsync().catch(() => {});
        }
      } else {
        if (_presenceUserId) stopPresenceHeartbeat();
        // Gone to background/inactive — this is the "AFK" window: check for
        // and download an update silently so it's ready the moment they're
        // back, instead of only ever updating when someone opens Settings.
        checkAndFetchUpdateInBackground();
      }
    });

    // Navigate to NotificationsScreen when user taps a push notification
    let notifSub, notifReceivedSub;
    if (Notifications) {
      notifReceivedSub = Notifications.addNotificationReceivedListener(() => {
        playNotificationSound();
      });
      notifSub = Notifications.addNotificationResponseReceivedListener(routeNotificationResponse);
      // Covers the tap that launched the app, which can land before the
      // listener above is even registered. Deduped by identifier inside
      // routeNotificationResponse, so it's safe if the listener fires too.
      Notifications.getLastNotificationResponseAsync?.()
        .then((response) => { if (response) routeNotificationResponse(response); })
        .catch(() => {});
    }

    return () => {
      subscription.unsubscribe();
      notifSub?.remove();
      notifReceivedSub?.remove();
      appStateSub?.remove();
      stopPresenceHeartbeat();
      // Mark offline on cleanup (best-effort)
      if (_presenceUserId) {
        supabase.from('profiles').update({ online: false }).eq('id', _presenceUserId).then(() => {});
      }
    };
  }, []);

  // Splash floor: guarantees at least 2s on screen regardless of how fast
  // everything else resolves, so it never looks like a flicker.
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Real update check, run once at launch (not just in the background/AFK
  // path below). A hung network shouldn't strand anyone on the splash
  // forever, so a fallback timer force-settles it after 8s.
  useEffect(() => {
    let settled = false;
    const fallback = setTimeout(() => {
      if (!settled) { settled = true; setUpdateCheckDone(true); }
    }, 8000);

    (async () => {
      if (!Updates.isEnabled) {
        if (!settled) { settled = true; clearTimeout(fallback); setUpdateCheckDone(true); }
        return;
      }
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          if (!settled) { settled = true; clearTimeout(fallback); setUpdateReadyToReload(true); }
        } else if (!settled) {
          settled = true; clearTimeout(fallback); setUpdateCheckDone(true);
        }
      } catch (_) {
        if (!settled) { settled = true; clearTimeout(fallback); setUpdateCheckDone(true); }
      }
    })();

    return () => { settled = true; clearTimeout(fallback); };
  }, []);

  const contentReady = !loading && showIntro !== null && fontsLoaded;
  const updateSettled = updateCheckDone || updateReadyToReload;
  // The Marvel-style intro doesn't need the plain splash's minimum-hold floor
  // behind it — that floor exists so the static logo doesn't flicker on fast
  // launches, but the intro is its own multi-second reveal. Waiting out the
  // floor here just meant the intro was already a couple seconds into its
  // animation by the time the splash faded away and showed it.
  const readyToLeaveSplash = contentReady && updateSettled && (showIntro || minSplashElapsed);

  useEffect(() => {
    if (!readyToLeaveSplash) return;
    if (updateReadyToReload) {
      // An update's already downloaded — reload onto it. This same sequence
      // replays on the new bundle, where isNewUpdate flips true and the
      // intro plays to signal what changed.
      Updates.reloadAsync().catch(() => setUpdateCheckDone(true));
      return;
    }
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: showIntro ? 150 : 400,
      useNativeDriver: true,
    }).start(() => setSplashMounted(false));
  }, [readyToLeaveSplash, updateReadyToReload, showIntro]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {contentReady && (
        showIntro && !introDone ? (
          <IntroScreen
            onComplete={() => {
              AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, CURRENT_APP_VERSION).catch(() => {});
              if (Updates.updateId) AsyncStorage.setItem(LAST_SEEN_UPDATE_KEY, Updates.updateId).catch(() => {});
              setIntroDone(true);
            }}
          />
        ) : (
          <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={markTouch}>
            <SafeAreaProvider>
              <ThemeProvider>
                <LanguageProvider>
                <QueryClientProvider client={queryClient}>
                  <ProfileProvider>
                    <NotificationsProvider>
                      <CoachmarkProvider>
                        <RootNavigator
                          session={session}
                          needsOnboarding={needsOnboarding}
                          onOnboardingComplete={() => setNeedsOnboarding(false)}
                          needsGuidelines={needsGuidelines}
                          onGuidelinesComplete={() => setNeedsGuidelines(false)}
                        />
                        <OfflineBanner />
                        <ToastHost />
                        <AlertHost />
                        <BadgeCeremony />
                        <CoverMorphOverlay />
                        <CoachmarkOverlay />
                      </CoachmarkProvider>
                    </NotificationsProvider>
                  </ProfileProvider>
                </QueryClientProvider>
                </LanguageProvider>
              </ThemeProvider>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        )
      )}

      {splashMounted && (
        <Animated.View
          pointerEvents="none"
          style={{ ...StyleSheet.absoluteFillObject, opacity: splashOpacity, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ marginBottom: 18 }}>
            <StarLogo size={112} />
          </View>
          {fontsLoaded && (
            <>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontFamily: 'MangaRecsBrand', textTransform: 'uppercase', color: '#FFFFFF', fontSize: 30, letterSpacing: 0.5 }}>Manga</Text>
                <Text style={{ fontFamily: 'MangaRecsBrand', textTransform: 'uppercase', color: '#B18CFF', fontSize: 30, letterSpacing: 0.5, textShadowColor: '#9B6BFF', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }}>Recs</Text>
              </View>
              <Text style={{ color: '#9C99B8', fontSize: 14, marginTop: 10, letterSpacing: 0.3 }}>Your next story, recommended.</Text>
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}
