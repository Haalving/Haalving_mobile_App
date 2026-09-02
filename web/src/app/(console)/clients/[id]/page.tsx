'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, SkeletonRows } from '@/components/ui';
import { useSession } from '@/store/session.store';
import { CircleTab } from '@/features/clients/record/CircleTab';
import { EmotionsTab } from '@/features/clients/record/EmotionsTab';
import { OverviewTab } from '@/features/clients/record/OverviewTab';
import { PlanTab } from '@/features/clients/record/PlanTab';
import { RecordHeader } from '@/features/clients/record/RecordHeader';
import { ScratchPad } from '@/features/clients/record/ScratchPad';
import { useClient } from '@/features/clients/queries';

/**
 * The client record — the workspace.
 *
 * Ported from console-clients.js `workspaceHtml`. THREE PANELS: the client rail
 * (the index, which on this route is the /clients page one click away), the
 * client-visible thread, and the team scratch pad. The workspace fills the
 * viewport and SCROLLS INSIDE ITS PANELS — the page itself never scrolls, so the
 * header and the composer stay put while a long thread moves between them.
 *
 * The demo's nine tabs are drawn from the start, because the page's SHAPE is
 * settled even where a tab's contents are not: a tab bar that grew as features
 * landed would move the ones already there. What each unbuilt tab needs is named
 * on its own face rather than mocked — a canned list looks finished and teaches
 * somebody to expect behaviour that is not there.
 */

const TABS = [
  /* The order the client asked for. `docs` keeps its id even though its LABEL is
     Documents: the id sits in the route, so renaming it breaks every deep link. */
  { id: 'overview', label: 'Overview' },
  { id: 'logs', label: 'Logs' },
  { id: 'circle', label: 'Circle' },
  { id: 'plan', label: 'Plan' },
  { id: 'emotions', label: 'Emotions' },
  { id: 'docs', label: 'Documents' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'notes', label: 'Notes' },
] as const;

/** What a tab still needs, said plainly rather than mocked. */
const NEEDS: Record<string, string> = {
  logs: 'The merged timeline is not built yet — it reads meals, ticked tasks and the room together, and each of those is a separate read the record does not make.',
  docs: 'The signed summaries are on the doctor’s desk under Work Queues. This tab still has to read them scoped to one client.',
  meetings:
    'Meetings are Schedule’s rows, filtered to this client. The read exists; this tab does not point at it yet.',
  trackers:
    'Trackers has no table behind it yet — weight, steps and sleep are typed on the demo’s own store and nothing here holds them.',
  notes:
    'Notes is the per-client note ledger. The team lane in the pad beside this is the part that exists; a durable, titled note is not.',
};

export default function ClientRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [tab, setTab] = useState<string>('overview');
  const { data: c, isLoading, isError, error, refetch } = useClient(id);
  const meId = useSession((s) => s.user?.id ?? null);

  if (isLoading) {
    return (
      <>
        <div className="skel" style={{ height: 92 }} />
        <SkeletonRows rows={4} height={72} />
      </>
    );
  }

  if (isError || !c) {
    return (
      <Notice kind="bad">
        {(error as Error | undefined)?.message ?? 'No such client.'}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Notice>
    );
  }

  return (
    <div className="ccwrap cw open">
      <section className="ccchat" aria-label="Client workspace">
        <RecordHeader c={c} onBack={() => router.push('/clients')} clientVisible={tab === 'circle'} />

        <div className="tabs cwtabs">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={tab === t.id ? 'on' : ''}
              {...(tab === t.id ? { 'aria-current': 'page' as const } : {})}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' ? <OverviewTab c={c} /> : null}
        {tab === 'circle' ? <CircleTab c={c} meId={meId} /> : null}
        {tab === 'plan' ? <PlanTab clientId={c.id} /> : null}
        {tab === 'emotions' ? <EmotionsTab clientId={c.id} /> : null}
        {tab !== 'overview' && tab !== 'circle' && tab !== 'plan' && tab !== 'emotions' ? (
          <div className="ccscroll">
            <Empty icon="leaf" sentence={NEEDS[tab] ?? 'Not built yet.'} />
          </div>
        ) : null}
      </section>

      {/* the seam is decorative until the pad is resizable; it is drawn because
          its absence changes the panel edges the demo's layout depends on */}
      <div className="ccdiv" role="separator" aria-orientation="vertical" aria-hidden="true" />

      <ScratchPad c={c} meId={meId} />
    </div>
  );
}
