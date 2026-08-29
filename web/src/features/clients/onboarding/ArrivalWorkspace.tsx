'use client';

import { useState, type ReactNode } from 'react';
import { FLOW, ago, stepIndex, type TaskAct } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { useSession } from '@/store/session.store';
import { FlowCard } from '@/features/clients/onboarding/FlowCard';
import { InBodySheet } from '@/features/clients/onboarding/InBodySheet';
import { NoteCard } from '@/features/clients/onboarding/NoteCard';
import { PlanCard } from '@/features/clients/onboarding/PlanCard';
import { PromoteSheet } from '@/features/clients/onboarding/PromoteSheet';
import { TeamAllocationPanel } from '@/features/clients/onboarding/TeamAllocationPanel';
import { WelcomeSheet } from '@/features/clients/onboarding/WelcomeSheet';
import { useArrival, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * One arrival's workspace — ported from `workspaceHtml` (console-pipeline.js:893-922).
 *
 * TWO LENSES LIVE HERE AND NOWHERE ELSE. Which crumb is open, and which closed
 * step has been unlocked for correction, are decisions made on this screen by
 * this reader; neither is sent anywhere and neither survives a reload. The
 * record's own position is its `step` field, moved only by the two step buttons
 * in the action row — so looking is never doing, and two people reading the same
 * arrival at once can look at different steps without disturbing each other.
 *
 * `null` means "follow the record": the view falls back to the open step, so
 * closing a step carries the reader forward without anybody clicking twice.
 */

/**
 * The header's mark — `stepPill` (console-pipeline.js:426-432).
 *
 * A HOLE OUTRANKS EVERYTHING. Whatever step the record stands on, if something
 * behind it came open that is the only thing this pill says. Otherwise it names
 * the phase and the step, warming from neutral to info over the last three steps
 * and to ok once the twelfth is closed.
 */
function StepPill({ a }: { a: Arrival }) {
  if (a.firstGap >= 0) return <Pill kind="bad">Open item behind</Pill>;
  const tone = a.readyToFinish ? 'ok' : a.stepIndex >= FLOW.length - 3 ? 'info' : 'neutral';
  return (
    <Pill kind={tone}>
      {a.stepPhase} · {a.stepLabel}
    </Pill>
  );
}

export function ArrivalWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: a, isLoading, isError, error, refetch } = useArrival(id);
  const role = useSession((s) => s.user?.role ?? null);

  const [view, setView] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'inbody' | 'welcome' | 'promote' | null>(null);

  if (isLoading) {
    return (
      <>
        <div className="skel" style={{ height: 92 }} />
        <SkeletonRows rows={5} height={72} />
      </>
    );
  }

  if (isError) {
    return (
      <Notice kind="bad">
        {(error as Error).message}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
          <button
            type="button"
            className="btn sm quiet"
            style={{ marginLeft: 'var(--s2)' }}
            onClick={onBack}
          >
            Back to Onboarding
          </button>
        </div>
      </Notice>
    );
  }

  if (!a) return null;

  /* whoever can RUN the flow reads all of it, being accountable for every step
     closing. Everyone else gets the lens: the same twelve crumbs and the same
     counts, but inside a step only the lines their seat owns — sixty-six tasks
     of somebody else's process is not context, it is noise, and it buries the
     two lines that are actually theirs. No new permission; one rule, already true. */
  const lens = a.canRun ? null : role;

  /* "here 5 h" — the demo's own `ago` with its trailing word trimmed, because
     the sentence already says "here" (console-pipeline.js:901) */
  const here = ago(a.arrivedAt).replace(/ ago$/, '');

  /**
   * The affordance a task grows when the console can actually DO it.
   *
   * DOING THE WORK IS TICKING IT — never make somebody tick a box for a thing
   * they just did on the same screen. Each of these three writes its own task's
   * tick on the server, so the checkbox and the act cannot come apart. Once done,
   * the slot states the fact rather than offering the act a second time.
   */
  const actSlot = (act: TaskAct): ReactNode => {
    if (act === 'capacity') return <TeamAllocationPanel a={a} />;
    if (act === 'inbody') {
      return a.inbody ? (
        <Pill kind="ok">InBody keyed in</Pill>
      ) : (
        <button type="button" className="btn sm quiet" onClick={() => setSheet('inbody')}>
          Confirm InBody key-in
        </button>
      );
    }
    return a.welcomedAt ? (
      <Pill kind="ok">Welcome sent</Pill>
    ) : (
      <button type="button" className="btn sm" onClick={() => setSheet('welcome')}>
        Review &amp; send welcome
      </button>
    );
  };

  return (
    <>
      <div className="h1-row">
        <div style={{ display: 'flex', gap: 'var(--s4)', alignItems: 'center' }}>
          <button
            type="button"
            className="btn sm ghost"
            aria-label="Back to the Onboarding rail"
            onClick={onBack}
          >
            <Icon name="chevL" />
          </button>
          <Avatar name={a.name} className="lg" />
          <div>
            <div className="kicker">ONBOARDING</div>
            <h1 className="h1">{a.name}</h1>
            <div className="sub">
              Step <Num>{a.stepIndex + 1}</Num> of <Num>{FLOW.length}</Num> · here{' '}
              <Num>{here}</Num>
            </div>
          </div>
        </div>
        <StepPill a={a} />
      </div>

      <div className="card">
        <FlowCard
          a={a}
          lens={lens}
          view={stepIndex(view ?? a.step)}
          onView={setView}
          unlocked={unlocked}
          onUnlock={setUnlocked}
          onPromote={() => setSheet('promote')}
          actSlot={actSlot}
        />
      </div>

      <PlanCard a={a} />
      <NoteCard a={a} />

      <p className="audit">
        Assessment booking cannot exist before the team allocation is approved — the order of these
        steps is the control.
      </p>

      <InBodySheet a={a} open={sheet === 'inbody'} onClose={() => setSheet(null)} />
      {sheet === 'welcome' ? <WelcomeSheet a={a} onClose={() => setSheet(null)} /> : null}
      {sheet === 'promote' ? <PromoteSheet a={a} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
