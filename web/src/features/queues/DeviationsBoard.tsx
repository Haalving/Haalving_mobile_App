'use client';

import { Empty, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { useDeviations } from '@/features/queues/queries';

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
