'use client';

import { useState } from 'react';
import { canRunFlow } from '@haalving/shared';

import { Empty, Notice, SkeletonRows } from '@/components/ui';
import { useCan } from '@/lib/can';
import { ArrivalRow } from '@/features/clients/onboarding/ArrivalRow';
import { NewArrivalSheet } from '@/features/clients/onboarding/NewArrivalSheet';
import { useArrivals } from '@/features/clients/onboarding/queries';

/**
 * The Onboarding rail — ported from `obRailHtml` (console-clients.js:778-790).
 *
 * THE SAME LIST GEOMETRY AS THE CLIENT RAIL — a search box, then rows — so the
 * two tabs never read as two products. The search filters what has already been
 * fetched rather than asking the server again: the rail is a handful of people
 * mid-onboarding, and a round trip per keystroke would be slower than the filter
 * and less honest than the count beside the tab.
 *
 * WHO SEES WHOM IS THE SERVER'S ANSWER. A runner gets every arrival; anybody else
 * gets only the ones they are seated on, and an empty rail rather than
 * everybody's. Nothing is filtered here that the API did not already scope.
 */

export function ArrivalRail({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading, isError, error, refetch } = useArrivals();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  /* the same test the server runs (`canRunFlow`), asked of the role the console
     already holds — a coach reads the rail but does not start anybody on it */
  const canRun = canRunFlow(useCan('allocate'), useCan('seeAllClients'));

  const query = q.trim().toLowerCase();
  const rows = (data ?? []).filter((p) => p.name.toLowerCase().includes(query));

  return (
    <>
      <div>
        <input
          className="input"
          type="search"
          placeholder="Search arrivals"
          aria-label="Search arrivals"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {canRun ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn sm ghost" onClick={() => setAdding(true)}>
            New arrival
          </button>
        </div>
      ) : null}

      {isError ? (
        <Notice kind="bad">
          We could not read the Onboarding rail. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={4} height={78} /> : null}

      {data && !data.length ? (
        <Empty
          icon="users"
          sentence="Nobody is mid-onboarding."
          sub="New sign-ups appear here the moment they register."
        />
      ) : null}

      {data && data.length && !rows.length ? (
        /* the demo's own inline padding for a rail that matched nothing
           (console-clients.js:788) */
        <p className="sub" style={{ padding: 'var(--s4) var(--s2)' }}>
          Nobody matches that search.
        </p>
      ) : null}

      {rows.length ? (
        <div className="list">
          {rows.map((row) => (
            <ArrivalRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
          ))}
        </div>
      ) : null}

      <NewArrivalSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
