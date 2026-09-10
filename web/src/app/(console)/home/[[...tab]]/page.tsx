'use client';

import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, Num, SecTitle, SkeletonRows, Tabs } from '@/components/ui';
import { StatTile } from '@/features/home/StatTile';
import { Celebrations, LevelsAcrossRoster, RosterByPlan } from '@/features/home/RosterCards';
import { WhatsOn } from '@/features/home/WhatsOn';
import { AttentionTab } from '@/features/home/attention/AttentionTab';
import { FollowupsTab } from '@/features/home/followups/FollowupsTab';
import { NoticesTab } from '@/features/home/notices/NoticesTab';
import { TasksTab } from '@/features/home/tasks/TasksTab';
import { useHomeSummary, type HomeSummary } from '@/features/home/summary';
import { ChatBell } from '@/features/notifications/ChatBell';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useCan, useHasNav } from '@/lib/can';

/**
 * Home — ported from the `home` view in console-digest.js:822.
 *
 * THE TAB LIVES IN THE URL, as `#/home/attention` does in the demo: a refresh
 * keeps your place and a link opens the tab it names. Tab state in component
 * state would lose both.
 *
 * Dashboard and Attention are built. The other four are named and routed so the
 * page's shape is settled, and each renders its own empty state rather than one
 * shared placeholder — a tab that says nothing about itself reads as broken.
 */

const TABS = [
  { key: 'dash', label: 'Dashboard' },
  { key: 'attention', label: 'Attention' },
  { key: 'replies', label: 'Replies' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notices', label: 'Notices' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** What each unbuilt tab will read, said plainly rather than left blank. */
const PENDING: Record<string, { icon: string; sentence: string; detail: string }> = {
  replies: {
    icon: 'circle',
    sentence: 'Rooms with the call light on land here.',
    detail: 'One row per care circle with an unread message, newest first.',
  },
};

/**
 * The tabs that render themselves. Everything else falls to `PENDING`.
 *
 * A SET RATHER THAN A CHAIN OF `!==`, because the chain has to be edited in two
 * places to add a tab and the second edit is the one that gets forgotten — the
 * failure being a finished board drawn underneath its own "not built yet".
 */
const BUILT = new Set<TabKey>(['dash', 'attention', 'followups', 'tasks', 'notices']);

export default function HomePage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();

  const asked = params.tab?.[0];
  const active: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'dash';

  const { data, isLoading, isError, error, refetch } = useHomeSummary();
  /* onboarding is the Super Admin's desk, so its tile is too */
  const ownsOnboarding = useCan('ownsOnboarding');
  /* the six seats with no Community tab get the community's calendar here
     instead — see WhatsOn. The four that have the tab do not want it twice. */
  const seesCommunity = useHasNav('community');

  const tabItems = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    /* the badge reads the SAME list the tab renders, so the two cannot disagree */
    count: t.key === 'dash' ? 0 : (data?.fresh[t.key as keyof HomeSummary['fresh']] ?? 0),
  }));

  return (
    <>
      <div className="h1-row">
        <div>
          <h1 className="h1">Home</h1>
        </div>
        {/* THE CHATS AND THE BELL live on the dashboard, in its header — the
            one place a day starts from — rather than floating over every page
            and colliding with each page's own header pills. */}
        <div className="hdr-tools">
          <ChatBell />
          <NotificationBell />
        </div>
      </div>

      <Tabs
        items={tabItems}
        active={active}
        onSelect={(key) => router.push(key === 'dash' ? '/home' : `/home/${key}`)}
      />

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

      {active === 'attention' ? <AttentionTab /> : null}
      {active === 'followups' ? <FollowupsTab /> : null}
      {active === 'tasks' ? <TasksTab /> : null}
      {active === 'notices' ? <NoticesTab /> : null}

      {!BUILT.has(active) ? (
        <div className="card">
          <Empty
            icon={PENDING[active]?.icon ?? 'doc'}
            sentence={PENDING[active]?.sentence ?? 'Not built yet.'}
            sub={PENDING[active]?.detail}
          />
        </div>
      ) : null}

      {active === 'dash' ? (
        <>
          {isLoading ? <SkeletonRows rows={3} height={96} /> : null}

          {data ? (
            <>
              {/* ── your people, by status ──────────────────────────────
                  Paused counts separately from Inactive on purpose (TJ,
                  17 Aug): a paused client is coming back and an inactive one
                  is not, and rolling them together hides the only number a
                  win-back call acts on. */}
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
                  href="/home/attention"
                  tone={data.risk.high ? 'bad' : undefined}
                />
                <StatTile
                  k="In observation"
                  value={data.clients.observation}
                  sub="days 1–5, nothing graded yet"
                  href="/clients"
                />
                {/* the pipeline tile belongs to the desk that runs the pipeline. The
                    server already answers 0 to everybody else, but a tile reading zero
                    states a fact about a board the reader cannot open, and links them
                    to a tab that is not there. Absent is the honest rendering. */}
                {ownsOnboarding ? (
                  <StatTile
                    k="Onboarding"
                    value={data.pipeline.open}
                    sub="prospects before day 1"
                    href="/clients"
                    tone={data.pipeline.open ? 'warn' : undefined}
                  />
                ) : null}
              </div>

              <RosterByPlan counts={{ poorna: data.clients.poorna, svayam: data.clients.svayam }} />

              <LevelsAcrossRoster scored={data.levels.scored} mean={data.levels.mean} />

              <Celebrations items={data.celebrations} />

              {!seesCommunity ? (
                <>
                  <SecTitle>What the community has on</SecTitle>
                  <WhatsOn />
                </>
              ) : null}

              <SecTitle>Work queues</SecTitle>
              {/* named and drawn at zero rather than hidden: the tiles are the
                  layout, and a row that appears in a month is a row that gets
                  redesigned in a month */}
              <div className="grid3">
                <StatTile k="Meals to rate" value={data.queues.meals} sub="not built yet" />
                <StatTile k="Awaiting signature" value={data.queues.approvals} sub="not built yet" />
                <StatTile k="Session reports due" value={data.queues.reports} sub="not built yet" />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
