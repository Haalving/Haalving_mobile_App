'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PLANS, plansOnSale } from '@haalving/shared';

import { Avatar, Empty, LevelBadges, Notice, Num, Pill, SkeletonRows, Tabs } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useClients } from '@/features/clients/queries';
import { ArrivalRail } from '@/features/clients/onboarding/ArrivalRail';
import { ArrivalWorkspace } from '@/features/clients/onboarding/ArrivalWorkspace';
import { useArrivals } from '@/features/clients/onboarding/queries';

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
 *
 * TWO RAILS, NAMED FOR THE STATE A PERSON IS IN rather than the screen they came
 * from (TJ, 16 Aug): everyone is either still walking in, or in. Finishing
 * onboarding moves a row from the second list to the first. The tab and the open
 * arrival both live in the URL, so a refresh keeps your place and a link opens
 * what it names.
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

  /*
   * ONBOARDING IS THE SUPER ADMIN'S DESK — a departure from the demo, which put
   * ten roles on this board. A coach meets a client at promotion, because the
   * team is allocated during onboarding and the allocation is the Super Admin's.
   */
  const ownsOnboarding = useCan('ownsOnboarding');

  const status = params.get('status') ?? '';
  const plan = params.get('plan') ?? '';
  /* THE DEEP LINK RESOLVES HERE, not in a guard further down. Reading the
     permission into the value of `rail` means `?rail=onboarding&arrival=x` is
     simply not a state this page can be in without the permission — the arrival
     branch below cannot be reached, so there is no second door to remember. The
     server refuses it too; this only decides what the reader sees. */
  const rail = ownsOnboarding && params.get('rail') === 'onboarding' ? 'onboarding' : 'clients';
  const arrivalId = params.get('arrival');

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

  /* the count beside the second tab — how many people are mid-onboarding right
     now, which is the whole reason to look at that tab at all. Asked only when
     there is a tab to put it on: the route answers 403 otherwise, and a refused
     query on a loop writes an audit row every time it ticks. */
  const { data: arrivals } = useArrivals(ownsOnboarding);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && next.get(key) !== value) next.set(key, value);
    else next.delete(key);
    router.replace(`/clients${next.toString() ? `?${next}` : ''}`);
  };

  /* switching rail closes whatever arrival was open — the two tabs are two
     lists, and an open record belongs to one of them */
  const setRail = (key: string) => {
    const next = new URLSearchParams(params.toString());
    if (key === 'onboarding') next.set('rail', 'onboarding');
    else next.delete('rail');
    next.delete('arrival');
    router.replace(`/clients${next.toString() ? `?${next}` : ''}`);
  };

  /* opening PUSHES, so the browser's own back button walks out of the workspace
     the way the header's does */
  const openArrival = (id: string) => router.push(`/clients?rail=onboarding&arrival=${id}`);

  /* the arrival branch: an open arrival IS the page, exactly as an open client
     record is — so the rail and its h1 stand down and the workspace's own header
     carries the name */
  if (rail === 'onboarding' && arrivalId) {
    return <ArrivalWorkspace id={arrivalId} onBack={() => setRail('onboarding')} />;
  }

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

      {/* one desk, one list: without the permission there is no second rail to
          switch to, and a switcher with a single destination is furniture */}
      {ownsOnboarding ? (
        <Tabs
          items={[
            { key: 'clients', label: 'Onboarded' },
            { key: 'onboarding', label: 'Onboarding', count: arrivals?.length ?? 0 },
          ]}
          active={rail}
          onSelect={setRail}
        />
      ) : null}

      {/* the onboarding rail is the SAME list geometry as the client rail — a
          search box, then rows — so the two tabs never read as two products */}
      {rail === 'onboarding' ? (
        <ArrivalRail onOpen={openArrival} />
      ) : (
        <>
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
      )}
    </>
  );
}
