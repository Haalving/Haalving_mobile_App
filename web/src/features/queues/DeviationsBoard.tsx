'use client';

import { useEffect, useRef, useState } from 'react';

import { Empty, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { DeviationSheet } from '@/features/queues/DeviationSheet';
import { useDeviations, useMarkDeviationsSeen, type DeviationRow } from '@/features/queues/queries';

/**
 * Deviations — what went off the rails, and who is on it.
 *
 * Ported from console-ops.js `renderDeviationsTab`, and no longer read-only.
 *
 * The demo's reading was that nobody acts from this board — every row already has
 * a human on it, named in the State column, so the board existed for Ops to
 * verify a trend. In practice the person reading "human call today" is often the
 * one who has to make it, and sending them to another tab to find the client is
 * how a prompt becomes a chore. A row now opens the two ways to answer it.
 */
export function DeviationsBoard() {
  const { data, isLoading } = useDeviations();
  const seen = useMarkDeviationsSeen();
  const [openRow, setOpenRow] = useState<DeviationRow | null>(null);

  /*
   * OPENING THE BOARD IS THE READING, so opening it clears the badge.
   *
   * Stamped once per set of ids, not once per render: `useQueueMutation`
   * invalidates the host, the host re-renders this board, and an unguarded effect
   * would stamp again on the answer to its own stamp. The ref holds the last key
   * actually sent, so a genuinely new deviation still lands a fresh write.
   */
  const stamped = useRef<string>('');
  const ids = (data ?? []).map((d) => d.id);
  const key = ids.join(',');

  useEffect(() => {
    if (!ids.length || stamped.current === key) return;
    stamped.current = key;
    seen.mutate(ids);
    /* `seen` is a stable mutation object; keying on the ids is the real dependency */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (isLoading) return <SkeletonRows rows={3} height={48} />;
  if (!data) return null;

  if (!data.length) {
    return <Empty icon="leaf" sentence="Zero open deviations — first time this month." />;
  }

  return (
    <>
      <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client</th>
              <th>Type</th>
              <th>State</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              /* the whole row is the target, not a link in one cell — the thing
                 you are pointing at when you decide to act is the line itself */
              <tr
                key={d.id}
                className="rowlink"
                tabIndex={0}
                role="button"
                aria-label={`Answer ${d.client.name}'s deviation`}
                onClick={() => setOpenRow(d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenRow(d);
                  }
                }}
              >
                <td>{d.client.name}</td>
                <td>{d.kind}</td>
                <td>{d.state}</td>
                <td>
                  <Pill kind="info">{d.mode}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeviationSheet row={openRow} open={!!openRow} onClose={() => setOpenRow(null)} />
      <Notice>
        Target: <Num>−80%</Num> deviations cycle-over-cycle — Ops verifies here.
      </Notice>
    </>
  );
}
