const { haalvingPreset } = require('@haalving/shared/tailwind-preset');

/**
 * NativeWind cannot read CSS custom properties the way a browser does, so the
 * preset's `var(--x)` values are resolved to literals here from the same token
 * object the web preset is built from — one source, two consumers.
 *
 * Dark mode is a designed counterpart, not an inversion, so it is declared as an
 * explicit palette rather than derived.
 */
const { tokens } = require('@haalving/shared/tokens');

const light = tokens.colors.light;
const dark = tokens.colors.dark;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: light.bg,
        surface: { DEFAULT: light.surface, 2: light.surface2, 3: light.surface3 },
        ink: { DEFAULT: light.ink, 2: light.ink2, 3: light.ink3 },
        line: { DEFAULT: light.line, soft: light.lineSoft, strong: light.lineStrong },
        brand: { DEFAULT: light.brand, 2: light.brand2, wash: light.brandWash, fill: light.brandFill },
        fitness: { DEFAULT: light.fitness, deep: light.fitnessDeep, wash: light.fitnessWash },
        culture: { DEFAULT: light.culture, deep: light.cultureDeep, wash: light.cultureWash },
        yoga: { DEFAULT: light.yoga, deep: light.yogaDeep, wash: light.yogaWash },
        wellness: { DEFAULT: light.wellness, deep: light.wellnessDeep, wash: light.wellnessWash },
        ok: { DEFAULT: light.ok, wash: light.okWash },
        amber: { DEFAULT: light.amber, wash: light.amberWash },
        danger: { DEFAULT: light.danger, wash: light.dangerWash, fill: light.dangerFill },
        'dark-bg': dark.bg,
        'dark-surface': dark.surface,
        'dark-ink': dark.ink,
      },
      fontFamily: {
        /* every numeral in the app is set in this face */
        data: ['Newsreader'],
      },
      spacing: {
        s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40, s9: 56, s10: 72,
      },
      borderRadius: { sm: 10, md: 14, lg: 16, xl: 24, full: 999 },
      fontSize: {
        display: 40, h1: 26, h2: 20, h3: 16, body: 15, sm: 14, xs: 13, micro: 12,
      },
    },
  },
  plugins: [],
};
