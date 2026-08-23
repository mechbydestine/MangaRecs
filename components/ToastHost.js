import { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setToastListener } from '../utils/appToast';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';

const TYPE_STYLES = {
  error:   { icon: 'alert-circle',      color: '#E8527A' },
  success: { icon: 'checkmark-circle',  color: '#1D9E75' },
  info:    { icon: 'information-circle', color: '#7858FF' },
};

const MIN_DURATION_MS = 2200;
const MAX_DURATION_MS = 5500;
const MS_PER_CHAR = 50; // rough reading speed floor so denser messages linger longer

function durationFor(message) {
  const len = (message || '').length;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, len * MS_PER_CHAR));
}

export default function ToastHost() {
  const t = useT();
  const { isDark } = useTheme();
  const [msg, setMsg]   = useState(null);
  const [type, setType] = useState('error');
  const opacity  = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
  }

  useEffect(() => {
    // Param is `kind`, not `t` — see the note on `style` below.
    const unsub = setToastListener((message, kind) => {
      setMsg(message);
      setType(kind && TYPE_STYLES[kind] ? kind : 'error');
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(hide, durationFor(message));
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!msg) return null;
  // Named `style`, not `t`. It was `t`, and when the accessibility pass added
  // a translated label below it called that object as a function — every toast
  // in the app threw "t is not a function". scripts/check-t-scope.js now fails
  // the build on this shape.
  const style = TYPE_STYLES[type];

  // The toast floats over whatever screen is beneath it, so it carries its own
  // surface rather than a themed token — but it still has to invert with the
  // theme, or a Light-theme screen gets a black slab dropped on it.
  const surface  = isDark ? 'rgba(13,13,15,0.94)'   : 'rgba(255,255,255,0.97)';
  const hairline = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const label    = isDark ? '#FFFFFF'               : '#0D0D0F';

  return (
    <Animated.View style={[styles.wrap, { opacity, backgroundColor: surface }]}>
      <TouchableOpacity
        style={[styles.touchable, { borderColor: hairline }]}
        activeOpacity={0.75}
        onPress={hide}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.dismiss')}>
        <Ionicons name={style.icon} size={16} color={style.color} />
        <Text style={[styles.text, { color: label }]} numberOfLines={3}>{msg}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 104,
    alignSelf: 'center',
    maxWidth: '86%',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
});
