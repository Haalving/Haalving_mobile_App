import Svg, { Circle, Ellipse, Line, Path, Rect, type SvgProps } from 'react-native-svg';

/**
 * THE MARK SET — every icon the demo draws, in the demo's own geometry.
 *
 * PORTED, NOT REDRAWN. Each entry below was read straight out of `ICONS`
 * (core.js:2322) and turned into primitives: the same 24-box coordinates, the same
 * curves, the same order of parts. Redrawing them by eye would have produced marks
 * that are close, and "close" across seventy icons is a different drawn language.
 *
 * DATA, NOT COMPONENTS. Seventy hand-written JSX blocks would be seventy places to
 * mistype a coordinate. A table of primitives cannot drift from the demo without
 * the diff saying so.
 *
 * Stroke 1.6, round caps and round joins are set here rather than in a stylesheet:
 * app.css repeats `stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round`
 * on every icon rule it writes, and React Native has no cascade to inherit it from.
 */

/** One drawn part: a path, a circle, a rect, an ellipse or a line. */
type Prim =
  | { p: string }
  /** cx, cy, r */
  | { c: [number, number, number] }
  /** x, y, width, height, rx */
  | { r: [number, number, number, number, number] }
  /** cx, cy, rx, ry */
  | { e: [number, number, number, number] }
  /** x1, y1, x2, y2 */
  | { l: [number, number, number, number] };

const MARKS = {
  home: [{ p: 'M3 11.5 12 4l9 7.5M5.5 10v9h13v-9' }],
  cal: [{ r: [4, 6, 16, 14, 2] }, { p: 'M4 10h16M8 4v4M16 4v4' }],
  chat: [{ p: 'M4 6h16v10H9l-5 4z' }],
  circle: [{ c: [12, 12, 8] }, { p: 'M8.5 10.5h7M8.5 14h4.5' }],
  chart: [{ p: 'M4 20V9M10 20V4M16 20v-8M21 20H3' }],
  user: [{ c: [12, 8, 3.5] }, { p: 'M5 20c1.3-3.5 4-5 7-5s5.7 1.5 7 5' }],
  users: [{ c: [9, 8.5, 3] }, { p: 'M3.5 19c1-2.8 3.1-4.2 5.5-4.2s4.5 1.4 5.5 4.2M15.5 6a2.8 2.8 0 1 1 0 5.6M17 14.9c2 .4 3.4 1.7 4 4.1' }],
  tribe: [{ c: [12, 6.5, 2.6] }, { c: [5.2, 9.5, 2.1] }, { c: [18.8, 9.5, 2.1] }, { p: 'M8.4 20c.6-3.1 2-4.7 3.6-4.7s3 1.6 3.6 4.7M2.3 18.3c.5-2.3 1.6-3.6 3.1-3.9M21.7 18.3c-.5-2.3-1.6-3.6-3.1-3.9' }],
  zone: [{ r: [3.6, 8.2, 12.2, 12.2, 2.6] }, { p: 'M8.2 6.2a2.6 2.6 0 0 1 2.6-2.6h7a2.6 2.6 0 0 1 2.6 2.6v7a2.6 2.6 0 0 1-2.6 2.6' }, { p: 'M6.4 17c1.2-2.6 2.5-3.9 3.9-3.9 1.1 0 1.9.8 2.4 2.3' }],
  bulb: [{ p: 'M9.5 18h5M10.5 21h3M12 3.5a5.5 5.5 0 0 1 3 10.1c-.7.5-1 1.3-1 2.4h-4c0-1.1-.3-1.9-1-2.4a5.5 5.5 0 0 1 3-10.1z' }],
  bookmark: [{ p: 'M7 4h10v16l-5-3.5L7 20z' }],
  more: [{ c: [5.5, 12, 0.9] }, { c: [12, 12, 0.9] }, { c: [18.5, 12, 0.9] }],
  camera: [{ p: 'M4 8h3l2-2.5h6L17 8h3v11H4z' }, { c: [12, 13, 3.4] }],
  grid: [{ r: [4, 4, 7, 7, 1.5] }, { r: [13, 4, 7, 7, 1.5] }, { r: [4, 13, 7, 7, 1.5] }, { r: [13, 13, 7, 7, 1.5] }],
  heart: [{ p: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z' }],
  flow: [{ c: [6, 6, 2.5] }, { c: [18, 12, 2.5] }, { c: [6, 18, 2.5] }, { p: 'M8.5 6H14a2 2 0 0 1 2 2v1.5M8.5 18H14a2 2 0 0 0 2-2v-1.5' }],
  check: [{ p: 'M4 12.5 9.5 18 20 6.5' }],
  gear: [{ c: [12, 12, 3] }, { p: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1' }],
  menu: [{ p: 'M4 7h16M4 12h16M4 17h16' }],
  mic: [{ r: [9.5, 4, 5, 10, 2.5] }, { p: 'M6 12a6 6 0 0 0 12 0M12 18v3' }],
  phone: [{ p: 'M5 4.5C5 3.7 5.7 3 6.5 3h2L10 7.5 8 9.3a13.5 13.5 0 0 0 6.7 6.7l1.8-2L21 15.5v2c0 .8-.7 1.5-1.5 1.5C10.8 19 5 13.2 5 4.5z' }],
  device: [{ r: [7.5, 3.5, 9, 17, 2.4] }, { p: 'M10.5 17.5h3' }],
  video: [{ r: [3.5, 7, 12, 10, 2] }, { p: 'M15.5 11l5-2.5v7l-5-2.5' }],
  sound: [{ p: 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4z' }, { p: 'M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8' }],
  drop: [{ p: 'M12 4.5c2.9 3.3 5 6.1 5 8.8a5 5 0 0 1-10 0c0-2.7 2.1-5.5 5-8.8z' }],
  moon: [{ p: 'M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z' }],
  bowl: [{ p: 'M4.5 12.5h15a7.5 7.5 0 0 1-5 6.3v1.2h-5v-1.2a7.5 7.5 0 0 1-5-6.3z' }, { p: 'M10 9.5c0-1.2 1-1.6 1-2.8M14 9.5c0-1.2 1-1.6 1-2.8' }],
  leaf: [{ p: 'M6 18C6 10 11 5.5 19 5c.5 8-4 13-13 13z' }, { p: 'M6 18c2.5-5 6-8.5 10-10.5' }],
  sprout: [{ p: 'M12 20.5v-7' }, { p: 'M12 13.5C12 10 9.5 7.5 6 7.5c0 3.5 2.5 6 6 6z' }, { p: 'M12 11.5c0-3 2-5.5 6-5.5 0 3-2 5.5-6 5.5z' }],
  lock: [{ r: [5.5, 10.5, 13, 9, 2] }, { p: 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5' }],
  sparkle: [{ p: 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z' }],
  bell: [{ p: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15z' }, { p: 'M10 21a2.2 2.2 0 0 0 4 0' }],
  award: [{ c: [12, 9, 5] }, { p: 'M9.2 13.3 7.5 20l4.5-2.5L16.5 20l-1.7-6.7' }],
  ruler: [{ r: [9, 3, 6, 18, 1.5] }, { p: 'M9 7.5h3M9 12h3M9 16.5h3' }],
  gauge: [{ p: 'M5 17a8 8 0 1 1 14 0' }, { p: 'M12 13.5 15.5 10' }, { c: [12, 14.5, 1.2] }],
  target: [{ c: [12, 12, 8] }, { c: [12, 12, 4.5] }, { c: [12, 12, 1.2] }],
  doc: [{ p: 'M7 3.5h7l4 4V20.5H7z' }, { p: 'M14 3.5V8h4M10 12.5h5M10 16h5' }],
  clock: [{ c: [12, 12, 8.5] }, { p: 'M12 7.5V12l3 2' }],
  sun: [{ c: [12, 12, 4] }, { p: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4' }],
  walk: [{ c: [13.5, 4.5, 1.7] }, { p: 'M13 7.5 10.5 12l3 3 1 5.5M10.5 12 8 14l-1.5 5.5M13 7.5l3 2 2.5 1' }],
  play: [{ p: 'M8.5 5.5 18 12l-9.5 6.5z' }],
  pause: [{ p: 'M9 5.5v13M15 5.5v13' }],
  plus: [{ p: 'M12 5v14M5 12h14' }],
  plusbox: [{ r: [4, 4, 16, 16, 3.6] }, { p: 'M12 8.6v6.8M8.6 12h6.8' }],
  minus: [{ p: 'M5 12h14' }],
  arrow: [{ p: 'M5 12h14M13 6l6 6-6 6' }],
  chevL: [{ p: 'M14.5 5 8 12l6.5 7' }],
  chevR: [{ p: 'M9.5 5 16 12l-6.5 7' }],
  info: [{ c: [12, 12, 8.5] }, { p: 'M12 11v5M12 7.8v.1' }],
  scale: [{ r: [4, 4, 16, 16, 3] }, { p: 'M8.3 10.5a4.5 4.5 0 0 1 7.4 0M12 12.5l1.8-2' }],
  flag: [{ p: 'M6 21V4' }, { p: 'M6 5h11l-2.5 3.5L17 12H6' }],
  shield: [{ p: 'M12 3.5 19 6v5.5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z' }],
  flame: [{ p: 'M12 3.5c.8 3.2-4.5 5.3-4.5 10a4.5 4.5 0 0 0 9 .2c0-2.2-1.2-3.6-2-4.7-.9 1-1.4 2-1.2 3.2-1.5-1.6-1.8-5.2-1.3-8.7z' }],
  pencil: [{ p: 'M4 20l1-4L16.5 4.5a2.12 2.12 0 0 1 3 3L8 19z' }, { p: 'M14.5 6.5l3 3' }],
  search: [{ c: [11, 11, 6.5] }, { p: 'M15.7 15.7 20 20' }],
  send: [{ p: 'M4 11.5 20 4l-4.5 16-3.5-6.5z' }, { p: 'M12 13.5 20 4' }],
  x: [{ p: 'M6 6l12 12M18 6 6 18' }],
  warn: [{ p: 'M12 4 21 19.5H3z' }, { p: 'M12 10v4M12 16.6v.1' }],
  smile: [{ c: [12, 12, 8.5] }, { p: 'M8.4 14.1a4.3 4.3 0 0 0 7.2 0' }, { p: 'M9.2 9.5v.1M14.8 9.5v.1' }],
  clip: [{ p: 'M17.5 11.3 11.6 17a3.7 3.7 0 1 1-5.2-5.2l7-7a2.4 2.4 0 0 1 3.4 3.4l-6.9 7a1.2 1.2 0 0 1-1.7-1.7l5.9-5.9' }],
  scan: [{ p: 'M4 8.6V6.2A2.2 2.2 0 0 1 6.2 4h2.4M15.4 4h2.4A2.2 2.2 0 0 1 20 6.2v2.4M20 15.4v2.4a2.2 2.2 0 0 1-2.2 2.2h-2.4M8.6 20H6.2A2.2 2.2 0 0 1 4 17.8v-2.4' }, { p: 'M8.2 11.4h7.6a3.8 3.8 0 0 1-7.6 0z' }],
  star: [{ p: 'M12 3.6l2.6 5.75 6.25.72-4.65 4.2 1.25 6.18L12 17.3l-5.45 3.15 1.25-6.18-4.65-4.2 6.25-.72z' }],
  caretUp: [{ p: 'M6.5 14.5 12 9l5.5 5.5' }],
  caretDown: [{ p: 'M6.5 9.5 12 15l5.5-5.5' }],
  pulse: [{ p: 'M3 12.5h4.2l2.3-5.5 3.6 10 2.4-6.5 1.3 2h4.2' }],
  dumbbell: [{ p: 'M7 8.5v7M4.2 10v4M17 8.5v7M19.8 10v4M7 12h10' }],
  cutlery: [{ p: 'M7 3.8v4a2.3 2.3 0 0 0 4.6 0v-4M9.3 3.8v16.4' }, { e: [16.2, 6.8, 2.1, 3] }, { p: 'M16.2 9.8v10.4' }],
  meditate: [{ c: [12, 5.6, 2.1] }, { p: 'M9.9 9.2C8.1 10 7 11.6 6.4 13.9M14.1 9.2c1.8.8 2.9 2.4 3.5 4.7M4.6 17.6c2.2-2.3 4.7-3.4 7.4-3.4s5.2 1.1 7.4 3.4' }],
  molecule: [{ c: [12, 5.6, 2.3] }, { c: [5.8, 16.4, 2.3] }, { c: [18.2, 16.4, 2.3] }, { p: 'M10.8 7.6 7 14.4M13.2 7.6 17 14.4M8.1 16.4h7.8' }],
  microbe: [{ p: 'M12 4.2c3.5 0 6.3 2.7 6.3 6.1 0 4.1-2.5 9.5-6.3 9.5s-6.3-5.4-6.3-9.5c0-3.4 2.8-6.1 6.3-6.1z' }, { c: [10.1, 10.4, 1.1] }, { c: [14, 13.2, 1.1] }],
  kidney: [{ p: 'M14.6 4c3 0 5.4 3.6 5.4 8s-2.4 8-5.4 8c-2.2 0-3.5-1.7-4.4-3.3-1.2-2-3.2-2.8-4.8-3.6-1.1-.6-1.4-1-1.4-1.4s.3-.8 1.4-1.4c1.6-.8 3.6-1.6 4.8-3.6C11.1 5.7 12.4 4 14.6 4z' }, { p: 'M14.4 8.4 11.6 12h3.5' }],
  liver: [{ p: 'M3.6 9.4c4.2-2.6 11.3-3.5 17-1.4-.4 5.6-3.4 9.7-8.1 10.7-4.1.9-7.6-1.3-8.7-5.1-.3-1.2-.4-2.6-.2-4.2z' }, { p: 'M12.5 18.7c.3-3.1 1.8-5.6 4.6-7.2' }],
  lipid: [{ c: [9.2, 10, 4.4] }, { c: [15.6, 14.8, 3.6] }],
  sugar: [{ p: 'M12 3.6 20 8v8l-8 4.4L4 16V8z' }, { p: 'M4 8l8 4.4L20 8M12 12.4v8' }],
  thyroid: [{ p: 'M12 8.4v6.2' }, { p: 'M12 9.2C10.6 7 8.5 6 6.7 6.6 4.6 7.2 4 9.5 4.8 11.8c.8 2.3 2.9 3.8 5 3.3 1.4-.3 2.2-1.6 2.2-3z' }, { p: 'M12 9.2c1.4-2.2 3.5-3.2 5.3-2.6 2.1.6 2.7 2.9 1.9 5.2-.8 2.3-2.9 3.8-5 3.3-1.4-.3-2.2-1.6-2.2-3z' }],
  flask: [{ p: 'M8.4 3.5h7.2M10 3.5v6.2l-3.9 7.6a2.2 2.2 0 0 0 2 3.2h7.8a2.2 2.2 0 0 0 2-3.2L14 9.7V3.5' }, { p: 'M7.6 14.6h8.8' }],
  body: [{ c: [12, 3.9, 1.8] }, { p: 'M7.8 7.7h8.4M8.7 10.2h6.6M9.5 12.7h5M9.1 15.2h5.8M10.1 17.7h3.8' }, { e: [12, 20.8, 5.4, 1.4] }],
} as const satisfies Record<string, readonly Prim[]>;

export type IconName = keyof typeof MARKS;

/**
 * Marks the demo fills rather than strokes.
 *
 * The hairline language yields in exactly two places, and both are deliberate: a
 * rating must read at a glance, and a lit day on the streak row is a state, not an
 * outline. Everything else is a stroke.
 */
const FILLABLE = ['star', 'flame', 'play', 'drop'] as const;

export function Icon({
  name,
  size = 23,
  color,
  strokeWidth = 1.6,
  filled = false,
  ...rest
}: SvgProps & {
  name: IconName | string;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Fill instead of stroke. Only honoured for the marks the demo fills. */
  filled?: boolean;
}) {
  const parts: readonly Prim[] = MARKS[name as IconName] ?? MARKS.leaf;
  const solid = filled && (FILLABLE as readonly string[]).includes(name);
  const paint = solid
    ? { fill: color, stroke: 'none' as const }
    : {
        fill: 'none' as const,
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      {parts.map((part, i) => {
        if ('p' in part) return <Path key={i} d={part.p} {...paint} />;
        if ('c' in part) return <Circle key={i} cx={part.c[0]} cy={part.c[1]} r={part.c[2]} {...paint} />;
        if ('e' in part) return <Ellipse key={i} cx={part.e[0]} cy={part.e[1]} rx={part.e[2]} ry={part.e[3]} {...paint} />;
        if ('l' in part) return <Line key={i} x1={part.l[0]} y1={part.l[1]} x2={part.l[2]} y2={part.l[3]} {...paint} />;
        return (
          <Rect
            key={i}
            x={part.r[0]}
            y={part.r[1]}
            width={part.r[2]}
            height={part.r[3]}
            rx={part.r[4]}
            {...paint}
          />
        );
      })}
    </Svg>
  );
}
