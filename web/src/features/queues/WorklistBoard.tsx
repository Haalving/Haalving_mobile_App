'use client';

import { useState } from 'react';

import { Audit, Empty, Num, Pill, SkeletonRows, useToast } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useMarkWorkDone, useWorklist, type WorklistRow } from '@/features/queues/queries';

/**
 * The work list — every line a rule put on somebody's desk.
 *
 * Ported from console-ops.js `renderWorkTab` + `workFilterHtml`.
 *
 * THE FILTERS ARE SENT TO THE SERVER, not applied to a list already in the
 * browser. The demo filters an array it holds; here the same chip row becomes a
 * query, so the rows a caller may not see are never sent in the first place. The
 * owner select is the one filter the server may ignore — it is only honoured for
 * somebody who can see everybody's work, and for anybody else the honest answer
 * is still their own rows.
 *
 * DONE ROWS SINK, they do not vanish. A row that disappeared the instant it was
 * ticked would give no way to notice you had ticked the wrong one.
 */

const TYPE_LABELS: Record<string, string> = {
  TASK: 'Task',
  RATING: 'Rating',
  REVIEW: 'Review',
  REPORT: 'Session report',
};

const PILLARS: Record<string, string> = {
  fitness: 'Fitness',
  culture: 'Food Culture',
  yoga: 'Yoga',
  wellness: 'Wellness',
};

const STATUS_OPTS = [
  { v: 'OPEN', t: 'Open' },
  { v: 'DONE', t: 'Done' },
];
const PILLAR_OPTS = [{ v: '', t: 'All pillars' }, ...Object.entries(PILLARS).map(([v, t]) => ({ v, t }))];
const TYPE_OPTS = [{ v: '', t: 'All types' }, ...Object.entries(TYPE_LABELS).map(([v, t]) => ({ v, t }))];

/** One `.tfil` row per dimension — the chosen option wears the filled pill. */
function FilterRow({
  label,
  opts,
  current,
  onPick,
}: {
  label: string;
  opts: Array<{ v: string; t: string }>;
  current: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="tfil" role="group" aria-label={label}>
      {opts.map((o) => {
        const on = o.v === current;
        return (
          <button
            type="button"
            key={o.v || 'all'}
            className={on ? 'on' : ''}
            {...(on ? { 'aria-current': 'true' as const } : {})}
            onClick={() => onPick(o.v)}
          >
            {o.t}
          </button>
        );
      })}
    </div>
  );
}

function Row({ w, onDone, busy }: { w: WorklistRow; onDone: () => void; busy: boolean }) {
  const done = w.status === 'DONE';
  return (
    <div className="trow" style={done ? { opacity: 0.55 } : undefined}>
      <div className="grow" style={done ? { textDecoration: 'line-through' } : undefined}>
        {w.text}
        <small>
          {w.owner?.name ?? '—'}
          {w.client ? ` · ${w.client.name}` : ''}
        </small>
      </div>
      {done ? (
        <Pill kind="ok">Done</Pill>
      ) : (
        <span className={`pill ${w.pill}`}>
          <Num>{w.due}</Num>
        </span>
      )}
      {done ? null : (
        <button type="button" className="btn sm quiet" disabled={busy} onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}

export function WorklistBoard() {
  const seeAll = useCan('seeAllClients');
  const toast = useToast();

  const [status, setStatus] = useState('OPEN');
  const [pillar, setPillar] = useState('');
  const [type, setType] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const { data, isLoading } = useWorklist({ status, pillar, type, ownerId });
  const done = useMarkWorkDone();

  /* the owner select's options are the people who actually own rows here — the
     demo lists every staff member, but a name that can only ever return an empty
     list is a filter that lies about what it will do */
  const owners = new Map<string, string>();
  for (const w of data ?? []) if (w.owner) owners.set(w.owner.id, w.owner.name);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
        <FilterRow label="Status" opts={STATUS_OPTS} current={status} onPick={setStatus} />
        <FilterRow label="Pillar" opts={PILLAR_OPTS} current={pillar} onPick={setPillar} />
        <FilterRow label="Type" opts={TYPE_OPTS} current={type} onPick={setType} />
        {seeAll ? (
          <select
            className="input sel"
            aria-label="Owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Everyone</option>
            {[...owners].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {isLoading ? <SkeletonRows rows={5} height={64} /> : null}

      {data && !data.length ? (
        <Empty
          icon="leaf"
          sentence={
            status === 'OPEN' && !pillar && !type && !ownerId
              ? 'No tasks for you right now — the rules are quiet.'
              : 'No tasks match these filters.'
          }
        />
      ) : null}

      {data && data.length ? (
        <>
          <div className="list">
            {/* open first, done sunk — a stable sort, so rule order survives inside each half */}
            {[...data]
              .sort((a, b) => (a.status === 'DONE' ? 1 : 0) - (b.status === 'DONE' ? 1 : 0))
              .map((w) => (
                <Row
                  key={w.id}
                  w={w}
                  busy={done.isPending}
                  onDone={() =>
                    done.mutate(w.id, {
                      onSuccess: () => toast('Closed.'),
                      onError: (e) => toast((e as Error).message),
                    })
                  }
                />
              ))}
          </div>
          <Audit>Every task traces to its generating rule.</Audit>
        </>
      ) : null}
    </>
  );
}
