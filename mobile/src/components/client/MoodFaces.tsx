import Svg, { Circle, Path } from 'react-native-svg';

import type { Mood } from '@/api/client-app';

/**
 * THE FOUR FACES, ported line for line from the demo (client-today.js MOODS).
 *
 * Faces are hairline marks — the chosen one wears brand ink; expression lives
 * in the drawing, never in a colour per mood. `sm` is the answering face (the
 * picker and the seven-day strip), `lg` the listening one (the band and the top
 * of the sheet). The words beside them are the demo's own.
 */
export const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  drained: 'Drained',
};

export const MOOD_LINE: Record<Mood, string> = {
  happy: 'Carry it gently — happiness shared with the tribe multiplies.',
  sad: 'Noted, softly. A slower plate and an easier practice are honourable today.',
  angry: 'Heat is fuel. Tonight’s session will take it from you.',
  drained: 'Rest is part of the programme, not a break from it.',
};

export const NEUTRAL_LINE = 'A mood is weather, not climate — name it and it loosens its grip.';

/* the drawings: a ring and one path each, in a 24-box */
const SM: Record<Mood, { r: number; d: string }> = {
  happy: { r: 8.5, d: 'M9 10.1v.01M15 10.1v.01M8.8 14.1c.9 1.2 2 1.8 3.2 1.8s2.3-.6 3.2-1.8' },
  sad: { r: 8.5, d: 'M9 10.1v.01M15 10.1v.01M8.8 15.9c.9-1.2 2-1.8 3.2-1.8s2.3.6 3.2 1.8' },
  angry: { r: 8.5, d: 'M8.2 9.4l2.6 1M15.8 9.4l-2.6 1M9.7 12.4v.01M14.3 12.4v.01M9.3 15.6h5.4' },
  drained: { r: 8.5, d: 'M8.1 10.6h2.3M13.6 10.6h2.3M9.6 15.4c.8.5 1.7.7 2.6.5' },
};

const LG: Record<Mood, { r: number; d: string }> = {
  happy: { r: 9.3, d: 'M8.9 9.9v.01M15.1 9.9v.01M7.2 12.6c.5-.4 1-.6 1.6-.7M16.8 12.6c-.5-.4-1-.6-1.6-.7M8.2 13.9c1 1.6 2.3 2.4 3.8 2.4s2.8-.8 3.8-2.4' },
  sad: { r: 9.3, d: 'M8.2 8.9c.5-.3 1.1-.4 1.7-.3M15.8 8.9c-.5-.3-1.1-.4-1.7-.3M9 11.2v.01M15 11.2v.01M8.4 16.4c1-1.5 2.2-2.2 3.6-2.2s2.6.7 3.6 2.2' },
  angry: { r: 9.3, d: 'M7.8 8.8l3 1.3M16.2 8.8l-3 1.3M12 8.1v1.1M9.5 12.6v.01M14.5 12.6v.01M9 15.9c1-.4 2-.6 3-.6s2 .2 3 .6' },
  drained: { r: 9.3, d: 'M7.9 11h2.7M13.4 11h2.7M9.8 15.7c.9.6 1.9.8 2.9.6' },
};

/* the neutral face — a ring, two eyes, a level mouth (NEUTRAL_FACE) */
const NEUTRAL = { r: 9.3, d: 'M9 10.3v.01M15 10.3v.01M9.4 14.8h5.2' };

export function MoodFace({
  mood,
  size,
  color,
  variant = 'sm',
  strokeWidth = 1.4,
}: {
  mood: Mood | null;
  size: number;
  color: string;
  /** `sm` answers, `lg` listens */
  variant?: 'sm' | 'lg';
  strokeWidth?: number;
}) {
  const face = mood ? (variant === 'lg' ? LG[mood] : SM[mood]) : NEUTRAL;
  const stroke = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={face.r} {...stroke} />
      <Path d={face.d} {...stroke} />
    </Svg>
  );
}

/** A day with no arrival on the seven-day strip — the demo's dashed ring. */
export function EmptyDayFace({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="2.2 2.6" strokeLinecap="round" />
    </Svg>
  );
}
