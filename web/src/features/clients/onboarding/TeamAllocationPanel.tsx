'use client';

import { useState } from 'react';
import { PILLARS, PILLAR_KEYS, PILLAR_ROLE, ROLES, type PodSeatKey } from '@haalving/shared';

import { Avatar, Dial, Num, useToast } from '@/components/ui';
import { OverrideSheet } from '@/features/clients/onboarding/OverrideSheet';
import { useAllocate, type Arrival, type BenchSeat } from '@/features/clients/onboarding/queries';

/**
 * Team allocation — ported from `capacityHtml` and `capBar`
 * (console-pipeline.js:732-795), with the seat picker the port needs and the
 * demo did not have: the demo ticks the task and calls the pod allocated, while
 * here the seats are real rows on a real client and somebody has to name them.
 *
 * CAPACITY IS DECLARED, NEVER DERIVED. Both numbers are typed in by whoever runs
 * the bench, so a coach can read 50/50 FULL while carrying six clients — what
 * fills up is the WEEK, not the client count.
 *
 * THE WHOLE MAP GOES IN ONE CALL. The server checks every seat before it writes
 * any of them, so a body naming one full coach and three free ones seats nobody:
 * a partial allocation would be worse than a refusal, because it looks like it
 * worked.
 */

function CapBar({ c }: { c: BenchSeat }) {
  const pct = c.cap ? Math.min(100, Math.round((c.load / c.cap) * 100)) : 100;
  /* the demo's own inline bar (console-pipeline.js:735-741) — a percentage is
     the one thing a stylesheet cannot know */
  return (
    <div
      style={{
        height: 'var(--s1)',
        borderRadius: 'var(--r-full)',
        background: 'var(--line)',
        marginTop: 'var(--s1)',
      }}
    >
      <div
        style={{
          height: 'var(--s1)',
          borderRadius: 'var(--r-full)',
          width: `${pct}%`,
          background: c.full ? 'var(--danger)' : 'var(--brand)',
        }}
      />
    </div>
  );
}

const roleLabel = (role: string) => ROLES[role as keyof typeof ROLES]?.title ?? role;

export function TeamAllocationPanel({ a }: { a: Arrival }) {
  const allocate = useAllocate();
  const toast = useToast();
  const [seats, setSeats] = useState<Partial<Record<PodSeatKey, string>>>({});
  const [overriding, setOverriding] = useState<BenchSeat | null>(null);

  const totLoad = a.capacity.reduce((n, c) => n + c.load, 0);
  const totCap = a.capacity.reduce((n, c) => n + c.cap, 0);

  /* only what CHANGED: re-posting a seat that is already held would put its
     holder through the capacity check a second time for a decision that was
     made weeks ago, and could refuse an allocation nobody was making */
  const pending = Object.entries(seats).filter(
    ([seat, staffId]) => staffId && staffId !== a.podSeats[seat as PodSeatKey],
  ) as [PodSeatKey, string][];

  const send = (override?: { staffId: string; reason: string }) =>
    allocate.mutate(
      {
        id: a.id,
        seats: Object.fromEntries(pending) as Partial<Record<PodSeatKey, string>>,
        ...(override ? { override } : {}),
      },
      {
        onSuccess: () => {
          setSeats({});
          setOverriding(null);
          toast('Team allocated. Doing the work is what ticks the task.');
        },
        /* the server's sentence names the person and their two numbers */
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <div className="card">
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s3)' }}
      >
        <span className="card-title">Team allocation · live capacity</span>
        {totCap ? (
          <Dial pct={Math.round((totLoad / totCap) * 100)} label="Pod load" size="sm" />
        ) : null}
      </div>

      <div className="ob-cap">
        {a.capacity.map((c) => (
          <div className="row" style={{ alignItems: 'flex-start' }} key={c.staffId}>
            <Avatar name={c.name} className="sm" />
            <span className="grow">
              <span className="row" style={{ justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 'var(--t-sm)',
                    ...(c.full ? { color: 'var(--danger)', fontWeight: 600 } : {}),
                  }}
                >
                  {roleLabel(c.role)}: {c.name}
                </span>
                <span className="num sub">
                  {c.load}/{c.cap}
                </span>
              </span>
              <CapBar c={c} />
              {c.full ? (
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--t-micro)',
                    fontWeight: 600,
                    color: 'var(--danger)',
                    marginTop: 'var(--s1)',
                  }}
                >
                  Full — Ops Head override required, reason logged
                </span>
              ) : null}
            </span>
            {c.full ? (
              <button type="button" className="btn sm danger" onClick={() => setOverriding(c)}>
                Override
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="sec-title">The four pillar seats</div>
      <div className="ob-cap">
        {PILLAR_KEYS.map((k) => {
          /* the seat is keyed by staff ROLE and shown by PILLAR name —
             `dietitian` holds the culture seat and says "Nutrition", exactly as
             the pod does on a client record */
          const seat = PILLAR_ROLE[k] as PodSeatKey;
          const bench = a.capacity.filter((c) => c.role === seat);
          const held = seats[seat] ?? a.podSeats[seat] ?? '';
          return (
            <div className="row" key={k}>
              <span className="grow">
                <b>{PILLARS[k].name}</b>
                {/* `small` is block-level only inside a `.trow`; this is a
                    `.row`, so the second line is made a block explicitly */}
                <small style={{ display: 'block' }}>
                  {a.podSeats[seat] ? 'Seated' : 'Nobody holds this seat yet'}
                </small>
              </span>
              <select
                className="input sel"
                value={held}
                aria-label={`Who takes the ${PILLARS[k].name} seat`}
                onChange={(e) => setSeats({ ...seats, [seat]: e.target.value })}
              >
                <option value="">Choose…</option>
                {bench.map((c) => (
                  <option key={c.staffId} value={c.staffId}>
                    {c.name} · {c.load}/{c.cap}
                    {c.full ? ' · full' : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
        <button
          type="button"
          className="btn sm"
          disabled={!pending.length || allocate.isPending}
          onClick={() => send()}
        >
          Seat <Num>{pending.length}</Num> {pending.length === 1 ? 'coach' : 'coaches'}
        </button>
      </div>

      <p className="audit" style={{ marginTop: 'var(--s2)' }}>
        The load moves at promotion, not here — an arrival who never finishes must not leave a coach
        carrying a number for somebody who does not exist.
      </p>

      <OverrideSheet
        staff={overriding}
        pending={pending.length}
        busy={allocate.isPending}
        onClose={() => setOverriding(null)}
        onConfirm={(reason) => {
          if (overriding) send({ staffId: overriding.staffId, reason });
        }}
      />
    </div>
  );
}
