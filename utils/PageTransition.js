import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function PageTransition({ children, dir = 'forward' }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(dir === 'back' ? -40 : 40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
}
