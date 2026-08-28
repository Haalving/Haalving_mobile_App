/**
 * HAALVING design tokens — "Instrument".
 *
 * Extracted VERBATIM from demo/app/css/app.css (`:root` and the
 * `prefers-color-scheme: dark` block). The client has accepted the demo's
 * screens, so these values are the contract: the port matches the demo pixel for
 * pixel, and any change here is a visual regression until someone signs it off.
 *
 * Two rules in this system are load-bearing and easy to break:
 *
 *  1. SERIF IS FOR DATA. Every numeral in the app is set in `fontData`
 *     (Newsreader, self-hosted, preloaded). Prose is the system sans. Applied
 *     with `class="num"`.
 *  2. A PILLAR'S COLOUR APPEARS ONLY in that pillar's own dial, dot, ribbon and
 *     series. The moment it is used decoratively it stops being a signal.
 *
 * Dark mode is a DESIGNED COUNTERPART, not an inversion. Note especially the
 * accent/fill split: `brand` and `danger` are INK on neutral grounds, while
 * `brandFill` and `dangerFill` are GROUNDS that carry white text. Dark mode
 * lifts the accents to stay legible on dark surfaces, which would drop
 * white-on-fill contrast to ~2.9:1 if the two were one token.
 */

export interface ColorScale {
  /* — surface: sea stone, the limestone of a Sardinian terrace under cloud — */
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;

  /* — ink: botanical black, never pure — */
  ink: string;
  ink2: string;
  /** Carries every caption, kicker and tab label, so it is held to body-text contrast. */
  ink3: string;
  line: string;
  lineSoft: string;
  /** A hairline that has to MEAN something (an unfilled star) — 3:1, not 1.3:1. */
  lineStrong: string;

  /* — brand: deep sea teal — */
  brand: string;
  brand2: string;
  brandWash: string;
  /** The FILL that carries white text. Kept separate from `brand` on purpose. */
  brandFill: string;

  /** Ink for text sitting ON a pillar fill. Flips in dark mode; the fills lift. */
  pillarInk: string;

  /* — the four pillars: deep, jewel-like, each with a genuinely pale wash — */
  fitness: string;
  fitnessDeep: string;
  fitnessWash: string;
  culture: string;
  cultureDeep: string;
  cultureWash: string;
  yoga: string;
  yogaDeep: string;
  yogaWash: string;
  wellness: string;
  wellnessDeep: string;
  wellnessWash: string;

  /**
   * Tracker series. A signal drawn as a series gets a colour exactly as a pillar
   * does; these are deliberately NOT the pillar hues, because a tracker is a
   * reading and a pillar is a standing. Only the three movement colours ever
   * appear together, so they are the only three that must hold apart at a glance.
   */
  tkMove: string;
  tkTime: string;
  tkBurn: string;
  tkRest: string;
  tkWater: string;
  tkScreen: string;

  /* — states — */
  ok: string;
  okWash: string;
  amber: string;
  amberWash: string;
  danger: string;
  dangerWash: string;
  /** The ground that carries white text, as `brandFill` is to `brand`. */
  dangerFill: string;
}

export const lightColors: ColorScale = {
  bg: '#ECEEEA',
  surface: '#FFFFFF',
  surface2: '#F6F7F4',
  surface3: '#E4E7E1',

  ink: '#141A17',
  ink2: '#5B665F',
  ink3: '#666D68',
  line: '#DEE2DC',
  lineSoft: '#E9ECE6',
  lineStrong: '#8F9891',

  brand: '#0B5350',
  brand2: '#12817C',
  brandWash: '#E3EDEB',
  brandFill: '#0B5350',

  pillarInk: '#FFFFFF',

  fitness: '#9E3B1E',
  fitnessDeep: '#6E2712',
  fitnessWash: '#F7EAE3',
  culture: '#8A6210',
  cultureDeep: '#5C4108',
  cultureWash: '#F8F1DC',
  yoga: '#3C5A31',
  yogaDeep: '#283D21',
  yogaWash: '#E9EFE4',
  wellness: '#3A386C',
  wellnessDeep: '#26244B',
  wellnessWash: '#EAE9F4',

  tkMove: '#1F6F5C',
  tkTime: '#1D5A82',
  tkBurn: '#7A3E86',
  tkRest: '#4A4E8C',
  tkWater: '#1D6A8A',
  tkScreen: '#8A5A2B',

  ok: '#2F6B3C',
  okWash: '#E6EFE6',
  amber: '#8A6210',
  amberWash: '#F8F1DC',
  danger: '#8E2F22',
  dangerWash: '#F7E7E3',
  dangerFill: '#8E2F22',
};

/** Olive grove at dusk. Designed against the light set, never derived from it. */
export const darkColors: ColorScale = {
  bg: '#0D1211',
  surface: '#161D1B',
  surface2: '#1D2624',
  surface3: '#26302D',

  ink: '#E9EEE9',
  ink2: '#9BA79F',
  ink3: '#808E86',
  line: '#26302D',
  lineSoft: '#1F2826',
  lineStrong: '#5C6A63',

  brand: '#3FA8A0',
  brand2: '#5FC4BB',
  brandWash: '#122A29',
  brandFill: '#12706A',

  pillarInk: '#141A17',

  fitness: '#E08055',
  fitnessDeep: '#F0A987',
  fitnessWash: '#2A1810',
  culture: '#D9A63F',
  cultureDeep: '#EBC477',
  cultureWash: '#2A2110',
  yoga: '#7FA36B',
  yogaDeep: '#A3C191',
  yogaWash: '#182413',
  wellness: '#8E8AD1',
  wellnessDeep: '#ADA9E2',
  wellnessWash: '#1B1A2E',

  tkMove: '#4FB79C',
  tkTime: '#5EA6D6',
  tkBurn: '#BE86C8',
  tkRest: '#9094DC',
  tkWater: '#5AB1D0',
  tkScreen: '#D2A06A',

  ok: '#7DB185',
  okWash: '#16241A',
  amber: '#D9A63F',
  amberWash: '#2A2110',
  danger: '#D97B6A',
  dangerWash: '#2B1815',
  dangerFill: '#B04A38',
};

/**
 * The person lens: whose hours these are. Twelve identity colours for the
 * Schedule's multi-person view. Like the tracker series these are deliberately
 * NOT the pillar hues — a rail saying "Vikram" must never be mistaken for a dial
 * saying "Fitness". Read as a 4px rail on a pale wash.
 */
export const whoLight = [
  '#C0392F', '#B4611C', '#6E7A16', '#2F7D44',
  '#12786A', '#1C6E96', '#2F5CAC', '#5348A8',
  '#8340A0', '#AE3480', '#8C5A3C', '#5A6670',
] as const;

export const whoDark = [
  '#E8837B', '#E39A5C', '#B9C463', '#79BE86',
  '#55C4AF', '#66B6D8', '#86A9EC', '#9C96E6',
  '#C58ADD', '#E585BE', '#C8977A', '#A0AAB4',
] as const;

/**
 * Type. Eight fixed steps with NOTHING BELOW 12px (Design Handoff §1.9 — P3
 * Meena is the test reader).
 */
export const fontSize = {
  display: '40px',
  h1: '26px',
  h2: '20px',
  h3: '16px',
  body: '15px',
  sm: '14px',
  xs: '13px',
  micro: '12px',
} as const;

/**
 * The UI face stays a system stack: the right call for an Indian-market PWA
 * (free Devanagari, zero bytes). Inter was removed — it never rendered on Apple
 * or Windows, and it signalled a stack assembled rather than chosen.
 */
export const fontFamily = {
  ui: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI",system-ui,sans-serif',
  /** Newsreader, variable, self-hosted. Every numeral in the app is set in it. */
  data: '"Newsreader",ui-serif,"New York","Iowan Old Style",Georgia,serif',
} as const;

/** Spacing: 4-base, no exceptions. */
export const spacing = {
  s1: '4px',
  s2: '8px',
  s3: '12px',
  s4: '16px',
  s5: '20px',
  s6: '24px',
  s7: '32px',
  s8: '40px',
  s9: '56px',
  s10: '72px',
} as const;

/**
 * Radius. Cards top out at 16px; the full pill is reserved for tags and buttons,
 * so everything does not round into the same soft blob.
 */
export const radius = {
  sm: '10px',
  md: '14px',
  lg: '16px',
  xl: '24px',
  full: '999px',
} as const;

/**
 * Elevation: soft and large, never a hard 1px. Elevation marks the OUTERMOST
 * surface only — a raised tile inside a raised card is the nested-card tell.
 */
export const elevation = {
  e1: '0 1px 2px rgba(20,26,23,.04), 0 2px 8px rgba(20,26,23,.04)',
  e2: '0 1px 2px rgba(20,26,23,.05), 0 8px 24px rgba(20,26,23,.07)',
  e3: '0 2px 4px rgba(20,26,23,.06), 0 20px 48px rgba(20,26,23,.12)',
} as const;

export const elevationDark = {
  e1: '0 1px 2px rgba(0,0,0,.4)',
  e2: '0 4px 16px rgba(0,0,0,.45)',
  e3: '0 16px 48px rgba(0,0,0,.6)',
} as const;

/**
 * Motion: real objects decelerate, they do not bounce. The spring easing was
 * pulled — a product about calm longevity should not spring when it saves a note.
 */
export const motion = {
  ease: 'cubic-bezier(.22,.61,.36,1)',
  easeOut: 'cubic-bezier(.16,1,.3,1)',
  durationFast: '140ms',
  durationBase: '220ms',
  durationSlow: '340ms',
} as const;

/** Layout constants the shells key off. */
export const layout = {
  /** Tab-bar content height — composer, FAB and toast all key off this. */
  tabbarHeight: '64px',
  /** The client app's phone column, centred on desktop. */
  clientMaxWidth: '520px',
  /** The console's measure cap: text should never run the full window width. */
  consoleMaxWidth: '1180px',
  sidebarWidth: '244px',
  sidebarRailWidth: '68px',
  /** The finger target, where the drawn mark is smaller. */
  touchReach: '44px',
} as const;

export const tokens = {
  colors: { light: lightColors, dark: darkColors },
  who: { light: whoLight, dark: whoDark },
  fontSize,
  fontFamily,
  spacing,
  radius,
  elevation: { light: elevation, dark: elevationDark },
  motion,
  layout,
} as const;

export type Tokens = typeof tokens;

/* ------------------------------------------------------- CSS variable names */

/**
 * The demo's custom-property names, so ported markup can keep reaching for
 * `var(--s4)` and `var(--brand)` exactly as it did. The React components use
 * these rather than hard-coded hex, which is what keeps light and dark in step.
 */
export const cssVar = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  surface3: '--surface-3',
  ink: '--ink',
  ink2: '--ink-2',
  ink3: '--ink-3',
  line: '--line',
  lineSoft: '--line-soft',
  lineStrong: '--line-strong',
  brand: '--brand',
  brand2: '--brand-2',
  brandWash: '--brand-wash',
  brandFill: '--brand-fill',
  pillarInk: '--pillar-ink',
  ok: '--ok',
  amber: '--amber',
  danger: '--danger',
  dangerFill: '--danger-fill',
} as const;

/** `pillarVar('culture')` -> `--culture`. The dial reads its colour through this. */
export function pillarVar(key: string): string {
  return `--${key}`;
}
