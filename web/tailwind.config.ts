import type { Config } from 'tailwindcss';
import { haalvingPreset } from '@haalving/shared/tailwind-preset';

/**
 * Tailwind fills the gaps BETWEEN the demo's own classes — it does not replace
 * them. `.card`, `.trow`, `.list` and the rest live in demo-classes.css because
 * they carry rules a utility framework cannot express, and because their names
 * are what keep the port pixel-identical.
 *
 * Preflight is OFF. Tailwind's reset would fight the demo's own base block —
 * both set margins, both set box-sizing, and the demo's version is the one the
 * screens were designed against.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  presets: [haalvingPreset as never],
  theme: { extend: {} },
  plugins: [],
};

export default config;
