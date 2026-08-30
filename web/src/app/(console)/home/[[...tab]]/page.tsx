'use client';

import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, Num, SecTitle, SkeletonRows, Tabs } from '@/components/ui';
import { StatTile } from '@/features/home/StatTile';
import { Celebrations, LevelsAcrossRoster, RosterByPlan } from '@/features/home/RosterCards';
import { AttentionTab } from '@/features/home/attention/AttentionTab';
import { FollowupsTab } from '@/features/home/followups/FollowupsTab';
import { TasksTab } from '@/features/home/tasks/TasksTab';
import { useHomeSummary, type HomeSummary } from '@/features/home/summary';
import { useSession } from '@/store/session.store';

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
  notices: {
    icon: 'bell',
    sentence: 'Escalations, reminders and leave decisions land here.',
    detail: 'Marked seen when you read them, per person.',
  },
};

/** "08:00" from the digest's own timestamp — the demo's header line. */
function generatedTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HomePage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const role = useSession((s) => s.role);
  const user = useSession((s) => s.user);

  const asked = params.tab?.[0];
  const active: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'dash';

  const { data, isLoading, isError, error, refetch } = useHomeSummary();
  const at = generatedTime(data?.generatedAt ?? null);

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
          <div className="kicker">TODAY</div>
          <h1 className="h1">Home</h1>
          <div className="sub">
            {at ? (
              <>
                Digest generated <Num>{at}</Num> · a count on a tab means something new arrived in it
              </>
            ) : (
              <>
                {user?.name} · {role?.title} — everything below is scoped to the people you carry.
              </>
            )}
          </div>
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

      {active !== 'dash' &&
      active !== 'attention' &&
      active !== 'followups' &&
      active !== 'tasks' ? (
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
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
