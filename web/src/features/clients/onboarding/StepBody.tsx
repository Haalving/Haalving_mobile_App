'use client';

import type { ReactNode } from 'react';
import {
  FLOW,
  ROLES,
  canTick,
  isTicked,
  ownedBy,
  ownerTitle,
  type BriefSection,
  type TaskAct,
} from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Notice, Num, useToast } from '@/components/ui';
import { useSetTick, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * The body of whichever step is open — ported from `stepBody`, `taskHtml` and
 * `briefHtml` (console-pipeline.js:582-620, 686-729).
 *
 * WHICH BOXES MOVE IS THE WHOLE PROMISE. The current step always; a closed step
 * only while the reader has unlocked it for correction; a later step never. That
 * test is `canTick` from `@haalving/shared` — the same function the server calls
 * before it writes — so the disabled attribute and the 409 agree by construction
 * rather than by care.
 *
 * The unlock is browser state and is never sent: the server enforces the half of
 * the rule that is about the record (an earlier step takes a correction), and the
 * console adds the half that is about the reader (they have to say so first).
 */

/** Roles resolve through the shared table, so a rename in People & Access follows. */
const roleTitle = (key: string) => ROLES[key as keyof typeof ROLES]?.title;

export function StepBody({
  a,
  i,
  lens,
  unlocked,
  onUnlock,
  actSlot,
}: {
  a: Arrival;
  i: number;
  /** A coach's lens: the role whose lines they own, or null for a runner. */
  lens: string | null;
  unlocked: string | null;
  onUnlock: (key: string | null) => void;
  /** The do-it-here affordance a task grows when the console can actually DO it. */
  actSlot: (act: TaskAct) => ReactNode;
}) {
  const s = FLOW[i]!;
  const tick = useSetTick();
  const toast = useToast();

  const cur = a.stepIndex;
  const closed = i < cur;
  const ahead = i > cur;
  const editingThis = unlocked === s.key;
  const live = canTick(a, s.key, unlocked);
  const run = a.canRun;

  /* the original index travels with the task — a filtered list must still tick
     tickKey(step, ORIGINAL i), or a coach's second visible task would write to
     the second task of the step */
  const mine = s.tasks.map((t, ti) => ({ t, i: ti })).filter((x) => ownedBy(lens, x.t.by));
  const others = s.tasks.length - mine.length;

  /* the do-it-here affordances belong to the OPEN step only, because re-running
     "send the welcome" from a step closed a week ago would send a second welcome
     — and to a runner only, because a coach's lens is for reading */
  const acts = i === cur && !lens;

  return (
    <>
      {/* the demo's own inline margin. `small` is already block-level here —
          `.ob-step small{display:block}` — so only the spacing is carried. */}
      {s.note ? <small style={{ marginTop: 'var(--s1)' }}>{s.note}</small> : null}

      {ahead ? (
        <div className="notice" style={{ marginTop: 'var(--s3)' }}>
          Not open yet. This is what step <Num>{i + 1}</Num> will ask for — reading it early is how
          you arrive ready for it.
        </div>
      ) : null}

      {closed && !editingThis && run ? (
        <div className="ob-edit">
          <button type="button" className="btn sm quiet" onClick={() => onUnlock(s.key)}>
            <Icon name="pencil" /> Correct this step
          </button>
          <span className="sub">Closed on the way past. Open it if something was ticked in error.</span>
        </div>
      ) : null}

      {closed && editingThis ? (
        <div style={{ marginTop: 'var(--s3)' }}>
          <Notice kind="warn">
            You are editing a closed step. Unticking a task leaves an open item behind, and nothing
            advances or promotes past it until it is closed again.
          </Notice>
        </div>
      ) : null}

      {mine.length ? (
        <div className="ob-tasks">
          {mine.map((x) => {
            const on = isTicked(a, s.key, x.i);
            return (
              /* the input is NESTED in the label, so it is already associated
                 with it — adding `htmlFor` as well makes a click on the box
                 toggle it twice and land back where it started */
              <label className={`ob-task${on ? ' on' : ''}`} key={x.i}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!(live && run) || tick.isPending}
                  onChange={(e) =>
                    tick.mutate(
                      { id: a.id, stepKey: s.key, taskIndex: x.i, on: e.target.checked },
                      /* the box is controlled by the record, so a refusal needs
                         no undo — the next render puts it back where the server
                         says it is, and the server's sentence says why */
                      { onError: (err) => toast((err as Error).message) },
                    )
                  }
                />
                <span className="tt">
                  {x.t.t}
                  {x.t.act && acts ? (
                    /* the slot's controls sit INSIDE the task's label, so a click
                       on the panel around them would toggle the very task they
                       are there to do. The demo stops the same click on its
                       capacity input (console-pipeline.js:1244-1249) — the slot
                       is the work; ticking is what doing it causes. */
                    <span
                      className="ob-sub"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {actSlot(x.t.act)}
                    </span>
                  ) : null}
                </span>
                <span className="ob-who">{ownerTitle(x.t.by, roleTitle)}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="sub" style={{ margin: 'var(--s3) 0 0' }}>
          No line on this step belongs to your seat.
        </p>
      )}

      {lens && others ? (
        <p className="audit">
          <Num>{others}</Num> other {others === 1 ? 'line' : 'lines'} on this step belong to other
          seats. Their progress is in the count above — the step closes when all of them are in.
        </p>
      ) : null}

      {closed && editingThis ? (
        <div className="ob-edit">
          <button type="button" className="btn sm" onClick={() => onUnlock(null)}>
            Done editing
          </button>
        </div>
      ) : null}

      <Brief s={s} lens={lens} />
    </>
  );
}

/**
 * The brief: what is SAID in this session, transcribed from the annexure the step
 * names. Never mixed into the checklist — a line you say is not a line you tick,
 * and blurring the two is how a script becomes busywork.
 */
function Brief({ s, lens }: { s: (typeof FLOW)[number]; lens: string | null }) {
  if (!s.brief) return null;

  /* a block with no `by` is shared ground, not somebody's script — the
     level-setting criteria are the case, and every bench reads those */
  const blocks: BriefSection[] = s.brief.filter((b) => ownedBy(lens, b.by ?? '') || !b.by);
  if (!blocks.length) return null;

  return (
    <div className="ob-brief">
      <div className="ob-bh">{s.briefTitle ?? 'The brief'}</div>
      {blocks.map((b) => (
        <div className="ob-bblk" key={b.h}>
          <div className="ob-bhead">
            <b>{b.h}</b>
            {b.by ? <span className="ob-who">{ownerTitle(b.by, roleTitle)}</span> : null}
          </div>
          <ul>
            {b.pts.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
      {s.briefRef ? <p className="audit">{s.briefRef}</p> : null}
    </div>
  );
}
