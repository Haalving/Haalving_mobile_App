import { useColorScheme } from 'react-native';
import { tokens, type ColorScale } from '@haalving/shared';

/**
 * The palette, resolved for the current appearance.
 *
 * React Native has no CSS custom properties, so the web's one-block theme swap
 * becomes a hook. The VALUES are the same object the web reads — swapping them
 * here would put two palettes in one product, which is exactly how a port stops
 * looking like the thing it ported.
 *
 * Dark is a designed counterpart, never an inversion.
 */
export function useTheme(): ColorScale & { dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { ...(dark ? tokens.colors.dark : tokens.colors.light), dark };
}

export const spacing = {
  s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40, s9: 56, s10: 72,
} as const;

export const radius = { sm: 10, md: 14, lg: 16, xl: 24, full: 999 } as const;

/** Eight fixed steps, nothing below 12. */
export const type = {
  display: 40, h1: 26, h2: 20, h3: 16, body: 15, sm: 14, xs: 13, micro: 12,
} as const;

/** The tab-bar content height the composer, the FAB and the toast all key off. */
export const TABBAR_HEIGHT = 64;
