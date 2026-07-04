import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path, Circle } from 'react-native-svg';

const StarLogo = forwardRef(function StarLogo({ size = 38, continuous = false }, ref) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const animRef  = useRef(null);
  const oneShot  = useRef(false);

  useEffect(() => {
    if (animRef.current) { animRef.current.stop(); animRef.current = null; }
    spinAnim.setValue(0);
    if (continuous) {
      animRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animRef.current.start();
    }
    return () => { if (animRef.current) { animRef.current.stop(); animRef.current = null; } };
  }, [continuous]);

  // one-shot spin (header logo on tab-press / refresh)
  useImperativeHandle(ref, () => ({
    spin() {
      if (continuous || oneShot.current) return;
      oneShot.current = true;
      spinAnim.setValue(0);
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { oneShot.current = false; });
    },
  }));

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [{ rotate }],
        shadowColor: '#7B5CFF',
        shadowOpacity: 0.7,
        shadowRadius: size * 0.35,
        shadowOffset: { width: 0, height: 0 },
        elevation: Platform.OS === 'android' ? Math.round(size * 0.5) : 0,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 1024 1024">
        <Defs>
          <RadialGradient id="sl_starGrad" cx="50%" cy="30%" r="65%">
            <Stop offset="0%"   stopColor="#FFFFFF" />
            <Stop offset="30%"  stopColor="#F0E8FF" />
            <Stop offset="65%"  stopColor="#C4A8FF" />
            <Stop offset="100%" stopColor="#9B70FF" />
          </RadialGradient>

          {/* Outer soft glow field */}
          <RadialGradient id="sl_outerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#7B5CFF" stopOpacity="0.32" />
            <Stop offset="60%"  stopColor="#5030D0" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#3010A0" stopOpacity="0"    />
          </RadialGradient>

          {/* Ambient halo */}
          <RadialGradient id="sl_haloGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#7B5CFF" stopOpacity="0.75" />
            <Stop offset="55%"  stopColor="#4A1FA8" stopOpacity="0.35" />
            <Stop offset="100%" stopColor="#2D1469" stopOpacity="0"    />
          </RadialGradient>
        </Defs>

        {/* Wide outer glow field */}
        <Ellipse cx="512" cy="512" rx="510" ry="510" fill="url(#sl_outerGlow)" />

        {/* Tight ambient halo */}
        <Ellipse cx="512" cy="495" rx="350" ry="340" fill="url(#sl_haloGrad)" />

        {/* Outer glow ring of the star */}
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="#7C3AFF"
          opacity="0.35"
          transform="translate(512 512) scale(1.16) translate(-512 -512)"
        />

        {/* Inner glow ring */}
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="#8B50FF"
          opacity="0.58"
          transform="translate(512 512) scale(1.07) translate(-512 -512)"
        />

        {/* Main star */}
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="url(#sl_starGrad)"
        />

        {/* Center void */}
        <Circle cx="512" cy="512" r="44" fill="#000000" />

        {/* Violet rim */}
        <Circle cx="512" cy="512" r="44" fill="none" stroke="#7B5CFF" strokeWidth="3" opacity="0.65" />
      </Svg>
    </Animated.View>
  );
});

export default StarLogo;
