'use client';

import { useState } from 'react';

import { Empty, Sheet, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import type { CatalogItem } from '@/features/catalog/queries';
import { groupSum, optId, optX, r1 } from '@/features/catalog/slotMath';
import {
  useSavePlanDay,
  type ClientPlan,
  type PlanPillar,
  type PlanSlot,
  type PlanTemplateFull,
} from '@/features/clients/queries';
import { first } from '../ScratchPad';
import { catalogFor, doseOf, effectiveDay, pruneSlots } from './planMath';
import { from24, letter, specFor, to24 } from './spec';

/**
 * The AND/OR slot editor · one grammar — the demo's `slotEditorParts` mounted
 * in a sheet by `editDaySheet` (console-clients.js:1662-1918).
 *
 * The sheet works on a deep copy: nothing is written until Save, so Escape is
 * always a clean way out. Saved as an override on the TICKET: a day the coach
 * touched replaces the template's day whole, the template itself is never
 * written to here, and the client sees none of it until the ticket is approved.
 *
 * A day is always saved WHOLE — the server receives every slot, not a patch.
 */
export function DaySheet({
  plan,
  row,
  template,
  day,
  items,
  onClose,
}: {
  plan: ClientPlan;
  row: PlanPillar;
  template: PlanTemplateFull;
  day: number;
  /** the pillar's library — every item, so a name can be read for an archived one */
  items: CatalogItem[];
  onClose: () => void;
}) {
  const toast = useToast();
  const pillar = row.pillar;
  const sp = specFor(pillar);
  const F = first(plan.clientName);
  const save = useSavePlanDay();
  const track = template.track || 'sedentary';
  const byId = new Map(items.map((i) => [i.id, i]));
  const lib = catalogFor(
    items.filter((i) => !i.archived),
    track,
  );
  const itemName = (id: string) => byId.get(id)?.name ?? id;

  const [draft, setDraft] = useState<PlanSlot[]>(() =>
    structuredClone((effectiveDay(row.view, template, day) ?? { slots: [] }).slots ?? []),
  );
  const [newLabel, setNewLabel] = useState('');

  const update = (fn: (d: PlanSlot[]) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  /* one film a day and no more — a second would have nothing to mean */
  const full = !!sp.one && draft.length >= 1;

  const addSlot = () => {
    const slot: PlanSlot = { label: newLabel.trim() || sp.defaults[0] || sp.slotWord, options: [[]] };
    if (sp.time) slot.time = '';
    update((d) => void d.push(slot));
    setNewLabel('');
  };

  const saveNow = () => {
    const { slots, bad } = pruneSlots(
      draft.map((s) => ({ ...s, label: (s.label ?? '').trim() || sp.slotWord })),
      pillar,
    );
    if (bad) {
      toast(`${bad} has no options left — a slot needs at least one.`);
      return;
    }
    save.mutate(
      { clientId: plan.clientId, pillar, day, slots },
      {
        onSuccess: () => {
          onClose();
          toast(`Day staged — ${F} sees it when you approve.`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  /* when the client's own dose is set, a number typed here visibly does
     nothing — say so rather than let the coach wonder */
  const mine = (row.view.dose ?? {}) as Record<string, unknown>;
  const beaten = sp.fields
    .filter((f) => mine[f.k] !== undefined && mine[f.k] !== '')
    .map((f) => f.t.toLowerCase());

  const grpHtml = (slot: PlanSlot, si: number, grp: PlanSlot['options'][number], gi: number) => {
    const name = `Option ${letter(gi)}`;
    return (
      <div className="pgrp" key={gi}>
        <div className="k">{name}</div>
        {grp.length ? null : (
          <p className="audit">Nothing in this alternative yet — add an item, or remove the option.</p>
        )}
        {grp.map((e, ii) => {
          const id = optId(e);
          const x = optX(e);
          const nm = itemName(id);
          /* portions are a FOOD concept — only a sums pillar shows the ×N cycle
             (×1 → ×2 → ×3 → ×1). One compact button with its own class:
             .pgrp .chip button paints any chip button danger-red on hover,
             which is the REMOVE grammar, not the portion's */
          return (
            <span className="chip" key={ii}>
              {nm}
              {sp.sums ? (
                <button
                  type="button"
                  className="chipx num"
                  aria-label={`${nm} portion, now ×${x} — tap to change`}
                  onClick={() =>
                    update((d) => {
                      const xg = d[si]!.options[gi]!;
                      const cur = optX(xg[ii]!);
                      const nxt = cur >= 3 ? 1 : cur + 1;
                      /* a bare id IS ×1, so stepping down to one canonicalises
                         back to the plain string */
                      xg[ii] = nxt === 1 ? optId(xg[ii]!) : { id: optId(xg[ii]!), x: nxt };
                    })
                  }
                >
                  ×{x}
                </button>
              ) : x > 1 ? (
                <span className="chipx num">×{x}</span>
              ) : null}
              <button
                type="button"
                aria-label={`Remove ${nm} from ${name}`}
                onClick={() => update((d) => void d[si]!.options[gi]!.splice(ii, 1))}
              >
                <Icon name="x" />
              </button>
            </span>
          );
        })}
        <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)', flexWrap: 'wrap' }}>
          <select
            className="input sel"
            aria-label={`Add an item to ${name}`}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              /* compare by id, never by entry — an {id, x:2} object would slip
                 past indexOf and the same food would land twice */
              if (grp.some((en) => optId(en) === v)) {
                toast('Already in that option.');
                return;
              }
              update((d) => void d[si]!.options[gi]!.push(v));
            }}
          >
            <option value="">Add {sp.itemWord}…</option>
            {lib.items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
          {slot.options.length > 1 ? (
            <button
              type="button"
              className="btn sm quiet"
              onClick={() => update((d) => void d[si]!.options.splice(gi, 1))}
            >
              Remove option
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  /* the pillar's own fields — sets and reps for a session, minutes and a focus
     for a practice, a note for a meal. An empty box shows the library's
     default as its placeholder; typing in it overrides that for this day only. */
  const fieldsHtml = (slot: PlanSlot, si: number) => {
    if (!sp.fields.length && !sp.sums) return null;
    const readout = sp.sums ? (
      <>
        {/* EVERY option gets its own reading, so B can be weighed against A
            while it is being built; the day's totals still follow Option A
            alone, because the client eats A or B, never both */}
        {slot.options.map((grp, gi) => {
          const n = groupSum(grp, byId);
          return (
            <p className="audit" style={{ margin: 'var(--s2) 0 0' }} key={gi}>
              <b>Option {letter(gi)}</b> reads <span className="num">{r1(n.kcal)}</span> kcal ·{' '}
              <span className="num">{r1(n.protein)}</span> g protein ·{' '}
              <span className="num">{r1(n.carbs)}</span> g carbs ·{' '}
              <span className="num">{r1(n.fat)}</span> g fat ·{' '}
              <span className="num">{r1(n.fibre)}</span> g fibre
            </p>
          );
        })}
        <p className="audit" style={{ margin: 'var(--s1) 0 0' }}>
          Summed from the foods and their portions, never typed.{' '}
          {slot.options.length > 1 ? 'The day counts Option A — alternatives replace it, they never add.' : ''}
        </p>
      </>
    ) : null;
    if (!sp.fields.length) return readout;
    const notice = beaten.length ? (
      <p className="audit" style={{ margin: 'var(--s2) 0 0' }}>
        This client’s own {beaten.join(', ')} win{beaten.length === 1 ? 's' : ''} over what is typed
        here — clear them on Session dose to hand the plan back.
      </p>
    ) : null;
    const own = (slot.dose ?? {}) as Record<string, unknown>;
    return (
      <>
        <div className={sp.fields.length > 2 ? 'grid2' : ''} style={{ marginTop: 'var(--s2)' }}>
          {sp.fields.map((f) => {
            const val = own[f.k] !== undefined ? String(own[f.k]) : '';
            /* what the LIBRARY would give this slot, ignoring any override typed */
            const dflt = doseOf({ options: slot.options }, f.k, byId);
            const ph = f.ph || (dflt !== undefined ? String(dflt) : '');
            const id = `dz-${si}-${f.k}`;
            return (
              <div key={f.k}>
                <label className="field-label" htmlFor={id}>
                  {f.t}
                </label>
                <input
                  className="input"
                  id={id}
                  {...(f.kind === 'num' ? { type: 'number', min: 0, inputMode: 'numeric' as const } : {})}
                  {...(f.max ? { max: f.max } : {})}
                  value={val}
                  placeholder={ph}
                  autoComplete="off"
                  onChange={(e) => {
                    const v = e.target.value;
                    update((d) => {
                      const ds = d[si]!;
                      const dose = { ...(ds.dose ?? {}) } as Record<string, unknown>;
                      if (v.trim() === '') delete dose[f.k];
                      else dose[f.k] = f.kind === 'num' ? Number(v) : v;
                      ds.dose = dose;
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
        {notice}
        {readout}
      </>
    );
  };

  const slotBlock = (slot: PlanSlot, si: number) => (
    <div className={`card quiet ${sp.cls}`} key={si}>
      <div className="h1-row">
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <span className={sp.cls} style={{ display: 'inline-flex', flex: 'none' }} title={sp.name}>
            <span className="pdot" />
          </span>
          <input
            className="input"
            value={slot.label ?? sp.slotWord}
            aria-label={`${sp.slotWord} name`}
            autoComplete="off"
            style={{ maxWidth: 190 }}
            onChange={(e) => {
              const v = e.target.value;
              update((d) => void (d[si]!.label = v));
            }}
          />
          {sp.time ? (
            <input
              className="input"
              type="time"
              value={to24(slot.time)}
              aria-label="Time"
              style={{ maxWidth: 120 }}
              onChange={(e) => {
                const v = from24(e.target.value);
                update((d) => void (d[si]!.time = v));
              }}
            />
          ) : null}
        </span>
        <button type="button" className="btn sm quiet" onClick={() => update((d) => void d.splice(si, 1))}>
          Remove
        </button>
      </div>
      {slot.options.map((grp, gi) => grpHtml(slot, si, grp, gi))}
      {lib.all ? (
        <p className="audit">No {track} items in this library — every category is offered.</p>
      ) : null}
      {/* an empty alternative is a legal HALF-WAY state, never a saved one:
          Save prunes the empties and refuses a slot left with none */}
      <button
        type="button"
        className="btn sm ghost"
        style={{ marginTop: 'var(--s2)' }}
        onClick={() => update((d) => void d[si]!.options.push([]))}
      >
        <Icon name="plus" />
        Add alternative
      </button>
      {fieldsHtml(slot, si)}
    </div>
  );

  return (
    <Sheet open onClose={onClose}>
      <div className="h1">
        Day <span className="num">{day}</span>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {F} · {sp.name}
      </p>
      <p className="sub">
        Items inside one option are taken together; separate options are alternatives — this day
        belongs to {sp.name}.
      </p>
      <div id="ed-body">
        {draft.length ? (
          draft.map(slotBlock)
        ) : (
          <Empty
            icon="cal"
            sentence="Nothing on this day."
            sub="Add the first one below — a blank day is a legitimate answer too."
          />
        )}
      </div>
      {full ? null : (
        <div className="card quiet">
          <label className="field-label" htmlFor="ed-newlabel">
            Add a {sp.slotWord.toLowerCase()}
          </label>
          <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
            <input
              className="input"
              id="ed-newlabel"
              list="ed-names"
              placeholder={sp.defaults[0] ?? sp.slotWord}
              aria-label={`Name for the new ${sp.slotWord.toLowerCase()}`}
              autoComplete="off"
              style={{ flex: 1, minWidth: 140 }}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSlot();
                }
              }}
            />
            <datalist id="ed-names">
              {sp.defaults.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <button type="button" className="btn sm ghost" id="ed-addslot" onClick={addSlot}>
              <Icon name="plus" />
              Add
            </button>
          </div>
        </div>
      )}
      <button type="button" className="btn block" id="ed-save" disabled={save.isPending} onClick={saveNow}>
        Save day
      </button>
      <button type="button" className="btn block ghost" id="ed-cancel" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
