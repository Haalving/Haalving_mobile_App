'use client';

import { useEffect, useRef } from 'react';

import { Empty, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { useDeviations, useMarkDeviationsSeen } from '@/features/queues/queries';

/**
 * Deviations — what went off the rails, and who is on it.
 *
 * Ported from console-ops.js `renderDeviationsTab`. A plain four-column table on
 * purpose: this is the one board nobody acts on from here. Every row already has
 * a human on it, named in the State column, and the board exists so Ops can
 * verify the trend the notice states rather than to start work.
 */
export function DeviationsBoard() {
  const { data, isLoading } = useDeviations();
  const seen = useMarkDeviationsSeen();

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
              <tr key={d.id}>
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
      <Notice>
        Target: <Num>−80%</Num> deviations cycle-over-cycle — Ops verifies here.
      </Notice>
    </>
  );
}
