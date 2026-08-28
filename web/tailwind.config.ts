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

  /*
   * EVERY GENERATED UTILITY IS PREFIXED, and that is a correctness fix rather
   * than a style preference.
   *
   * Tailwind emits its utilities AFTER demo-classes.css, so a utility whose name
   * matches a demo class of equal specificity simply wins. Three of the demo's
   * 203 class names collide: `block`, `grow` and `ring`.
   *
   *   grow  — the demo grants `flex:1` only via `.row .grow`; a `.trow` is not a
   *           `.row`, so its middle column must size to content. Tailwind's bare
   *           `.grow{flex-grow:1}` matched anyway and stretched every digest row,
   *           throwing the session rings 410px right, hard against the card edge.
   *           This is the bug that prompted the change; it was invisible until
   *           the port was measured against the demo.
   *   ring  — Tailwind's `.ring` lands on every session ring and sets box-shadow.
   *           It renders as `none` today ONLY because preflight is off, so the
   *           `--tw-ring-*` defaults are never emitted and the value is invalid.
   *           Define one of those anywhere and all four pillars' rings gain a
   *           3px halo.
   *   block — `.btn.block` outranks it on specificity, so the demo wins by
   *           accident rather than by design.
   *
   * Nothing in web/src uses a Tailwind utility — the demo's classes are the
   * visual system — so prefixing costs nothing and makes the collision
   * unrepresentable instead of merely absent.
   */
  prefix: 'tw-',

  corePlugins: { preflight: false },
  presets: [haalvingPreset as never],
  theme: { extend: {} },
  plugins: [],
};

export default config;
