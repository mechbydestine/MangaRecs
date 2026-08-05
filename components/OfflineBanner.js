// A single, app-wide "you're offline" strip.
//
// The point isn't decoration — it's that the app has ~230 catch blocks that
// swallow failures. When the network is the cause, this makes it legible in
// one place instead of leaving every screen to guess or say nothing.
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '../utils/connectivity';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';

export default function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const t = useT();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: online ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [online]);

  // Kept mounted so the slide-out animates; pointerEvents none so it never
  // eats a tap on the header underneath it.
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.error || '#E5534B',
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }],
        },
      ]}>
      <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
      <Text style={styles.text} maxFontSizeMultiplier={1.4}>{t('common.offline')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    ...Platform.select({ android: { elevation: 8 }, default: {} }),
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
