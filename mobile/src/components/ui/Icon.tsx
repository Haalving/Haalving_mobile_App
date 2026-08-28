import Svg, { Circle, Ellipse, Line, Path, Rect, type SvgProps } from 'react-native-svg';
import type { ReactElement } from 'react';

/**
 * The mark set, for React Native.
 *
 * The paths are the SAME 24-box geometry the web ships — one drawn language
 * across both apps. Only the tab-bar marks are here today; the rest arrive with
 * the screens that use them, so the bundle carries nothing it does not draw.
 *
 * Stroke 1.6 and round caps are set here rather than in a stylesheet, because
 * React Native has no cascade to inherit them from.
 */
const PATHS: Record<string, (p: { color: string; w: number }) => ReactElement> = {
  cal: ({ color, w }) => (
    <>
      <Rect x="4" y="6" width="16" height="14" rx="2" stroke={color} strokeWidth={w} fill="none" />
      <Path d="M4 10h16M8 4v4M16 4v4" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  sun: ({ color, w }) => (
    <>
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={w} fill="none" />
      <Path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        stroke={color}
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  circle: ({ color, w }) => (
    <>
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={w} fill="none" />
      <Path d="M8.5 10.5h7M8.5 14h4.5" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  pulse: ({ color, w }) => (
    <Path
      d="M3 12.5h4.2l2.3-5.5 3.6 10 2.4-6.5 1.3 2h4.2"
      stroke={color}
      strokeWidth={w}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  tribe: ({ color, w }) => (
    <>
      <Circle cx="12" cy="6.5" r="2.6" stroke={color} strokeWidth={w} fill="none" />
      <Circle cx="5.2" cy="9.5" r="2.1" stroke={color} strokeWidth={w} fill="none" />
      <Circle cx="18.8" cy="9.5" r="2.1" stroke={color} strokeWidth={w} fill="none" />
      <Path
        d="M8.4 20c.6-3.1 2-4.7 3.6-4.7s3 1.6 3.6 4.7M2.3 18.3c.5-2.3 1.6-3.6 3.1-3.9M21.7 18.3c-.5-2.3-1.6-3.6-3.1-3.9"
        stroke={color}
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  user: ({ color, w }) => (
    <>
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth={w} fill="none" />
      <Path d="M5 20c1.3-3.5 4-5 7-5s5.7 1.5 7 5" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  leaf: ({ color, w }) => (
    <>
      <Path d="M6 18C6 10 11 5.5 19 5c.5 8-4 13-13 13z" stroke={color} strokeWidth={w} fill="none" strokeLinejoin="round" />
      <Path d="M6 18c2.5-5 6-8.5 10-10.5" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  lock: ({ color, w }) => (
    <>
      <Rect x="5.5" y="10.5" width="13" height="9" rx="2" stroke={color} strokeWidth={w} fill="none" />
      <Path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  phone: ({ color, w }) => (
    <Path
      d="M5 4.5C5 3.7 5.7 3 6.5 3h2L10 7.5 8 9.3a13.5 13.5 0 0 0 6.7 6.7l1.8-2L21 15.5v2c0 .8-.7 1.5-1.5 1.5C10.8 19 5 13.2 5 4.5z"
      stroke={color}
      strokeWidth={w}
      fill="none"
      strokeLinejoin="round"
    />
  ),
  device: ({ color, w }) => (
    <>
      <Rect x="7.5" y="3.5" width="9" height="17" rx="2.4" stroke={color} strokeWidth={w} fill="none" />
      <Path d="M10.5 17.5h3" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  ),
  ellipsePlaceholder: ({ color, w }) => (
    <Ellipse cx="12" cy="12" rx="8" ry="8" stroke={color} strokeWidth={w} fill="none" />
  ),
  linePlaceholder: ({ color, w }) => <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={w} />,
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 23,
  color,
  strokeWidth = 1.6,
  ...rest
}: SvgProps & { name: IconName | string; size?: number; color: string; strokeWidth?: number }) {
  const draw = PATHS[name as IconName] ?? PATHS.leaf!;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      {draw({ color, w: strokeWidth })}
    </Svg>
  );
}
