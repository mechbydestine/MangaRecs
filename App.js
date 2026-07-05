import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Image, Animated, Platform, AppState, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { ThemeProvider, useTheme } from './utils/ThemeContext';
import { registerPushToken } from './utils/pushNotifications';
import { ProfileProvider } from './utils/ProfileContext';
import { NotificationsProvider, useNotifications } from './utils/NotificationsContext';
import { loadSaved as loadSavedAmbience } from './utils/ambiencePlayer';
import { hydrateCoverCache } from './utils/mangaCovers';
import { checkForNewChapters } from './utils/chapterUpdates';
import { markTouch, startPresenceHeartbeat, stopPresenceHeartbeat } from './utils/presence';

import FeedScreen from './screens/FeedScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import LibraryScreen from './screens/LibraryScreen';
import SocialScreen from './screens/SocialScreen';
import ForYouScreen from './screens/ForYouScreen';
import ProfileScreen from './screens/ProfileScreen';
import AuthScreen from './screens/AuthScreen';
import SettingsScreen from './screens/SettingsScreen';
import ReaderScreen from './screens/ReaderScreen';
import FriendProfileScreen from './screens/FriendProfileScreen';
import DiscussionScreen from './screens/DiscussionScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import GuidelinesScreen from './screens/GuidelinesScreen';
import IntroScreen from './screens/IntroScreen';
import CreatorDashboardScreen from './screens/CreatorDashboardScreen';
import DMScreen from './screens/DMScreen';
import LegalScreen from './screens/LegalScreen';
import AllDiscussionsScreen from './screens/AllDiscussionsScreen';
import ErrorBoundary from './components/ErrorBoundary';
import ToastHost from './components/ToastHost';

const navigationRef = createNavigationContainerRef();

const CURRENT_APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const LAST_SEEN_VERSION_KEY = '@mangarecs/last_seen_version';

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

function AnimatedTabIcon({ name, focused, color }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0.7)).current;

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
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
  );
}

// ── Per-tab stack navigators ──────────────────────────────────────────────

const SLIDE = { animation: 'slide_from_right' };

function FeedStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="FeedHome" component={FeedScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function LibraryStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="LibraryHome" component={LibraryScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function SocialStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="SocialHome" component={SocialScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function ForYouStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
        <Stack.Screen name="ForYouHome" component={ForYouScreen} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

function ProfileStack() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...SLIDE }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
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
    </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ── Tab navigator ─────────────────────────────────────────────────────────

function TabNavigator() {
  const { colors, isDark } = useTheme();
  const { unreadCount } = useNotifications();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'Feed') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Library') iconName = focused ? 'book' : 'book-outline';
          else if (route.name === 'Social') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'For You') iconName = focused ? 'sparkles' : 'sparkles-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <AnimatedTabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: isDark ? 'rgba(5,5,5,0.70)' : 'rgba(255,255,255,0.88)',
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
        tabBarActiveTintColor: '#534AB7',
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      })}>
      <Tab.Screen
        name="Feed"
        component={FeedStack}
        options={{ tabBarLabel: 'Home', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
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
      <Tab.Screen name="Library" component={LibraryStack} />
      <Tab.Screen name="For You" component={ForYouStack} options={{ tabBarLabel: 'Recs' }} />
      <Tab.Screen
        name="Social"
        component={SocialStack}
        options={{ tabBarLabel: 'Comms' }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Social', {
                screen: 'SocialHome',
                params: { refreshAt: Date.now() },
              });
            }
          },
        })}
      />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

// ── App navigator ─────────────────────────────────────────────────────────

function AppNavigator() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="Reader"
        component={ReaderScreen}
        options={{
          animation: 'slide_from_bottom',
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

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: '#534AB7',
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: '#534AB7',
    },
  };

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={onOnboardingComplete} />;
  }

  if (session && needsGuidelines) {
    return <GuidelinesScreen onComplete={onGuidelinesComplete} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <ThemedStatusBar />
      {session ? <AppNavigator /> : <AuthScreen />}
    </NavigationContainer>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession]                 = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsGuidelines, setNeedsGuidelines] = useState(false);
  const [showIntro, setShowIntro]             = useState(null); // null = not determined yet
  const [introDone, setIntroDone]             = useState(false);

  useEffect(() => {
    loadSavedAmbience();

    const init = async () => {
      try {
        const [sessionResult, onboardingDone, guidelinesLocal, lastSeenVersion] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem('onboarding_complete'),
          AsyncStorage.getItem('@mangarecs/guidelines_accepted'),
          AsyncStorage.getItem(LAST_SEEN_VERSION_KEY),
          hydrateCoverCache(),
        ]);
        setShowIntro(lastSeenVersion !== CURRENT_APP_VERSION);
        const s = sessionResult?.data?.session ?? null;
        setSession(s);
        setNeedsOnboarding(onboardingDone !== 'true');
        if (s?.user?.id) {
          registerPushToken(s.user.id);
          if (guidelinesLocal === 'true') {
            setNeedsGuidelines(false);
          } else {
            const accepted = await checkGuidelinesAccepted(s.user.id);
            setNeedsGuidelines(!accepted);
          }
          checkForNewChapters(s.user.id);
        }
      } catch (_) {}
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        registerPushToken(session.user.id);
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
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (!_presenceUserId) {
        supabase.auth.getSession().then(({ data: { session } }) => { _presenceUserId = session?.user?.id ?? null; });
      }
      if (_presenceUserId) {
        const isActive = nextState === 'active';
        supabase.from('profiles').update({ online: isActive }).eq('id', _presenceUserId).then(() => {});
        if (isActive) {
          markTouch();
          startPresenceHeartbeat(_presenceUserId);
          // Check for new chapters when the app comes back to foreground (fire-and-forget)
          checkForNewChapters(_presenceUserId);
        } else {
          stopPresenceHeartbeat();
        }
      }
    });

    // Navigate to NotificationsScreen when user taps a push notification
    let notifSub, notifReceivedSub;
    if (Notifications) {
      notifReceivedSub = Notifications.addNotificationReceivedListener(() => {
        playNotificationSound();
      });
      notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
        if (!navigationRef.isReady()) return;
        const data = response.notification.request.content.data || {};
        if ((data.type === 'new_chapter' || data.type === 'chapter_update') && (data.series_title || data.title)) {
          navigationRef.navigate('Reader', {
            searchQuery: data.series_title || data.title,
            title: data.series_title || data.title,
            chapters: data.chapter || 0,
          });
        } else if (data.type === 'friend_request' || data.type === 'direct_message') {
          navigationRef.navigate('Tabs', { screen: 'Social' });
        } else {
          navigationRef.navigate('Tabs', {
            screen: 'Feed',
            params: { screen: 'Notifications' },
          });
        }
      });
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

  if (loading || showIntro === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('./assets/icon.png')} style={{ width: 120, height: 120, marginBottom: 18 }} resizeMode="contain" />
        <View style={{ flexDirection: 'row' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: 0.5 }}>Manga</Text>
          <Text style={{ color: '#B18CFF', fontSize: 30, fontWeight: '800', letterSpacing: 0.5, textShadowColor: '#9B6BFF', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }}>Recs</Text>
        </View>
        <Text style={{ color: '#9C99B8', fontSize: 14, marginTop: 10, letterSpacing: 0.3 }}>Your next story, recommended.</Text>
      </View>
    );
  }

  if (showIntro && !introDone) {
    return (
      <IntroScreen
        onComplete={() => {
          AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, CURRENT_APP_VERSION).catch(() => {});
          setIntroDone(true);
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={markTouch}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ProfileProvider>
              <NotificationsProvider>
                <RootNavigator
                  session={session}
                  needsOnboarding={needsOnboarding}
                  onOnboardingComplete={() => setNeedsOnboarding(false)}
                  needsGuidelines={needsGuidelines}
                  onGuidelinesComplete={() => setNeedsGuidelines(false)}
                />
                <ToastHost />
              </NotificationsProvider>
            </ProfileProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
