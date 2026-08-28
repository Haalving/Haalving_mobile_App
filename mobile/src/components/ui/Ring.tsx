import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { useTheme, type as t } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A ring is a dial without a legend — the same stroked-arc build, so the two
 * share one visual language.
 *
 * It is a STROKED ARC rather than a conic gradient for the reason the demo gives:
 * an arc can animate and a gradient cannot. The dash offset is driven by
 * Reanimated on the UI thread, so the sweep stays smooth while the list it sits
 * in is scrolling.
 */
export function Ring({
  pct,
  color,
  label,
  size = 56,
  stroke = 6,
}: {
  pct: number;
  /** A resolved colour, not a token name — React Native has no `var()`. */
  color?: string;
  label?: string;
  size?: number;
  stroke?: number;
}) {
  const c = useTheme();
  const R = 45;
  const C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(p, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [p, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: C - (C * progress.value) / 100,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx="50" cy="50" r={R} stroke={c.surface3} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx="50"
          cy="50"
          r={R}
          stroke={color ?? c.brand}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          animatedProps={animatedProps}
          /* opened at the top and walked clockwise, the same origin and
             direction the dial's arc uses */
          transform="rotate(-90 50 50)"
        />
      </Svg>
      {label ? (
        <Text style={{ fontFamily: 'Newsreader', fontSize: t.sm, color: c.ink }}>{label}</Text>
      ) : null}
    </View>
  );
}
