'use client';

import { useState } from 'react';
import { PILLARS, POD_SEATS, ROLES, type PodSeatKey } from '@haalving/shared';

import { Audit, Avatar, IconTile, Pill, Sheet, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/can';
import { useStaff } from '@/features/people/queries';
import { useAssignPodSeat, type ClientDetail, type PodSeat } from '@/features/clients/queries';
import { first } from '@/features/clients/record/ScratchPad';

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

/** The radio's value for "hand the seat back to the AI".
 *
 *  `staffId: null` is a REAL destination, not an empty field, so it needs a
 *  value of its own — the empty string is reserved for "nothing chosen yet". */
const AI_SEAT = '__ai__';

/** End a clause with exactly one full stop — "Vikram S." must not become "Vikram S..". */
const sentence = (s: string): string => (s.endsWith('.') ? s : `${s}.`);

/**
 * The assign sheet — the demo's `assignSeatSheet` (console-clients.js:410).
 *
 * It offers only people whose ROLE matches the seat (or who lead that bench) —
 * the API refuses anything else, and offering a choice the server will reject is
 * a worse experience than not offering it.
 *
 * CHOOSE, THEN CONFIRM. Every row used to be a button that fired the mutation on
 * click, which put the reason field below a control that had already submitted:
 * the field was unreachable in practice. The rows are radios now and one Confirm
 * covers every outcome, the hand-back to the AI included.
 *
 * WHY A REASON IS EXTRACTED. Replacing a coach who is actually holding the seat
 * is feedback about a colleague, and the server REQUIRES it in that case (an
 * empty seat stays optional — nobody is being changed, so there is nothing to
 * explain). The console mirrors the rule so the button never submits something
 * the server will refuse, but the server owns it: it knows who holds the seat at
 * the moment of the write, and this sheet only knows who held it when it opened.
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
  const [picked, setPicked] = useState('');
  const [reason, setReason] = useState('');
  /* the server's own refusal, painted under the field it is about */
  const [reasonErr, setReasonErr] = useState<string | null>(null);

  const meta = SEAT_META[seat];
  /*
   * THE BENCH IS A ROLE QUESTION, NOT A DEPARTMENT ONE.
   *
   * The server takes whoever holds the seat's ROLE, or the HoD who leads that
   * bench (`client.service.assignPodSeat`, `fits`) — a department is never
   * consulted. This asked `/users?dept=<seat>` instead, so a coach created with
   * Department left at "No department" — the add sheet's own default — held the
   * right role, would have been accepted by the API, and was invisible in this
   * list: a person you could hire but not allocate.
   *
   * So fetch the active bench and narrow it with the server's own rule below.
   * It is a dozen people; the request that was already being made is the cost.
   */
  const { data: staff, isLoading } = useStaff({ status: 'active' });

  const eligible = (staff ?? []).filter((u) => u.role === seat || (u.role === 'hod' && u.dept === seat));

  const heldBy = current?.staff?.name ?? null;
  const humanHolds = !!current?.staffId;

  /* undefined = nothing chosen yet; null = the AI. Both are falsy, so they are
     never collapsed into one test below. */
  const chosen: string | null | undefined =
    picked === '' ? undefined : picked === AI_SEAT ? null : picked;
  const chosenName =
    chosen === undefined
      ? null
      : chosen === null
        ? 'Your AI coach'
        : (eligible.find((u) => u.id === chosen)?.name ?? 'Coach');

  const trimmed = reason.trim();
  /* required exactly when a human is being changed — the rule the server enforces */
  const reasonRequired = humanHolds;
  const reasonShort = reasonRequired && trimmed.length < 4;
  /* the current holder is a legal selection but a no-op write; Confirm refuses it
     rather than the demo's toast, so the sheet answers before the press, not after */
  const noChange = chosen !== undefined && chosen === (current?.staffId ?? null);

  const confirm = () => {
    if (chosen === undefined) return;
    setReasonErr(null);
    assign.mutate(
      { clientId: client.id, seat, staffId: chosen, ...(trimmed ? { reason: trimmed } : {}) },
      {
        onSuccess: () => {
          toast(
            chosen
              ? `${chosenName ?? 'Coach'} now holds the ${meta.label} seat.`
              : `${meta.label} handed back to the AI.`,
          );
          onClose();
        },
        onError: (err: Error) => {
          /* a refusal ABOUT the reason belongs under the reason, not in a toast
             that fades while the field it describes is still on screen */
          if (err instanceof ApiError && err.details?.reason) {
            setReasonErr(err.details.reason);
            return;
          }
          toast(err.message);
        },
      },
    );
  };

  return (
    <Sheet open onClose={onClose} label={`Assign the ${meta.label} seat`}>
      <div className="h1">
        {meta.label} seat · {client.name}
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {/* staff names in this product carry their own full stop — "Vikram S." — so
            the sentence supplies one only when the name has not already ended it */}
        Held by {sentence(heldBy ?? 'Your AI coach')} The new coach gains {first(client.name)}’s
        thread, plan edits and meal SLAs the moment you confirm.
      </p>

      {isLoading ? <p className="sub">Reading the bench…</p> : null}

      <div className="list" style={{ marginTop: 'var(--s4)' }}>
        {eligible.map((u) => {
          const on = current?.staffId === u.id;
          return (
            <label className={`trow pslot${on ? ' cwrow on' : ''}`} key={u.id}>
              <input
                type="radio"
                name="pod-seat"
                value={u.id}
                checked={picked === u.id}
                onChange={() => setPicked(u.id)}
              />
              <Avatar name={u.name} className="sm" />
              <span className="grow">
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
            </label>
          );
        })}

        {/* the hand-back rides IN the list, so one Confirm covers every outcome —
            as its own button it submitted instantly and skipped the reason */}
        {humanHolds ? (
          <label className="trow pslot" key={AI_SEAT}>
            <input
              type="radio"
              name="pod-seat"
              value={AI_SEAT}
              checked={picked === AI_SEAT}
              onChange={() => setPicked(AI_SEAT)}
            />
            <IconTile name={meta.icon} className="sm" />
            <span className="grow">
              <b>Hand the seat back to the AI</b>
              <small>Your AI coach carries {meta.label} until somebody is seated again</small>
            </span>
            <Pill kind="neutral">AI</Pill>
          </label>
        ) : null}

        {!isLoading && eligible.length === 0 ? (
          <p className="sub">Nobody on the bench holds that role yet.</p>
        ) : null}
      </div>

      {/* a sentence of feedback about a colleague, not a name — hence a textarea.
          The label carries the rule: no "(optional)" means it is not one. */}
      <div className="sec-title">{reasonRequired ? 'Why this seat is changing' : 'Why (optional)'}</div>
      <textarea
        className="input"
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (reasonErr) setReasonErr(null);
        }}
        placeholder="e.g. Vikram is at capacity this cycle"
        aria-label={reasonRequired ? 'Why this seat is changing' : 'Why (optional)'}
        aria-invalid={reasonErr ? true : undefined}
      />
      {reasonErr ? <p className="field-err">{reasonErr}</p> : null}
      {/* a disabled button that does not say why reads as a broken one */}
      {!reasonErr && reasonShort && trimmed ? (
        <p className="field-err">A sentence, not a word — at least four characters.</p>
      ) : null}

      <Audit>
        The team sees this in the client’s thread; the client never does. Every seat change is
        recorded with your name and the reason you give.
      </Audit>

      {noChange ? (
        <p className="field-err">{chosenName} already holds this seat.</p>
      ) : null}
      <button
        type="button"
        className="btn block"
        style={{ marginTop: 'var(--s3)' }}
        disabled={chosen === undefined || noChange || reasonShort || assign.isPending}
        onClick={confirm}
      >
        Confirm assignment
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
