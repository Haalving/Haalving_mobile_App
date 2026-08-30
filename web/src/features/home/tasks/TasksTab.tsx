'use client';

import { Empty, Num, Pill, SecTitle, SkeletonRows, useToast } from '@/components/ui';
import { useSession } from '@/store/session.store';
import {
  useApprovals,
  useMarkWorkDone,
  useWorklist,
  type WorklistRow,
} from '@/features/queues/queries';

/**
 * Home › Tasks — what is next, what is open, and what waits on your signature.
 *
 * Ported from console-digest.js `tasksHtml` (528-567).
 *
 * IT READS THE SAME ENDPOINTS WORK QUEUES DOES. This is a second VIEW of one
 * list, not a second list: `GET /queues/worklist` and `GET /queues/approvals`
 * are the sources, so ticking a row here and ticking it on the Queues board are
 * the same act on the same row, and the two screens cannot drift apart. A Home
 * that kept its own copy would be a Home that could say "3 open" over a board
 * showing none.
 *
 * SCOPED TO YOU, NOT TO EVERYONE. The work list's server scope gives a caller
 * with `seeAllClients` everybody's rows — right for the Queues board, wrong for
 * a tab whose heading is "your open tasks". So this asks for its own owner
 * explicitly rather than showing an Ops Head the whole building's work under a
 * possessive pronoun.
 *
 * THE CALENDAR IS NOT HERE. A task created in Schedule is a session or a
 * meeting — a thing with a time, which belongs on a grid. A work-list item is a
 * line a rule put on somebody's desk. The demo keeps them apart and so does
 * this; merging them would make "done" mean two different things in one list.
 */

function TaskRow({
  w,
  onDone,
  busy,
}: {
  w: WorklistRow;
  onDone: () => void;
  busy: boolean;
}) {
  return (
    <div className="trow">
      <span className="grow">
        {w.text}
        {w.client ? <small style={{ display: 'block' }}>{w.client.name}</small> : null}
      </span>
      <span className={`pill ${w.pill}`}>
        <Num>{w.due}</Num>
      </span>
      <button type="button" className="btn sm quiet" disabled={busy} onClick={onDone}>
        Done
      </button>
    </div>
  );
}

export function TasksTab() {
  const meId = useSession((s) => s.user?.id ?? null);
  const toast = useToast();

  /* `ownerId` is sent deliberately — see the note above about scope */
  const { data: work, isLoading } = useWorklist({
    status: 'OPEN',
    ...(meId ? { ownerId: meId } : {}),
  });
  const { data: approvals } = useApprovals();
  const done = useMarkWorkDone();

  const rows = work ?? [];
  /*
   * NEXT is the first row, and the list is already in the order the server put
   * it: open first, then oldest first. "Next" is therefore the oldest thing
   * still open, which is the honest reading — not the loudest pill, which would
   * let a cosmetic tone decide what somebody does first.
   */
  const next = rows[0] ?? null;
  const rest = rows.slice(1);
  const signQueue = approvals?.queue ?? [];

  if (isLoading) return <SkeletonRows rows={4} height={64} />;

  if (!next && !signQueue.length) {
    return <Empty icon="leaf" sentence="No tasks for you right now — the rules are quiet." />;
  }

  const tick = (w: WorklistRow) =>
    done.mutate(w.id, {
      onSuccess: () => toast('Closed.'),
      onError: (e) => toast((e as Error).message),
    });

  return (
    <>
      {next ? (
        <div className="card">
          <div className="kicker">NEXT</div>
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s3)' }}
          >
            <b className="grow">{next.text}</b>
            <span className={`pill ${next.pill}`}>
              <Num>{next.due}</Num>
            </span>
            <button
              type="button"
              className="btn sm"
              disabled={done.isPending}
              onClick={() => tick(next)}
            >
              Done
            </button>
          </div>
          {next.client ? <p className="sub">{next.client.name}</p> : null}
        </div>
      ) : null}

      {rest.length ? (
        <>
          <SecTitle>Your open tasks</SecTitle>
          <div className="list">
            {rest.map((w) => (
              <TaskRow key={w.id} w={w} busy={done.isPending} onDone={() => tick(w)} />
            ))}
          </div>
        </>
      ) : null}

      {signQueue.length ? (
        <>
          <SecTitle>Waiting on your signature</SecTitle>
          <div className="list">
            {signQueue.map((a) => (
              <div className="trow" key={a.id}>
                <span className="grow">
                  <b>{a.title}</b>
                  <small style={{ display: 'block' }}>
                    {a.about} · {a.typeLabel}
                  </small>
                </span>
                <Pill kind={/min/.test(a.due) ? 'bad' : 'warn'}>
                  Due <Num>{a.due}</Num>
                </Pill>
              </div>
            ))}
          </div>
          {/* the signature itself is given on the Approvals board, where the
              chain and the trail are visible — signing from a summary row would
              be signing something you have not read */}
          <p className="audit">Sign these on Work Queues › Approvals, where the chain is shown.</p>
        </>
      ) : null}
    </>
  );
}
