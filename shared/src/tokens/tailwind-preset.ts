/**
 * Tailwind preset — the design tokens as utility classes.
 *
 * Every colour maps to the CSS CUSTOM PROPERTY, never to a hex literal. That is
 * the whole point: `bg-surface` resolves to `var(--surface)`, so light and dark
 * are one rule and the theme switch stays a single block of variables, exactly as
 * app.css has it. A preset that inlined hex would need a `dark:` twin on every
 * utility and the two would drift apart within a week.
 *
 * The ported layout classes (`.card`, `.trow`, `.list`, ...) stay hand-written
 * CSS. They ARE the visual system and carry rules Tailwind cannot express — the
 * nested-card suppression, the `.grow`-scoped-to-`.row` rule, the touch-reach
 * pseudo-elements. Tailwind here is for the gaps between those, not a
 * replacement for them.
 */

type PresetConfig = {
  theme: {
    extend: Record<string, unknown>;
  };
};

export const haalvingPreset: PresetConfig = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
        },
        line: {
          DEFAULT: 'var(--line)',
          soft: 'var(--line-soft)',
          strong: 'var(--line-strong)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          2: 'var(--brand-2)',
          wash: 'var(--brand-wash)',
          /* the ground that carries white text — never interchangeable with DEFAULT */
          fill: 'var(--brand-fill)',
        },
        /* the four pillars. A pillar's colour appears ONLY in that pillar's own
           dial, dot, ribbon and series — these utilities exist for those, and
           using one decoratively breaks the system's one colour law. */
        fitness: {
          DEFAULT: 'var(--fitness)',
          deep: 'var(--fitness-deep)',
          wash: 'var(--fitness-wash)',
        },
        culture: {
          DEFAULT: 'var(--culture)',
          deep: 'var(--culture-deep)',
          wash: 'var(--culture-wash)',
        },
        yoga: {
          DEFAULT: 'var(--yoga)',
          deep: 'var(--yoga-deep)',
          wash: 'var(--yoga-wash)',
        },
        wellness: {
          DEFAULT: 'var(--wellness)',
          deep: 'var(--wellness-deep)',
          wash: 'var(--wellness-wash)',
        },
        'pillar-ink': 'var(--pillar-ink)',
        tk: {
          move: 'var(--tk-move)',
          time: 'var(--tk-time)',
          burn: 'var(--tk-burn)',
          rest: 'var(--tk-rest)',
          water: 'var(--tk-water)',
          screen: 'var(--tk-screen)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          wash: 'var(--ok-wash)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          wash: 'var(--amber-wash)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          wash: 'var(--danger-wash)',
          fill: 'var(--danger-fill)',
        },
      },

      fontFamily: {
        ui: 'var(--f-ui)',
        /* every numeral in the app speaks in this face */
        data: 'var(--f-data)',
      },

      /* eight fixed steps, nothing below 12px */
      /*
       * THESE LINE-HEIGHTS ARE NOT IN THE DEMO, and nothing should trust them.
       *
       * app.css defines no per-step line-height token. `body` sets
       * `font:var(--t-body)/1.55` (app.css:196) and every element inherits that
       * multiplier, recomputing it against its own font-size — so the real value
       * for any step is size x 1.55, not a number chosen per step.
       *
       * The mobile port resolves them itself in mobile/src/theme/tokens.ts
       * (`leading`), because React Native has no unitless lineHeight. Left here
       * rather than deleted only because the web console may already lean on them;
       * do not port them, and do not measure the app against them.
       */
      fontSize: {
        display: ['var(--t-display)', { lineHeight: '1.1', letterSpacing: '-.03em' }],
        h1: ['var(--t-h1)', { lineHeight: '1.2', letterSpacing: '-.022em' }],
        h2: ['var(--t-h2)', { lineHeight: '1.3', letterSpacing: '-.015em' }],
        h3: ['var(--t-h3)', { lineHeight: '1.4' }],
        body: ['var(--t-body)', { lineHeight: '1.55' }],
        sm: ['var(--t-sm)', { lineHeight: '1.5' }],
        xs: ['var(--t-xs)', { lineHeight: '1.45' }],
        micro: ['var(--t-micro)', { lineHeight: '1.4' }],
      },

      /* 4-base, no exceptions */
      spacing: {
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        s5: 'var(--s5)',
        s6: 'var(--s6)',
        s7: 'var(--s7)',
        s8: 'var(--s8)',
        s9: 'var(--s9)',
        s10: 'var(--s10)',
      },

      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        full: 'var(--r-full)',
      },

      /* soft and large, never a hard 1px */
      boxShadow: {
        e1: 'var(--e1)',
        e2: 'var(--e2)',
        e3: 'var(--e3)',
      },

      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: '140ms',
        base: '220ms',
        slow: '340ms',
      },

      maxWidth: {
        client: '520px',
        console: '1180px',
        /* ~75 characters, the comfortable limit before the eye loses its place
           on the return sweep */
        measure: '38em',
      },
    },
  },
};

export default haalvingPreset;
