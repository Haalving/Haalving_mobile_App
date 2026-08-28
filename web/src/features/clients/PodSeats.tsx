'use client';

import { useState } from 'react';
import { DEPTS, PILLARS, POD_SEATS, ROLES, type PodSeatKey } from '@haalving/shared';

import { Avatar, IconTile, Pill, Sheet, useToast } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useStaff } from '@/features/people/queries';
import { useAssignPodSeat, type ClientDetail, type PodSeat } from '@/features/clients/queries';

/**
 * The pod — one seat per role, and the seats are keyed by STAFF ROLE, not by
 * pillar: `dietitian` (not `culture`) and `mind` (not `wellness`).
 *
 * `staffId: null` IS A REAL VALUE. It means the AI holds the seat, which is the
 * ordinary state for an unbought pillar on a Svayam plan — the demo's
 * `HV.staff()` returns an AI pseudo-user for a missing id precisely so an
 * unfilled seat renders without any screen special-casing it. Ananya's pod is
 * empty on purpose: AI end to end.
 *
 * The four coach seats show their PILLAR's display name — "Nutrition" for
 * `dietitian`, "Mind Wellness" for `mind` — because that is what the client and
 * the coach both call it. The key never changes; only the label does.
 */

/** What each seat is called on screen, and which mark it wears. */
const SEAT_META: Record<PodSeatKey, { label: string; icon: string; pillarClass?: string }> = {
  dietitian: { label: PILLARS.culture.name, icon: 'bowl', pillarClass: PILLARS.culture.cls },
  fitness: { label: PILLARS.fitness.name, icon: 'dumbbell', pillarClass: PILLARS.fitness.cls },
  yoga: { label: PILLARS.yoga.name, icon: 'meditate', pillarClass: PILLARS.yoga.cls },
  mind: { label: PILLARS.wellness.name, icon: 'moon', pillarClass: PILLARS.wellness.cls },
  doctor: { label: 'Doctor', icon: 'shield' },
  admin: { label: 'Haalving Coach', icon: 'user' },
  opshead: { label: 'Operations Head', icon: 'users' },
};

export function PodSeats({ client }: { client: ClientDetail }) {
  const canAssign = useCan('assignPod');
  const [editing, setEditing] = useState<PodSeatKey | null>(null);

  const bySeat = new Map(client.pod.map((p) => [p.seat, p]));

  return (
    <>
      <div className="list">
        {POD_SEATS.map((seat) => {
          const held = bySeat.get(seat);
          const meta = SEAT_META[seat];
          const staff = held?.staff ?? null;

          return (
            <div key={seat} className={`trow ${meta.pillarClass ?? ''}`}>
              {staff ? <Avatar name={staff.name} className="sm" /> : <IconTile name={meta.icon} className="sm" />}
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>{staff ? staff.name : 'Your AI coach'}</b>
                <small>
                  {meta.label}
                  {staff ? ` · ${ROLES[staff.role as keyof typeof ROLES]?.title ?? staff.role}` : ' · nobody holds this seat'}
                </small>
              </span>
              {!staff ? <Pill kind="neutral">AI</Pill> : null}
              {canAssign ? (
                <button type="button" className="btn sm quiet" onClick={() => setEditing(seat)}>
                  {staff ? 'Change' : 'Assign'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {editing ? (
        <AssignSeatSheet
          client={client}
          seat={editing}
          current={bySeat.get(editing) ?? null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The assign sheet.
 *
 * It offers only people whose ROLE matches the seat (or who lead that bench) —
 * the API refuses anything else, and offering a choice the server will reject is
 * a worse experience than not offering it. The reason is optional here but goes
 * on the audit row when given: "who put this coach on this client, and why" has
 * a six-month half-life.
 */
function AssignSeatSheet({
  client,
  seat,
  current,
  onClose,
}: {
  client: ClientDetail;
  seat: PodSeatKey;
  current: PodSeat | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const assign = useAssignPodSeat();
  const [reason, setReason] = useState('');

  const meta = SEAT_META[seat];
  const isDept = seat in DEPTS;

  /* the bench for this seat: its own role, plus the HoD who leads it */
  const { data: staff, isLoading } = useStaff(
    isDept ? { dept: seat, status: 'active' } : { role: seat, status: 'active' },
  );

  const eligible = (staff ?? []).filter((u) => u.role === seat || (u.role === 'hod' && u.dept === seat));

  const submit = (staffId: string | null) => {
    assign.mutate(
      { clientId: client.id, seat, staffId, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        onSuccess: () => {
          toast(
            staffId
              ? `${eligible.find((u) => u.id === staffId)?.name ?? 'Coach'} now holds the ${meta.label} seat.`
              : `${meta.label} handed back to the AI.`,
          );
          onClose();
        },
        onError: (err: Error) => toast(err.message),
      },
    );
  };

  return (
    <Sheet open onClose={onClose} label={`Assign the ${meta.label} seat`}>
      <div className="h1">{meta.label}</div>
      <p className="sub" style={{ margin: 0 }}>
        Who carries this seat for {client.name}?
      </p>

      {isLoading ? <p className="sub">Reading the bench…</p> : null}

      <div className="list" style={{ marginTop: 'var(--s4)' }}>
        {eligible.map((u) => {
          const on = current?.staffId === u.id;
          return (
            <button
              key={u.id}
              type="button"
              className={`trow click${on ? ' cwrow on' : ''}`}
              onClick={() => submit(u.id)}
              disabled={assign.isPending}
            >
              <Avatar name={u.name} className="sm" />
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>{u.name}</b>
                <small>
                  {ROLES[u.role as keyof typeof ROLES]?.title ?? u.role}
                  {u.capacity ? ` · carrying ${u.capacity.load} of ${u.capacity.declared}` : ''}
                </small>
              </span>
              {/* capacity is DECLARED, never derived — a coach at their ceiling
                  is a judgement by whoever runs the bench, not a seat count */}
              {u.capacity && u.capacity.declared > 0 && u.capacity.load >= u.capacity.declared ? (
                <Pill kind="warn">FULL</Pill>
              ) : null}
              {on ? <Pill kind="info">Current</Pill> : null}
            </button>
          );
        })}

        {!isLoading && eligible.length === 0 ? (
          <p className="sub">Nobody on the bench holds that role yet.</p>
        ) : null}
      </div>

      <div className="sec-title">Why (optional)</div>
      <input
        className="input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Vikram is at capacity this cycle"
        aria-label="Reason for the change"
      />

      {current?.staffId ? (
        <button
          type="button"
          className="btn ghost block"
          style={{ marginTop: 'var(--s4)' }}
          onClick={() => submit(null)}
          disabled={assign.isPending}
        >
          Hand the seat back to the AI
        </button>
      ) : null}

      <div className="audit" style={{ marginTop: 'var(--s3)' }}>
        Every seat change is recorded with your name and the reason you give.
      </div>
    </Sheet>
  );
}
