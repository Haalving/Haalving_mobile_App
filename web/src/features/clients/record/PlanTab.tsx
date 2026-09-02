'use client';

import { useState } from 'react';

import { Audit, Empty, Notice, Pill, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import {
  useAssignPlan,
  useClientPlan,
  usePlanTemplates,
  usePublishPlan,
  type PlanPillar,
} from '@/features/clients/queries';

/**
 * The Plan tab — which template each of this client's four pillars is on.
 *
 * Ported from the demo's per-client plan panel (console-clients.js:1155+).
 *
 * WHO MAY SET WHAT IS THE SERVER'S ANSWER, per pillar, and it arrives on each row
 * as `mayAssign`. The rule it reflects:
 *
 *   `assignPlan`   every pillar — Super Admin, Ops Head, Haalving Coach
 *   `editCatalog`  their own    — the pillar coaches
 *   everybody else read         — the Doctor, the Super User
 *
 * Computing that here from the role would be a second copy of the matrix, and the
 * copy that drifts is always the one on the screen. So the page draws what the
 * server says and nothing more; the API refuses anything else regardless.
 *
 * A READ-ONLY VISITOR SEES THE WHOLE PLAN. The Doctor needs to know what a client
 * is on — that is most of why she is looking — she simply cannot change it. Hiding
 * the rows from her would be a different and worse screen.
 */

const PILLAR_LABEL: Record<string, string> = {
  culture: 'Nutrition',
  fitness: 'Fitness',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};

export function PlanTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, error, refetch } = useClientPlan(clientId);
  const [picking, setPicking] = useState<string | null>(null);

  if (isLoading) return <SkeletonRows rows={4} height={84} />;

  if (isError || !data) {
    return (
      <Notice kind="bad">
        {(error as Error | undefined)?.message ?? 'Could not read this plan.'}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Notice>
    );
  }

  return (
    <div className="ccscroll">
      <p className="sub">
        One template per pillar. A plan stays a draft until somebody publishes it — choosing is a
        coach thinking, publishing is what the client is actually on.
      </p>

      {data.mayAssign.length === 0 ? (
        <Audit>
          You are reading this plan. Setting it belongs to the coach who owns the pillar, or to
          Operations.
        </Audit>
      ) : null}

      <div className="list">
        {data.pillars.map((p) => (
          <PillarRow
            key={p.pillar}
            clientId={clientId}
            row={p}
            open={picking === p.pillar}
            onPick={() => setPicking(picking === p.pillar ? null : p.pillar)}
            onDone={() => setPicking(null)}
          />
        ))}
      </div>
    </div>
  );
}

function PillarRow({
  clientId,
  row,
  open,
  onPick,
  onDone,
}: {
  clientId: string;
  row: PlanPillar;
  open: boolean;
  onPick: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const assign = useAssignPlan();
  const publish = usePublishPlan();
  const { data: picker, isLoading } = usePlanTemplates(clientId, open ? row.pillar : null);

  const label = PILLAR_LABEL[row.pillar] ?? row.pillar;

  return (
    <div className="trow" style={{ flexWrap: 'wrap' }}>
      <div className="grow">
        <b>{label}</b>
        <small>
          {row.state === 'ASSIGNED' && row.template ? (
            <>
              {row.template.name} · L{row.template.level} · {row.template.track}
              {row.assignedBy ? ` · set by ${row.assignedBy.name}` : ''}
            </>
          ) : row.state === 'CALLED' ? (
            /* the demo's own distinction: opened, but nothing chosen */
            'Called — no plan chosen yet'
          ) : (
            'Not set up'
          )}
        </small>
      </div>

      {row.state === 'ASSIGNED' ? (
        row.draft ? (
          <Pill kind="warn">Draft</Pill>
        ) : (
          <Pill kind="ok">Live</Pill>
        )
      ) : null}

      {/* Publish is offered only where it would work: assigned, still a draft, and
          yours to set. The server checks the template is published too. */}
      {row.mayAssign && row.state === 'ASSIGNED' && row.draft ? (
        <button
          type="button"
          className="btn sm"
          disabled={publish.isPending}
          onClick={() =>
            publish.mutate(
              { clientId, pillar: row.pillar },
              {
                onSuccess: () => toast(`${label} plan is live.`),
                onError: (e) => toast((e as Error).message),
              },
            )
          }
        >
          <Icon name="check" />
          Publish
        </button>
      ) : null}

      {row.mayAssign ? (
        <button type="button" className="btn sm ghost" onClick={onPick}>
          <Icon name="pencil" />
          {row.state === 'ASSIGNED' ? 'Change' : 'Choose'}
        </button>
      ) : (
        /* said out loud rather than left as a missing button — an absent control
           reads as "not built", and this one is "not yours" */
        <Audit>Read-only for your role</Audit>
      )}

      {open ? (
        <div style={{ flexBasis: '100%', marginTop: 'var(--s3)' }}>
          {isLoading ? <SkeletonRows rows={2} height={44} /> : null}

          {picker && picker.templates.length === 0 ? (
            <Empty
              icon="leaf"
              sentence={`No ${label.toLowerCase()} templates exist yet.`}
              sub="Write one in the Catalog, then come back and choose it."
            />
          ) : null}

          {picker && picker.templates.length ? (
            <div className="list">
              {picker.templates.map((t) => {
                const chosen = row.template?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="trow"
                    style={{ width: '100%', textAlign: 'left' }}
                    disabled={assign.isPending}
                    onClick={() =>
                      assign.mutate(
                        { clientId, pillar: row.pillar, templateId: chosen ? null : t.id },
                        {
                          onSuccess: () => {
                            toast(chosen ? `${label} plan cleared.` : `${label}: ${t.name}`);
                            onDone();
                          },
                          onError: (e) => toast((e as Error).message),
                        },
                      )
                    }
                  >
                    <div className="grow">
                      <b>{t.name}</b>
                      <small>
                        Level {t.level} · {t.track}
                        {/* MARKED, NEVER FILTERED — the picker says which is the obvious
                            choice and lets the coach make it. A client on a track with one
                            template would otherwise get a picker that changes nothing, and
                            moving somebody onto a gentler track's plan is exactly the kind
                            of judgement this screen exists for. */}
                        {t.onLevel ? ' · their level' : ''}
                      </small>
                    </div>
                    {t.onTrack === false ? <Pill kind="warn">Other track</Pill> : null}
                    {t.published ? <Pill kind="ok">Published</Pill> : <Pill kind="warn">Draft</Pill>}
                    {chosen ? <Pill kind="info">Current — tap to clear</Pill> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
