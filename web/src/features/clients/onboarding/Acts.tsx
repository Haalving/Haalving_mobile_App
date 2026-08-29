'use client';

import { FLOW, stepDef, tickedCount } from '@haalving/shared';

import { Num, useToast } from '@/components/ui';
import { useCloseStep, useStepBack, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * The action row — ported from `actsHtml` (console-pipeline.js:830-865).
 *
 * THE BUTTONS ACT ON WHERE THE RECORD IS, never on what the reader happens to be
 * looking at, so the open step is named on the button itself. That is why the
 * lens can wander through all twelve steps without a single one of these
 * changing meaning.
 *
 * "Fix" is a verb only somebody who can run the flow has — a coach still sees the
 * open item in the crumbs and the flags, but not a button that promises them a
 * correction they cannot make.
 */

export function Acts({
  a,
  view,
  onView,
  onUnlock,
  onPromote,
}: {
  a: Arrival;
  /** The index the reader is looking at, which is not necessarily the record's. */
  view: number;
  onView: (key: string | null) => void;
  onUnlock: (key: string | null) => void;
  onPromote: () => void;
}) {
  const close = useCloseStep();
  const back = useStepBack();
  const toast = useToast();

  const cur = a.stepIndex;
  const s = stepDef(a.step);
  const last = cur === FLOW.length - 1;
  const left = s.tasks.length - tickedCount(a, s);
  const gap = a.firstGap;
  const run = a.canRun;

  /* a step change moves the record, so the lens stops leading and follows again */
  const followRecord = () => {
    onView(null);
    onUnlock(null);
  };
  const refuse = (e: unknown) => toast((e as Error).message);

  return (
    <div className="ob-acts">
      {run && gap >= 0 ? (
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onView(FLOW[gap]!.key);
            onUnlock(FLOW[gap]!.key);
          }}
        >
          Fix step <Num>{gap + 1}</Num> · {FLOW[gap]!.label}
        </button>
      ) : null}

      {run && !last ? (
        <button
          type="button"
          className="btn"
          disabled={!(a.stepComplete && gap < 0) || close.isPending}
          onClick={() => close.mutate(a.id, { onSuccess: followRecord, onError: refuse })}
        >
          {gap >= 0 ? (
            <>
              Step <Num>{gap + 1}</Num> is open behind you
            </>
          ) : a.stepComplete ? (
            <>
              Close step <Num>{cur + 1}</Num> → {FLOW[Math.min(cur + 1, FLOW.length - 1)]!.label}
            </>
          ) : (
            <>
              <Num>{left}</Num> task{left === 1 ? '' : 's'} left in step <Num>{cur + 1}</Num>
            </>
          )}
        </button>
      ) : null}

      {run && a.readyToFinish ? (
        <button type="button" className="btn" onClick={onPromote}>
          Start Level 1 · move to Onboarded
        </button>
      ) : null}

      {view !== cur ? (
        <button type="button" className="btn ghost" onClick={() => onView(null)}>
          Back to step <Num>{cur + 1}</Num> · {FLOW[cur]!.label}
        </button>
      ) : null}

      {run && cur > 0 ? (
        <button
          type="button"
          className="btn ghost"
          disabled={back.isPending}
          onClick={() => back.mutate(a.id, { onSuccess: followRecord, onError: refuse })}
        >
          Step back
        </button>
      ) : null}
    </div>
  );
}
