import { tokens, type ColorScale } from '@haalving/shared';

/**
 * The palette. FROZEN DARK, and not a hook over the system setting.
 *
 * The client app is always dark and there is no light variant to switch to.
 * `app.css:639` restates the whole dark palette on
 * `.ob, .scene.night, body:has(.shell-client)` — no media query, no toggle — and
 * `core.js:1609` stamps `shell-client` on the wrapper of every client screen, so
 * `prefers-color-scheme` never reaches this app. The CSS says why in its own
 * comment at :634: "a night scene must stay dark in BOTH colour schemes."
 *
 * This used to read `useColorScheme()` and return the light set on a phone set to
 * light. Every screen would then be measured against demo screenshots that are
 * always dark, every colour comparison would fail, and the obvious fix — adjusting
 * the tokens — would have been chasing the wrong thing entirely.
 *
 * The light palette still exists in `@haalving/shared` because the web console
 * uses it. It is simply unreachable from here.
 */
export const palette: ColorScale = Object.freeze({ ...tokens.colors.dark });

/** Kept as a hook so call sites read like the console's, and always dark. */
export function useTheme(): ColorScale & { dark: true } {
  return { ...palette, dark: true };
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

/**
 * Line height, resolved to absolute px.
 *
 * THERE IS NO PER-STEP LINE-HEIGHT TOKEN in the demo. `body` sets
 * `font:var(--t-body)/1.55` (app.css:196) and every element inherits the
 * multiplier, recomputing it against its own size. React Native has no unitless
 * lineHeight, so each step is resolved here once.
 *
 * `shared/tokens/tailwind-preset.ts` carries six invented line-heights that exist
 * nowhere in app.css. They are not used — see the note left in that file.
 */
export const leading = {
  display: 40 * 1.55,
  h1: 26 * 1.55,
  h2: 20 * 1.55,
  h3: 16 * 1.55,
  body: 15 * 1.55,
  sm: 14 * 1.55,
  xs: 13 * 1.55,
  micro: 12 * 1.55,
} as const;
