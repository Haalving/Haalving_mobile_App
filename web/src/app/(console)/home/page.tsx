'use client';

import { useQuery } from '@tanstack/react-query';
import type { PillarKey } from '@haalving/shared';

import { Empty, Notice, Num, SecTitle, SkeletonRows, Tabs } from '@/components/ui';
import { StatTile } from '@/features/home/StatTile';
import { Celebrations, LevelsAcrossRoster, RosterByPlan, type Celebration } from '@/features/home/RosterCards';
import { api } from '@/lib/api';
import { useSession } from '@/store/session.store';

/**
 * Home — ported from the `home` view in console-digest.js:822.
 *
 * The demo's Home is a digest with seven tabs. This is the DASHBOARD tab, with
 * every card whose data the port already holds; the six other tabs and the
 * work-queue row wait on tables that do not exist yet (meals, approvals,
 * worklist, documents, notices, the care circle).
 *
 * EVERY NUMBER IS SCOPED, server-side, to the caller. A headline that disagrees
 * with the list under it teaches people to distrust the whole screen — which is
 * why the counts come from /home/summary rather than from counting a page of
 * rows the client happens to be holding.
 */

interface HomeSummary {
  clients: {
    total: number;
    active: number;
    paused: number;
    inactive: number;
    observation: number;
    poorna: number;
    svayam: number;
  };
  risk: { high: number; medium: number };
  levels: { scored: number; mean: Record<PillarKey, number> };
  celebrations: Celebration[];
  pipeline: { open: number; byStage: Record<string, number> };
  queues: { meals: number; approvals: number; medical: number; reports: number };
  notices: { unseen: number };
}

/* the demo's own seven, in its own order and wording */
const TABS = [
  { key: 'dash', label: 'Dashboard' },
  { key: 'attention', label: 'Attention' },
  { key: 'replies', label: 'Replies' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notices', label: 'Notices' },
];

export default function HomePage() {
  const role = useSession((s) => s.role);
  const user = useSession((s) => s.user);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['home', 'summary'],
    queryFn: () => api.get<HomeSummary>('/home/summary'),
  });

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">TODAY</div>
          <h1 className="h1">Home</h1>
          <div className="sub">
            {user?.name} · {role?.title} — everything below is scoped to the people you carry.
          </div>
        </div>
      </div>

      {/* the tabs are the page's shape, so they are drawn from the start. Only
          the dashboard has a board behind it today. */}
      <Tabs items={TABS} active="dash" onSelect={() => undefined} />

      {isError ? (
        <Notice kind="bad">
          We could not read your dashboard. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={3} height={96} /> : null}

      {data ? (
        <>
          {/* ── your people, by status ──────────────────────────────────
              Paused counts separately from Inactive on purpose (TJ, 17 Aug):
              a paused client is coming back and an inactive one is not, and
              rolling them together hides the only number a win-back call acts
              on. */}
          <div className="card" style={{ marginBottom: 'var(--s4)' }}>
            <span className="k">YOUR PEOPLE</span>
            <div className="grid3" style={{ marginTop: 'var(--s3)' }}>
              <StatTile k="Total" value={data.clients.total} sub="on your roster" href="/clients" />
              <StatTile
                k="Active"
                value={data.clients.active}
                sub="living the programme"
                href="/clients?status=active"
                tone="ok"
              />
              <StatTile
                k="Paused"
                value={data.clients.paused}
                sub="coming back"
                href="/clients?status=paused"
                tone={data.clients.paused ? 'warn' : undefined}
              />
              <StatTile
                k="Inactive"
                value={data.clients.inactive}
                sub="not coming back unaided"
                href="/clients?status=inactive"
                tone={data.clients.inactive ? 'bad' : undefined}
              />
            </div>
          </div>

          <div className="grid3">
            <StatTile
              k="Needs extra care"
              value={data.risk.high}
              sub={
                <>
                  <Num>{data.risk.medium}</Num> more on a gentle watch
                </>
              }
              href="/clients"
              tone={data.risk.high ? 'bad' : undefined}
            />
            <StatTile
              k="In observation"
              value={data.clients.observation}
              sub="days 1–5, nothing graded yet"
              href="/clients"
            />
            <StatTile
              k="Onboarding"
              value={data.pipeline.open}
              sub="prospects before day 1"
              href="/clients"
              tone={data.pipeline.open ? 'warn' : undefined}
            />
          </div>

          <RosterByPlan counts={{ poorna: data.clients.poorna, svayam: data.clients.svayam }} />

          <LevelsAcrossRoster scored={data.levels.scored} mean={data.levels.mean} />

          <Celebrations items={data.celebrations} />

          <SecTitle>Work queues</SecTitle>
          {/* named and drawn at zero rather than hidden: the tiles are the
              layout, and a row that appears in a month is a row that gets
              redesigned in a month */}
          <div className="grid3">
            <StatTile k="Meals to rate" value={data.queues.meals} sub="not built yet" />
            <StatTile k="Awaiting signature" value={data.queues.approvals} sub="not built yet" />
            <StatTile k="Session reports due" value={data.queues.reports} sub="not built yet" />
          </div>

          <SecTitle>The digest</SecTitle>
          <div className="card">
            <Empty
              icon="doc"
              sentence="The morning digest lands on the Attention tab."
              sub="Its lines are already in the database — the board that reads them is next."
            />
          </div>
        </>
      ) : null}
    </>
  );
}
