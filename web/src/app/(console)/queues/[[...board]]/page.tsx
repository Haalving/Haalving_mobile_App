'use client';

import type * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, Num, SkeletonRows, Tabs } from '@/components/ui';
import { ApprovalsBoard } from '@/features/queues/ApprovalsBoard';
import { DeviationsBoard } from '@/features/queues/DeviationsBoard';
import { LiveBoard } from '@/features/queues/LiveBoard';
import { MealsBoard } from '@/features/queues/MealsBoard';
import { MedicalBoard } from '@/features/queues/MedicalBoard';
import { WorklistBoard } from '@/features/queues/WorklistBoard';
import { useQueuesMeta } from '@/features/queues/queries';

/**
 * Work Queues — the SLA-bound surfaces in one place.
 *
 * Ported from console-queues.js. STATUS BY EXCEPTION: a board a role may not see
 * is not drawn at all — the SERVER decides which boards come back, so the tab row
 * IS the answer rather than a filtered copy of one. A role with no permitted
 * board never reaches this screen.
 *
 * The "n waiting" pill sums the counts the server sent, so the pill and the tab
 * badges cannot disagree. The demo's own comment records that drift as a bug it
 * had: a badge reading zero over a six-row list, because the badge and the list
 * were computed from two different scoping expressions.
 */

/* a board may render nothing while its own read is in flight, so the map is
   typed for that rather than forcing every board to return an element */
const BOARDS: Record<string, () => React.ReactNode> = {
  work: WorklistBoard,
  approvals: ApprovalsBoard,
  meals: MealsBoard,
  medical: MedicalBoard,
  deviations: DeviationsBoard,
  live: LiveBoard,
};

export default function QueuesPage() {
  const router = useRouter();
  const params = useParams<{ board?: string[] }>();
  const { data, isLoading, error } = useQueuesMeta();

  const boards = data?.boards ?? [];
  const asked = params.board?.[0];
  const active = boards.some((b) => b.key === asked) ? (asked as string) : boards[0]?.key;
  const Board = active ? BOARDS[active] : undefined;

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE CLOCK</div>
          <h1 className="h1">Queues</h1>
          <p className="sub">
            Work the rules put on a clock — rated, signed or cleared before its SLA runs out.
          </p>
        </div>
        {data ? (
          <span className={`pill ${data.waiting ? 'warn' : 'ok'}`}>
            <Num>{data.waiting}</Num> waiting
          </span>
        ) : null}
      </div>

      {isLoading ? <SkeletonRows rows={3} height={96} /> : null}

      {/* a failed read is SAID OUT LOUD. A page that renders its header and then
          nothing looks like an empty queue, which is the one reading that would
          make somebody stop checking. */}
      {error ? <Notice kind="bad">{(error as Error).message}</Notice> : null}

      {data && !boards.length ? (
        <Empty icon="leaf" sentence="No queues for your role — nothing here is yours to work." />
      ) : null}

      {boards.length ? (
        <>
          <Tabs
            /* NULL means the board keeps no count, which is not the same as zero — the
               tab component takes `undefined` for "draw no badge" */
            items={boards.map((b) => ({
              key: b.key,
              label: b.label,
              ...(b.count == null ? {} : { count: b.count }),
            }))}
            active={active as string}
            onSelect={(k) => router.push(k === boards[0]?.key ? '/queues' : `/queues/${k}`)}
          />
          <div
            id="board-root"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s3)',
              marginTop: 'var(--s3)',
            }}
          >
            {Board ? <Board /> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
