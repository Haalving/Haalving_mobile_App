'use client';

import { Fragment, useState } from 'react';
import { hmToMin } from '@haalving/shared';

import { Sheet, useToast } from '@/components/ui';
import {
  useDiscardPlanDraft,
  useSavePlanAsTemplate,
  useTunePlan,
  type ClientPlan,
  type PlanDose,
  type PlanPillar,
  type PlanTargets,
  type PlanTemplateFull,
} from '@/features/clients/queries';
import { first } from '../ScratchPad';
import { nutTargetsFor } from './planMath';
import { specFor, to24 } from './spec';

/**
 * The small sheets of the Plan tab — the demo's `timeSheet`, `doseSheet`,
 * `targetsSheet`, `discardDraft` and `saveTemplateSheet`
 * (console-clients.js:2000-2260).
 *
 * The first three stage the two things a ticket carries that the recipe book
 * cannot: this client's own hour and dose for a session pillar, and — on
 * Nutrition — the daily targets their panel reads. Each stages like any other
 * edit, and an EMPTY staged value is a real answer: it hands the client back
 * to the template's own times, the plan's own doses, the derivation.
 */

interface SheetProps {
  plan: ClientPlan;
  row: PlanPillar;
  onClose: () => void;
}

/* ---- this client's own hour for one session pillar ----
   Stored as a zero-padded 24-hour 'HH:MM', which is exactly what the form
   control hands over — hmToMin refuses anything else, and a refusal reads as
   "no per-client time", which would be a silent fallback to the template. */
export function TimeSheet({ plan, row, onClose }: SheetProps) {
  const toast = useToast();
  const sp = specFor(row.pillar);
  const F = first(plan.clientName);
  const tune = useTunePlan();
  const [val, setVal] = useState(() => to24(row.view.time));

  const stage = (time: string) =>
    tune.mutate(
      { clientId: plan.clientId, pillar: row.pillar, time },
      {
        onSuccess: () => {
          onClose();
          toast(`Staged — ${F} sees it when you approve.`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">{sp.name} session time</div>
      <p className="sub">
        {F}’s own hour, on every day {sp.name.toLowerCase()} runs. Leave it empty to follow the
        template’s own times. A session the coach has booked always keeps its booked hour.
      </p>
      <input
        className="input"
        type="time"
        id="ts-t"
        value={val}
        aria-label="Session time"
        onChange={(e) => setVal(e.target.value)}
      />
      <button
        type="button"
        className="btn block"
        disabled={tune.isPending}
        onClick={() => {
          if (hmToMin(val) == null) {
            toast('Pick a time first.');
            return;
          }
          stage(val);
        }}
      >
        Stage this time
      </button>
      <button type="button" className="btn block ghost" disabled={tune.isPending} onClick={() => stage('')}>
        Follow the template
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

/* ---- this client's own session dose ----
   The person's numbers — sets, reps, a weight, rounds — over the plan's, the
   same contract as their hour: they beat the template's own doses on every
   day until cleared. */
export function DoseSheet({ plan, row, onClose }: SheetProps) {
  const toast = useToast();
  const sp = specFor(row.pillar);
  const F = first(plan.clientName);
  const tune = useTunePlan();
  const flds = sp.fields;
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const cur = (row.view.dose ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const f of flds) if (cur[f.k] !== undefined) out[f.k] = String(cur[f.k]);
    return out;
  });

  const stage = (dose: PlanDose | null) =>
    tune.mutate(
      { clientId: plan.clientId, pillar: row.pillar, dose },
      {
        onSuccess: () => {
          onClose();
          toast(`Staged — ${F} sees it when you approve.`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">Session dose — {F}</div>
      <p className="sub">
        {F}’s own numbers for every {sp.slotWord.toLowerCase()}. A number here beats the plan’s own
        doses on every day; leave a field empty to follow the plan.
      </p>
      <div className={flds.length > 2 ? 'grid2' : ''}>
        {flds.map((f) => (
          <span key={f.k}>
            <label className="field-label" htmlFor={`ds-${f.k}`}>
              {f.t}
            </label>
            <input
              className="input"
              id={`ds-${f.k}`}
              {...(f.kind === 'num' ? { type: 'number', min: 0 } : {})}
              {...(f.max ? { max: f.max } : {})}
              {...(f.ph ? { placeholder: f.ph } : {})}
              value={vals[f.k] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
            />
          </span>
        ))}
      </div>
      <button
        type="button"
        className="btn block"
        disabled={tune.isPending}
        onClick={() => {
          const out: Record<string, number | string> = {};
          for (const f of flds) {
            const raw = (vals[f.k] ?? '').trim();
            if (raw === '') continue;
            const v = f.kind === 'num' ? Number(raw) || 0 : raw;
            if (f.kind === 'num' && !v) continue;
            out[f.k] = v;
          }
          if (!Object.keys(out).length) {
            toast('Set a number first — or use “Follow the plan”.');
            return;
          }
          stage(out as PlanDose);
        }}
      >
        Stage these numbers
      </button>
      <button type="button" className="btn block ghost" disabled={tune.isPending} onClick={() => stage(null)}>
        Follow the plan’s doses
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

/* ---- this client's daily nutrition targets ----
   Five numbers the Nutrient Panel reads. Left empty they fall back through
   the template and then the derivation, which is what nutTargetsFor does — so
   an empty field here is a real answer, not a missing one. */
const TARGET_KEYS: Array<[keyof PlanTargets, string, string]> = [
  ['kcal', 'Energy', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['fibre', 'Fibre', 'g'],
];

export function TargetsSheet({
  plan,
  row,
  liveTemplate,
  onClose,
}: SheetProps & { liveTemplate: PlanTemplateFull | null }) {
  const toast = useToast();
  const F = first(plan.clientName);
  const tune = useTunePlan();
  const res = nutTargetsFor(row.live, liveTemplate, plan.day, plan.shape.cycleDays);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const cur = row.view.targets ?? {};
    const out: Record<string, string> = {};
    for (const [k] of TARGET_KEYS) if (cur[k] != null) out[k] = String(cur[k]);
    return out;
  });

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">Daily targets</div>
      <p className="sub">
        What {F}’s Nutrient Panel measures the day against. Leave a field empty to let the template
        — and then the standard derivation — answer it.
      </p>
      {/* label and input are DIRECT children of the sheet, as in the demo — a
          wrapper would put the sheet's gap between the pair and turn the
          label's negative margin into an overlap */}
      {TARGET_KEYS.map(([k, label, unit]) => (
        <Fragment key={k}>
          <div className="field-label" id={`tg-${k}-l`}>
            {label} <small>({unit})</small>
          </div>
          <input
            className="input num"
            type="number"
            min={0}
            id={`tg-${k}`}
            aria-labelledby={`tg-${k}-l`}
            value={vals[k] ?? ''}
            placeholder={res ? String(res[k]) : '—'}
            onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
          />
        </Fragment>
      ))}
      <button
        type="button"
        className="btn block"
        disabled={tune.isPending}
        onClick={() => {
          const out: PlanTargets = {};
          for (const [k] of TARGET_KEYS) {
            const v = Number(vals[k]);
            if (v > 0) out[k] = Math.round(v);
          }
          tune.mutate(
            {
              clientId: plan.clientId,
              pillar: row.pillar,
              targets: Object.keys(out).length ? out : null,
            },
            {
              onSuccess: () => {
                onClose();
                toast(`Staged — ${F} sees it when you approve.`);
              },
              onError: (e) => toast((e as Error).message),
            },
          );
        }}
      >
        Stage these targets
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

/* ---- Discard · the ticket goes; the live plan stays exactly as it is ---- */
export function DiscardSheet({ plan, row, onClose }: SheetProps) {
  const toast = useToast();
  const sp = specFor(row.pillar);
  const F = first(plan.clientName);
  const discard = useDiscardPlanDraft();
  return (
    <Sheet open onClose={onClose}>
      <div className="h1">Discard this draft?</div>
      <p className="sub">
        Every staged {sp.name} change goes, and {F}’s plan stays exactly as it is now.
      </p>
      <button
        type="button"
        className="btn block"
        disabled={discard.isPending}
        onClick={() =>
          discard.mutate(
            { clientId: plan.clientId, pillar: row.pillar },
            {
              onSuccess: () => {
                onClose();
                toast('Draft discarded.');
              },
              onError: (e) => toast((e as Error).message),
            },
          )
        }
      >
        Discard the draft
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Keep editing
      </button>
    </Sheet>
  );
}

/* ---- Save as new template · the plan, overrides baked in, as a draft ---- */
export function SaveTemplateSheet({ plan, row, onClose }: SheetProps) {
  const toast = useToast();
  const sp = specFor(row.pillar);
  const F = first(plan.clientName);
  const save = useSavePlanAsTemplate();
  const base = row.live.template;
  const n = Object.keys(row.live.overrides ?? {}).length;
  const [name, setName] = useState(() => (base ? `${base.name} · ${F}` : ''));
  if (!base) return null;

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">Save as new template</div>
      <p className="sub">
        Everything this {sp.name} plan carries — {base.name} with its <span className="num">{n}</span>{' '}
        edited {n === 1 ? 'day' : 'days'} baked in — becomes a template of its own. It lands as a
        draft; the approval chain publishes it.
      </p>
      <input
        className="input"
        id="st-name"
        aria-label="Template name"
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        className="btn block"
        disabled={save.isPending}
        onClick={() => {
          const nm = name.trim();
          if (!nm) {
            toast('Give the template a name first.');
            return;
          }
          save.mutate(
            { clientId: plan.clientId, pillar: row.pillar, name: nm },
            {
              onSuccess: () => {
                onClose();
                toast('Saved as a draft template — submit it when you want it published.');
              },
              onError: (e) => toast((e as Error).message),
            },
          );
        }}
      >
        Save as draft template
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
