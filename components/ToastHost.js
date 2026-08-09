import { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setToastListener } from '../utils/appToast';

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
  const [msg, setMsg]   = useState(null);
  const [type, setType] = useState('error');
  const opacity  = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
  }

  useEffect(() => {
    const unsub = setToastListener((message, t) => {
      setMsg(message);
      setType(t && TYPE_STYLES[t] ? t : 'error');
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
  const t = TYPE_STYLES[type];
  return (
    <Animated.View style={[styles.wrap, { opacity }]}>
      <TouchableOpacity style={styles.touchable} activeOpacity={0.75} onPress={hide} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name={t.icon} size={16} color={t.color} />
        <Text style={styles.text} numberOfLines={3}>{msg}</Text>
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
    backgroundColor: 'rgba(13,13,15,0.94)',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '500', flexShrink: 1 },
});
