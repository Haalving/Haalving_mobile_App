'use client';

import type { ReactNode } from 'react';
import { FLOW, phases, type TaskAct } from '@haalving/shared';

import { Notice, Num, Pill } from '@/components/ui';
import { Acts } from '@/features/clients/onboarding/Acts';
import { StepBody } from '@/features/clients/onboarding/StepBody';
import { StepDot, StepMeta, stepState } from '@/features/clients/onboarding/stepState';
import type { Arrival } from '@/features/clients/onboarding/queries';

/**
 * The process — ported from `flowCardHtml`, `crumbsHtml` and `trackHtml`
 * (console-pipeline.js:730-795, 867-892).
 *
 * TWELVE STEPS IS TOO MANY TO HOLD IN YOUR HEAD and exactly the right number to
 * hold on a rail. Each crumb is a real button: it moves the LENS, never the
 * record, so a reader can look ahead at the calendar meeting from step 2 without
 * anything about step 2 changing. The record's own position is its `step` field
 * and nothing else — nothing on this screen writes it except the two step
 * buttons in the action row.
 */

export function FlowCard({
  a,
  lens,
  view,
  onView,
  unlocked,
  onUnlock,
  onPromote,
  actSlot,
}: {
  a: Arrival;
  lens: string | null;
  /** The step being READ. Follows the record until a crumb is clicked. */
  view: number;
  onView: (key: string | null) => void;
  unlocked: string | null;
  onUnlock: (key: string | null) => void;
  onPromote: () => void;
  actSlot: (act: TaskAct) => ReactNode;
}) {
  const cur = a.stepIndex;
  const gap = a.firstGap;

  return (
    <>
      <div className="h1-row">
        {/* the demo's own inline reset — `.card .k` is a block caption elsewhere
            and here it shares a row with the reference (console-pipeline.js:884) */}
        <span className="k" style={{ margin: 0 }}>
          The process
        </span>
        {/* the revision the RECORD was stamped with, not today's — a record can
            only have walked the flow it was created under */}
        <span className="sub">{a.flowVersion} · Operations Process Flow</span>
      </div>

      <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
        {lens
          ? 'Every step and its progress is here. Open one and you will see the lines your seat owns — the rest belong to other benches and close in their own hands.'
          : 'Steps run in order. Only the open step can be ticked — but every step can be read, and a closed one can be corrected.'}
      </p>

      <nav className="ob-crumbs" aria-label="The twelve onboarding steps">
        {phases().map((ph) => (
          <div className="ob-crgrp" key={ph.name}>
            <span className="ob-crph">{ph.name}</span>
            <div className="ob-crrow">
              {ph.steps.map(({ step, i }) => {
                const st = stepState(a, i);
                const says =
                  st === 'gap'
                    ? 'has an open task'
                    : st === 'done'
                      ? 'closed'
                      : st === 'now'
                        ? 'open now'
                        : 'locked';
                const label = `Step ${i + 1} of ${FLOW.length} · ${step.label} — ${says}`;
                return (
                  <button
                    type="button"
                    key={step.key}
                    className={`ob-cr ${st}${i === view ? ' on' : ''}`}
                    title={label}
                    /* the demo carries this sentence in a `.vh` span; that class
                       is not one of the ported ones, and an aria-label over two
                       hidden children says the same thing to the same readers */
                    aria-label={label}
                    aria-current={i === view ? 'step' : undefined}
                    onClick={() => onView(step.key)}
                  >
                    <span className="ob-crd" aria-hidden="true">
                      <StepDot rec={a} i={i} />
                    </span>
                    <span className="ob-crl" aria-hidden="true">
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {a.readyToFinish ? (
        <Notice>
          Every step of the SOP is closed. Moving {a.name.split(' ')[0]} across creates their client
          record, opens their Care Circle and starts Day 1 of Level 1.
        </Notice>
      ) : null}

      {gap >= 0 ? (
        <Notice kind="bad">
          Step <Num>{gap + 1}</Num> · {FLOW[gap]!.label} was closed and then re-opened by an edit.
          The flow stays where it is until that step is whole again.
        </Notice>
      ) : null}

      {phases().map((ph) => (
        <div className="ob-phase" key={ph.name}>
          <div className="ob-phname">{ph.name}</div>
          {ph.steps.map(({ step, i }) => {
            const open = i === view;
            /* a collapsed row IS its own crumb — same action, second door. Only
               collapsed rows carry it: the open one already holds the checkboxes
               and the correction button, and a click surface wrapped around
               those would be a click surface fighting them. */
            const rowProps = open
              ? {}
              : {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `Open step ${i + 1} of ${FLOW.length} · ${step.label}`,
                  onClick: () => onView(step.key),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onView(step.key);
                    }
                  },
                };
            return (
              <div
                className={`ob-step ${stepState(a, i)}${open ? ' open' : ' click'}`}
                key={step.key}
                {...rowProps}
              >
                <span className="ob-dot">
                  <StepDot rec={a} i={i} />
                </span>
                <span>
                  <b>{step.label}</b>
                  <small>
                    <StepMeta rec={a} i={i} />
                  </small>
                  {open ? (
                    <StepBody
                      a={a}
                      i={i}
                      lens={lens}
                      unlocked={unlocked}
                      onUnlock={onUnlock}
                      actSlot={actSlot}
                    />
                  ) : null}
                </span>
                {i === cur ? (
                  <Pill kind="info">Here now</Pill>
                ) : open ? (
                  <Pill kind="neutral">Viewing</Pill>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      <Acts a={a} view={view} onView={onView} onUnlock={onUnlock} onPromote={onPromote} />
    </>
  );
}
