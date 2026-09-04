'use client';

import { useState } from 'react';

import { AiDraft, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import {
  useCallPlan,
  useFitPlan,
  usePlanTemplates,
  type ClientPlan,
  type PlanDose,
  type PlanPillar,
} from '@/features/clients/queries';
import { first } from '../ScratchPad';
import { isSessionPillar, specFor, to24 } from './spec';

/**
 * Call · a published template for ONE pillar, chosen by a human — the demo's
 * `assignSheet` (console-clients.js:1498).
 *
 * The list is filtered to this pillar and defaults to the client's own shelf:
 * their level in this pillar, their activity category. Everything else on the
 * pillar is still offered — the default is a suggestion, not a rule.
 *
 * Calling writes a TICKET, not a plan. The coach then edits it freely — days,
 * the client's own hour, their dose — and the client sees the lot only when
 * Approve is pressed. The recipe book itself is never touched.
 *
 * The sheet reflects the TICKET, like every other control on the tab —
 * preselecting the live template while a different one sits staged made
 * Confirm silently revert the staged choice.
 */
export function CallSheet({
  plan,
  row,
  trackWord,
  onClose,
  onCalled,
}: {
  plan: ClientPlan;
  row: PlanPillar;
  trackWord: (k: string | null | undefined) => string;
  onClose: () => void;
  /** the day re-defaults after a call — a new template may have fewer days */
  onCalled: () => void;
}) {
  const toast = useToast();
  const pillar = row.pillar;
  const sp = specFor(pillar);
  const session = isSessionPillar(pillar);
  const F = first(plan.clientName);
  const lvl = plan.levels[pillar] || 1;
  const { data: picker, isLoading } = usePlanTemplates(plan.clientId, pillar);
  const call = useCallPlan();
  const fit = useFitPlan();

  const [picked, setPicked] = useState<string | null>(null);
  const [time, setTime] = useState(() => (session ? to24(row.view.time) : ''));
  const [dose, setDose] = useState<Record<string, string>>(() => {
    const cur = (row.view.dose ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const f of sp.fields) if (cur[f.k] !== undefined) out[f.k] = String(cur[f.k]);
    return out;
  });
  const [ai, setAi] = useState<string | null>(null);

  const pubs = picker?.templates ?? [];
  const onShelf = pubs.filter((t) => t.onShelf);
  /* the ticket's template when it is still offered, else the shelf's first, else the pillar's */
  const curTpl = row.view.templateId;
  const defaultPick =
    curTpl && pubs.some((t) => t.id === curTpl) ? curTpl : (onShelf[0] ?? pubs[0])?.id ?? null;
  const chosen = picked ?? defaultPick;
  /* Day overrides belong to the template they were written against, so a new
     call starts them empty — say how many go */
  const drops = row.edits;

  const ask = () =>
    fit.mutate(
      { clientId: plan.clientId, pillar },
      {
        onSuccess: (r) => {
          setPicked(r.templateId);
          setAi(r.text);
        },
        onError: (e) => toast((e as Error).message),
      },
    );

  const go = () => {
    const t = pubs.find((x) => x.id === chosen);
    if (!t) {
      toast('Pick a template first.');
      return;
    }
    const args: Parameters<typeof call.mutate>[0] = { clientId: plan.clientId, pillar, templateId: t.id };
    if (session) {
      /* the hour and the dose travel with the call; the server stages each only
         when it actually CHANGES something — writing '' onto a pillar that never
         had a time stages nothing */
      args.time = time || '';
      const dOut: Record<string, number | string> = {};
      for (const f of sp.fields) {
        const raw = (dose[f.k] ?? '').trim();
        if (raw === '') continue;
        const dv = f.kind === 'num' ? Number(raw) || 0 : raw;
        if (dv) dOut[f.k] = dv;
      }
      args.dose = Object.keys(dOut).length ? (dOut as PlanDose) : null;
    }
    call.mutate(args, {
      onSuccess: () => {
        onCalled();
        onClose();
        toast(`${t.name} called — edit it freely, then approve to publish.`);
      },
      onError: (e) => toast((e as Error).message),
    });
  };

  if (picker && !pubs.length) {
    return (
      <Sheet open onClose={onClose}>
        <div className="h1">No published {sp.name} templates</div>
        <p className="sub">
          Every {sp.name} template is still a draft. One has to clear the approval chain before it
          can be assigned.
        </p>
        <button type="button" className="btn block" onClick={onClose}>
          Close
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">Call a {sp.name} template</div>
      <p className="sub">
        {plan.clientName} · {trackWord(plan.track)} · {sp.name} level <span className="num">{lvl}</span>
        . The template decides what their day looks like; your edits ride on top of it, and nothing
        reaches {F} until you approve.
      </p>
      {drops ? (
        <div className="notice warn">
          A new call starts from the new template — the <span className="num">{drops}</span> edited{' '}
          {drops === 1 ? 'day' : 'days'} on the current {sp.name} plan drop when you approve it.
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={3} height={56} /> : null}

      <div className="list">
        {pubs.map((t) => (
          <label className="trow pslot" key={t.id}>
            <input
              type="radio"
              name="as-t"
              value={t.id}
              checked={t.id === chosen}
              onChange={() => setPicked(t.id)}
            />
            <span className="grow">
              <b>{t.name}</b>
              <small>{t.desc}</small>
            </span>
            <span className={`tshelf ${sp.cls}`}>
              <span className="tsl">
                L<span className="num">{t.level || 1}</span>
              </span>
              <span className="tst">{trackWord(t.track)}</span>
            </span>
            {t.onShelf ? <Pill kind="ok">Their shelf</Pill> : null}
          </label>
        ))}
      </div>

      {session ? (
        <>
          <div className="sec-title">Session time</div>
          <p className="sub" style={{ margin: '0 0 var(--s2)' }}>
            {F}’s own hour for {sp.name.toLowerCase()}. Leave it empty to follow the template’s
            times. A booked session always keeps the hour the coach booked.
          </p>
          <input
            className="input"
            type="time"
            id="as-time"
            value={time}
            aria-label="Session time"
            onChange={(e) => setTime(e.target.value)}
          />
          <div className="sec-title">Session dose</div>
          <p className="sub" style={{ margin: '0 0 var(--s2)' }}>
            {F}’s own numbers — they beat the template’s doses on every day. Leave a field empty
            to follow the plan.
          </p>
          <div className="grid2">
            {sp.fields.map((f) => (
              <span key={f.k}>
                <label className="field-label" htmlFor={`as-d-${f.k}`}>
                  {f.t}
                </label>
                <input
                  className="input"
                  id={`as-d-${f.k}`}
                  {...(f.kind === 'num' ? { type: 'number', min: 0 } : {})}
                  {...(f.max ? { max: f.max } : {})}
                  {...(f.ph ? { placeholder: f.ph } : {})}
                  value={dose[f.k] ?? ''}
                  onChange={(e) => setDose((d) => ({ ...d, [f.k]: e.target.value }))}
                />
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* the AI proposes; the human still taps Call — a draft never assigns itself */}
      <div id="as-ai">
        {ai ? (
          <AiDraft>
            <div>{ai}</div>
          </AiDraft>
        ) : null}
      </div>
      <button type="button" className="btn block ghost" disabled={fit.isPending} onClick={ask}>
        Ask AI to fit
      </button>
      <button type="button" className="btn block" disabled={call.isPending || isLoading} onClick={go}>
        Call for {F}
      </button>
      <button type="button" className="btn block ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
