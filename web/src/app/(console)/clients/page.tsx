'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PLANS, plansOnSale } from '@haalving/shared';

import { Avatar, Empty, LevelBadges, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { useClients } from '@/features/clients/queries';

/**
 * Clients — ported from the rail in console-clients.js.
 *
 * The demo's Clients page is a three-pane workspace: a filtered rail, the open
 * client's record, and a scratch pad. Day 1 ports THE RAIL, in full — its
 * filters, its row grammar, its risk edge and its level badges — and opening a
 * row goes to the record page rather than a middle pane.
 *
 * The row is the demo's `railRow` exactly: avatar, name, the cycle line (or the
 * risk reason when one is flagged), and the four pillar levels beneath.
 */

/* the demo's own three, in its own order (console-clients.js STATUS_FILTERS) */
const STATUS_FILTERS = [
  { k: 'active', label: 'Active' },
  { k: 'paused', label: 'Paused' },
  { k: 'inactive', label: 'Inactive' },
];

export default function ClientsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState('');

  const status = params.get('status') ?? '';
  const plan = params.get('plan') ?? '';

  /* the plan filters are DERIVED from PLANS, never typed out — retiring a plan
     must not leave a stale chip behind on the rail */
  const planFilters = useMemo(
    () => plansOnSale().map((k) => ({ k, label: PLANS[k].name.replace('HAALVING ', '') })),
    [],
  );

  const { data, isLoading, isError, error, refetch } = useClients({
    ...(plan ? { plan } : {}),
    ...(status ? { status } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && next.get(key) !== value) next.set(key, value);
    else next.delete(key);
    router.replace(`/clients${next.toString() ? `?${next}` : ''}`);
  };

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">YOUR PEOPLE</div>
          <h1 className="h1">Clients</h1>
          <div className="sub">
            Everyone whose pod you sit on. Ops and the Operations Head see all;
            a Head of Department sees their bench.
          </div>
        </div>
      </div>

      <div>
        <input
          className="input"
          type="search"
          placeholder="Search by name or client id"
          aria-label="Search clients by name or id"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* status and plan sit on the SAME row: "who is live" and "which plan"
          are both ways of narrowing one list */}
      <div className="tfil" role="group" aria-label="Filter clients">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.k}
            type="button"
            className={status === f.k ? 'on' : ''}
            aria-pressed={status === f.k}
            onClick={() => setFilter('status', f.k)}
          >
            {f.label}
          </button>
        ))}
        {planFilters.map((f) => (
          <button
            key={f.k}
            type="button"
            className={plan === f.k ? 'on' : ''}
            aria-pressed={plan === f.k}
            onClick={() => setFilter('plan', f.k)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isError ? (
        <Notice kind="bad">
          We could not read your client list. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={6} height={78} /> : null}

      {data && data.length === 0 ? (
        <Empty
          icon="leaf"
          sentence={
            q || status || plan
              ? 'Nothing matches that search or filter.'
              : 'No clients allocated to you yet.'
          }
          sub={q || status || plan ? undefined : 'Ops assigns your first pod from Onboarding.'}
        />
      ) : null}

      {data && data.length > 0 ? (
        <div className="list">
          {data.map((c) => (
            <div
              key={c.id}
              className="trow click cwrow"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/clients/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(`/clients/${c.id}`);
                }
              }}
            >
              <Avatar name={c.name} />
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b>
                <small>
                  {c.observation ? (
                    <>
                      Observation · Day <Num>{c.cycleDay}</Num>
                    </>
                  ) : (
                    <>
                      Cycle <Num>{c.cycle}</Num> · Day <Num>{c.cycleDay}</Num>
                    </>
                  )}
                </small>
                <LevelBadges levels={c.levels} />
              </span>
              <Pill kind={c.plan === 'POORNA' ? 'info' : 'neutral'}>
                {c.plan === 'POORNA' ? 'Poorna' : 'Svayam'}
              </Pill>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
