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
          {/* Star fill — Figma starGrad: white core → cool lavender tips */}
          <RadialGradient id="sl_starGrad" cx="50%" cy="32%" r="62%">
            <Stop offset="0%"   stopColor="#FFFFFF" />
            <Stop offset="38%"  stopColor="#EDE5FF" />
            <Stop offset="78%"  stopColor="#C4A8FF" />
            <Stop offset="100%" stopColor="#9B70FF" />
          </RadialGradient>

          {/* Ambient halo — Figma haloGrad */}
          <RadialGradient id="sl_haloGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#6B2FD9" stopOpacity="0.55" />
            <Stop offset="60%"  stopColor="#4A1FA8" stopOpacity="0.2"  />
            <Stop offset="100%" stopColor="#2D1469" stopOpacity="0"    />
          </RadialGradient>
        </Defs>

        {/* Diffuse violet halo (Figma: cx 512 cy 490, rx 320 ry 310) */}
        <Ellipse cx="512" cy="490" rx="320" ry="310" fill="url(#sl_haloGrad)" />

        {/* Glow layer — blurred-star stand-in via scaled violet rings
            (react-native-svg blur filters are unreliable on Android) */}
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="#7C3AFF"
          opacity="0.4"
          transform="translate(512 512) scale(1.14) translate(-512 -512)"
        />
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="#8B50FF"
          opacity="0.55"
          transform="translate(512 512) scale(1.06) translate(-512 -512)"
        />

        {/* Main star */}
        <Path
          d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z"
          fill="url(#sl_starGrad)"
        />

        {/* Center void + violet rim — Figma: r 46, fill #0E0820, stroke #5B2FD6 */}
        <Circle cx="512" cy="512" r="46" fill="#0E0820" />
        <Circle cx="512" cy="512" r="46" fill="none" stroke="#5B2FD6" strokeWidth="2.5" opacity="0.6" />
      </Svg>
    </Animated.View>
  );
});

export default StarLogo;
