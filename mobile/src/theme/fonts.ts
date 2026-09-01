import { useFonts } from 'expo-font';

/**
 * The numeral face, in three static cuts.
 *
 * WHY NOT THE VARIABLE FILE. `newsreader-var.ttf` is a real variable font with a
 * wght axis (400–600) and an opsz axis (6–72), and React Native has no API for
 * either: the axes stay pinned at their defaults, so every numeral the demo sets
 * at `font-weight:500` — the dial readout, `.stat .v`, `.strow b`, `.ring .rl`,
 * `.mbig`, `.score-hero .n` — would render at 400 on iOS, and Android would
 * synthesise a fake bold instead. `fontWeight` cannot fix that; only separate
 * files can.
 *
 * So three cuts are instantiated from the variable file at build time (wght 400,
 * 500, 600, opsz pinned to its default 18) and registered under EXPLICIT family
 * names. The alias matters: the variable file's internal family is
 * "Newsreader 16pt", and Android resolves by that internal name — load it without
 * an alias and every numeral silently falls back to the system serif.
 *
 * The variable file stays in the repo for the web harness, which CAN vary an axis,
 * but nothing native loads it.
 */

export const NUM_FAMILY = {
  400: 'Newsreader-Regular',
  500: 'Newsreader-Medium',
  600: 'Newsreader-SemiBold',
} as const;

export type NumWeight = keyof typeof NUM_FAMILY;

/**
 * The family for a demo weight.
 *
 * The demo writes a weight; React Native needs a family. Anything between the
 * three cuts rounds DOWN rather than up — a numeral that is too heavy reads as
 * emphasis the design did not ask for, and too light reads as the same text.
 */
export function numFamily(weight: number = 400): string {
  if (weight >= 600) return NUM_FAMILY[600];
  if (weight >= 500) return NUM_FAMILY[500];
  return NUM_FAMILY[400];
}

/**
 * Load them. Returns false until every cut is ready.
 *
 * The app must not draw before this is true: a first paint in the fallback serif
 * and a second in Newsreader is a visible reflow on every screen carrying a
 * number, which is most of them.
 */
export function useNumerals(): boolean {
  const [loaded] = useFonts({
    'Newsreader-Regular': require('../../assets/Newsreader-Regular.ttf'),
    'Newsreader-Medium': require('../../assets/Newsreader-Medium.ttf'),
    'Newsreader-SemiBold': require('../../assets/Newsreader-SemiBold.ttf'),
  });
  return loaded;
}
