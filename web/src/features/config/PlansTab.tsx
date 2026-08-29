'use client';

import { PLANS, PLAN_KEYS } from '@haalving/shared';

/**
 * The Plans tab — read-only, and deliberately so.
 *
 * Ported from `plansHtml` (console-config.js:275-291). Plans are PRODUCT-DEFINED:
 * they live in `shared/plans.ts` rather than in a table, because changing what
 * Poorna means is a change to the product, not to a deployment. The tab renders
 * them and nothing on this page edits them.
 */
export function PlansTab() {
  return (
    <>
      {PLAN_KEYS.map((k) => {
        const p = PLANS[k];
        return (
          <div className="card" style={{ marginTop: 'var(--s3)' }} key={k}>
            <div className="row" style={{ gap: 'var(--s2)', alignItems: 'baseline' }}>
              <b>{p.name}</b>
              {!p.launch ? <span className="pill">Opening soon</span> : null}
            </div>
            <div className="sub">{p.tag}</div>

            <div className="card" style={{ marginTop: 'var(--s3)', background: 'var(--surface-2)' }}>
              <span className="k">Flow</span>
              <div style={{ marginTop: 'var(--s1)' }}>{p.flow}</div>
            </div>

            <p className="sub" style={{ marginTop: 'var(--s3)' }}>
              {p.desc}
            </p>
          </div>
        );
      })}

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        Plan definitions ship with the product.
      </p>
    </>
  );
}
