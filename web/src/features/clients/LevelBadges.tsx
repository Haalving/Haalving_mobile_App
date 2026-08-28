import { PILLARS, PILLAR_KEYS, type PillarKey } from '@haalving/shared';

/**
 * The four pillar levels, as four dots.
 *
 * Ported from `levelBadges` in console-clients.js:63. THERE IS NO HEADLINE
 * LEVEL — the four are the whole reading, and nothing may reduce them to one
 * number. That is why this renders four badges and never an average, a maximum,
 * or the lowest (the lowest-pillar rule was retired on 16 Aug 2026).
 *
 * The dot is the ONE place each pillar's colour appears in this row: `.pdot`
 * reads `--pc`, which the pillar's own `.p-*` class sets. Colouring anything
 * else here would spend the signal on decoration.
 */
export type PillarLevels = Partial<Record<PillarKey, number>>;

export function LevelBadges({ levels }: { levels: PillarLevels }) {
  return (
    <span className="cwlv">
      {PILLAR_KEYS.map((k) => {
        const p = PILLARS[k];
        const level = levels[k] ?? 1;
        return (
          <span
            key={k}
            className={`${p.cls} num`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--s1)',
              fontSize: 'var(--t-micro)',
              fontWeight: 600,
              color: 'var(--pcd)',
            }}
            title={`${p.name} · Level ${level}`}
          >
            <span className="pdot" />L{level}
          </span>
        );
      })}
    </span>
  );
}
