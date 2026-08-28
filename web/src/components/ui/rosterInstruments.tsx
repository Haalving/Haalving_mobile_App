import { PILLARS, PILLAR_KEYS, type PillarKey } from '@haalving/shared';

import { Ring } from '@/components/ui/primitives';

/**
 * The two roster instruments — ported from `levelBadges` and `sessionRings` in
 * console-clients.js:63-77, where the demo exports them as `HV.consoleui` for
 * exactly this reason: the Clients rail and the digest's Attention rows both
 * draw them, and a second copy would drift.
 */

export type PillarLevels = Partial<Record<PillarKey, number>>;

/**
 * The four pillar levels, as four dots.
 *
 * THERE IS NO HEADLINE LEVEL — the four are the whole reading, and nothing may
 * reduce them to one number (the lowest-pillar rule was retired 16 Aug 2026).
 * So this renders four badges and never an average, a maximum or a total.
 *
 * The dot is the ONE place each pillar's colour appears in a row: `.pdot` reads
 * `--pc`, which the pillar's own `.p-*` class sets.
 */
export function LevelBadges({ levels }: { levels: PillarLevels }) {
  return (
    <>
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
    </>
  );
}

/**
 * The session ledger, keyed by STAFF ROLE — `mind`, not `wellness`.
 *
 * `SESSION_COLOR` maps `mind → wellness` and nothing else: the ledger speaks the
 * staff vocabulary while the palette speaks the pillar's, and this map is the one
 * legitimate translation between them. Keep it.
 */
const SESSION_COLOR: Record<string, string> = {
  fitness: 'fitness',
  yoga: 'yoga',
  mind: 'wellness',
};

const SESSION_NAME: Record<string, string> = {
  fitness: 'Fitness',
  yoga: 'Yoga',
  mind: 'Mind',
};

/**
 * THE ORDER IS EXPLICIT, and it has to be.
 *
 * The demo iterates `Object.keys(c.sessions)` and gets fitness, yoga, mind —
 * JavaScript preserves an object's insertion order, and that is the order the
 * seed writes.
 *
 * The port stores the ledger in a Postgres `jsonb` column, and jsonb does NOT
 * preserve key order: it sorts by key length and then bytewise, so the same
 * object comes back as mind, yoga, fitness. The rings rendered in reverse, which
 * looks like nothing at all until you notice the fitness ring is where the mind
 * ring should be — 2/5 reading as 0/1.
 *
 * Naming the order here fixes it for every reader and cannot regress.
 */
const SESSION_ORDER = ['fitness', 'yoga', 'mind'] as const;

export interface SessionLedger {
  [role: string]: { done: number; target: number; cancelled?: number } | undefined;
}

export function SessionRings({
  sessions,
  size = 'sm',
}: {
  sessions: SessionLedger;
  size?: 'sm' | 'lg';
}) {
  /* fitness, yoga, mind — the order the demo writes and a coach reads, taken
     from SESSION_ORDER rather than from the object's own keys */
  return (
    <>
      {SESSION_ORDER.map((k) => {
        const s = sessions[k];
        if (!s) return null;
        const pct = s.target ? (s.done / s.target) * 100 : 0;
        return (
          <span key={k} title={`${SESSION_NAME[k] ?? k} · ${s.done} of ${s.target} this cycle`}>
            <Ring
              pct={pct}
              colorVar={SESSION_COLOR[k] ?? 'brand'}
              label={`${s.done}/${s.target}`}
              size={size}
            />
          </span>
        );
      })}
    </>
  );
}
