'use client';

import { PLANS, PLAN_KEYS, plansOnSale } from '@haalving/shared';

import { IconTile, Pill, useToast } from '@/components/ui';
import { useUpdateArrival, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * The plan — ported from `planPickHtml` (console-pipeline.js:796-828).
 *
 * WHICH PLAN AN ARRIVAL IS ON IS CONTEXT A COACH NEEDS; CHOOSING IT IS A
 * COMMERCIAL DECISION THEY HAVE NO PART IN. So a coach reads the fact and a
 * runner gets the picker — showing somebody a picker that refuses every tap is
 * worse than showing them the fact.
 *
 * The two vocabularies meet here: the record carries the Prisma enum (`POORNA`)
 * and every write body carries the repo's lowercase key (`poorna`). One lowercase
 * at the boundary, and nothing downstream has to remember which case it is in.
 */

export function PlanCard({ a }: { a: Arrival }) {
  const update = useUpdateArrival();
  const toast = useToast();

  const sale = plansOnSale();
  const chosen = a.plan.toLowerCase();

  if (!a.canRun) {
    const pl = PLANS[chosen as keyof typeof PLANS];
    return (
      <div className="card">
        <span className="k">Plan</span>
        <div className="trow" style={{ marginTop: 'var(--s2)' }}>
          <IconTile name="bookmark" className="sm" />
          <span className="grow">
            <b>{pl.name}</b>
            <small>
              {pl.tag} · {pl.flow}
            </small>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="k">Plan</span>
      <div className="list" style={{ marginTop: 'var(--s2)' }}>
        {PLAN_KEYS.map((k) => {
          const pl = PLANS[k];
          const onSale = sale.includes(k);
          return (
            /* the demo dims the row it will not accept rather than removing it
               (console-pipeline.js:812) */
            <label className="trow" key={k} style={onSale ? undefined : { opacity: 0.55 }}>
              <input
                type="radio"
                name="ob-plan"
                value={k}
                checked={chosen === k}
                disabled={!onSale || update.isPending}
                onChange={() =>
                  update.mutate(
                    { id: a.id, plan: k },
                    {
                      onSuccess: () => toast(`Plan set to ${pl.name}.`),
                      onError: (e) => toast((e as Error).message),
                    },
                  )
                }
              />
              {/* `.pslot .grow{flex:1;min-width:0}` (app.css:2686) — the demo's own
                  rule for a radio row, carried inline because `.pslot` is not one
                  of the ported classes */}
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>{pl.name}</b>
                <small>
                  {pl.tag} · {pl.flow}
                </small>
              </span>
              {onSale ? null : <Pill kind="neutral">Opening soon</Pill>}
            </label>
          );
        })}
      </div>
      <p className="audit" style={{ margin: 'var(--s2) 0 0' }}>
        This launch sells {sale.map((k) => PLANS[k].name).join(' and ')} only — every Poorna
        conversation trains the AI that will run Svayam.
      </p>
    </div>
  );
}
