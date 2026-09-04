'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, SkeletonRows } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useSession } from '@/store/session.store';
import { CircleTab } from '@/features/clients/record/CircleTab';
import { DocumentsTab } from '@/features/clients/record/DocumentsTab';
import { EmotionsTab } from '@/features/clients/record/EmotionsTab';
import { LogsTab } from '@/features/clients/record/LogsTab';
import { MeetingsTab } from '@/features/clients/record/MeetingsTab';
import { OverviewTab } from '@/features/clients/record/OverviewTab';
import { PlanTab } from '@/features/clients/record/PlanTab';
import { RecordHeader } from '@/features/clients/record/RecordHeader';
import { ScratchPad } from '@/features/clients/record/ScratchPad';
import { TrackersTab } from '@/features/clients/record/TrackersTab';
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
  notes:
    'Notes is the per-client note ledger. The team lane in the pad beside this is the part that exists; a durable, titled note is not.',
};

/** Tabs that read real data; everything else falls through to its NEEDS note. */
const BUILT = new Set([
  'overview',
  'logs',
  'circle',
  'plan',
  'emotions',
  'docs',
  'meetings',
  'trackers',
]);

export default function ClientRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [pad, setPad] = useState(false);
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
    /*
     * THE TEAM PANEL IS CLOSED UNTIL ASKED FOR.
     *
     * It used to be permanently open, taking roughly a third of the width on
     * every tab — including the ones it has nothing to do with. The record's own
     * content is what somebody opened this page for, and an internal notepad is
     * something you reach for occasionally, so the default is now the wider
     * workspace. `cw open` is the demo's own class pair for exactly this: the
     * layout already knew how to be narrow.
     */
    <div className={`ccwrap cw${pad ? ' open' : ''}`}>
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
          {/*
            THE HANDLE FOR THE TEAM PANEL.
            It sits at the right-hand end of the tab strip because that is both
            the row your eye is already on and the edge the panel slides in from.
            The arrow reads the same way it does on every other fold in this
            console: `>` opens, `<` closes. The panel carries its own close as
            well, so it can be dismissed from where you are reading rather than
            from here.
          */}
          <button
            type="button"
            className={`cwpad-toggle${pad ? ' on' : ''}`}
            aria-expanded={pad}
            onClick={() => setPad((v) => !v)}
            title={pad ? 'Hide the team panel' : 'Show the team panel'}
          >
            <Icon name={pad ? 'chevL' : 'chevR'} />
            <span>Team panel</span>
          </button>
        </div>

        {tab === 'overview' ? <OverviewTab c={c} /> : null}
        {tab === 'logs' ? <LogsTab c={c} /> : null}
        {tab === 'circle' ? <CircleTab c={c} meId={meId} /> : null}
        {tab === 'plan' ? <PlanTab clientId={c.id} /> : null}
        {tab === 'emotions' ? <EmotionsTab clientId={c.id} /> : null}
        {tab === 'docs' ? <DocumentsTab c={c} /> : null}
        {tab === 'meetings' ? <MeetingsTab c={c} /> : null}
        {tab === 'trackers' ? <TrackersTab c={c} /> : null}
        {!BUILT.has(tab) ? (
          <div className="ccscroll">
            <Empty icon="leaf" sentence={NEEDS[tab] ?? 'Not built yet.'} />
          </div>
        ) : null}
      </section>

      {/* the seam is decorative until the pad is resizable; it is drawn because
          its absence changes the panel edges the demo's layout depends on */}
      {pad ? (
        <div className="ccdiv" role="separator" aria-orientation="vertical" aria-hidden="true" />
      ) : null}

      {pad ? <ScratchPad c={c} meId={meId} onClose={() => setPad(false)} /> : null}
    </div>
  );
}
