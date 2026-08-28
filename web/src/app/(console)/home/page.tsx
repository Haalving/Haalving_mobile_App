'use client';

import { useQuery } from '@tanstack/react-query';

import { Empty, Notice, SecTitle, SkeletonRows, Tabs } from '@/components/ui';
import { StatTile } from '@/features/home/StatTile';
import { api } from '@/lib/api';
import { useSession } from '@/store/session.store';

/**
 * Home — ported from the `home` view in console-digest.js:822.
 *
 * The demo's Home is a digest with seven tabs: the dashboard, who needs
 * attention, rooms awaiting a reply, follow-up drafts, tasks, notices and
 * sessions. Day 1 ports the DASHBOARD and the frame; the other six render the
 * demo's own empty state until the boards behind them land.
 *
 * The tabs are drawn now rather than added later on purpose. Their labels and
 * order are the page's information architecture, and a layout that gains six
 * tabs in a month is a layout that gets redesigned in a month.
 *
 * EVERY NUMBER IS SCOPED, server-side, to the caller. A headline that disagrees
 * with the list under it teaches people to distrust the whole screen — which is
 * why the counts come from /home/summary rather than from counting a page of
 * rows the client happens to hold.
 */

interface HomeSummary {
  clients: { total: number; active: number; observation: number; poorna: number; svayam: number };
  pipeline: { open: number; byStage: Record<string, number> };
  queues: { meals: number; approvals: number; medical: number; reports: number };
  notices: { unseen: number };
}

const TABS = [
  { key: 'dash', label: 'Dashboard' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'replies', label: 'Awaiting reply' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notices', label: 'Notices' },
  { key: 'sessions', label: 'Sessions' },
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

      {isLoading ? <SkeletonRows rows={2} height={96} /> : null}

      {data ? (
        <>
          {/* ── your people, by status ──────────────────────────────────
              Paused counts separately from Inactive on purpose (TJ, 17 Aug):
              a paused client is coming back and an inactive one is not, and
              rolling them together hides the only number a win-back call acts
              on. Day 1 has the roster counts; the status split lands with the
              Clients filters. */}
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
                k="Observing"
                value={data.clients.observation}
                sub="days 1–5, nothing graded yet"
                href="/clients"
              />
            </div>
          </div>

          <div className="grid3">
            <StatTile
              k="Poorna"
              value={data.clients.poorna}
              sub="four pillars, four coaches"
              href="/clients?plan=poorna"
            />
            <StatTile
              k="Svayam"
              value={data.clients.svayam}
              sub="AI-guided, coaches optional"
              href="/clients?plan=svayam"
            />
            <StatTile
              k="Onboarding"
              value={data.pipeline.open}
              sub="prospects before day 1"
              href="/clients"
              tone={data.pipeline.open ? 'warn' : undefined}
            />
          </div>

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
              sentence="The morning digest lands here."
              sub="Who needs attention and why, with the evidence beside it — the board is next."
            />
          </div>
        </>
      ) : null}
    </>
  );
}
