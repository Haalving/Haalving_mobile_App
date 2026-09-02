'use client';

import { useMemo, useState } from 'react';

import { Audit, Empty, Notice, Pill, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import {
  useDeleteTemplate,
  useDuplicateTemplate,
  usePublishTemplate,
  useSaveTemplateDay,
  type CatalogData,
  type DayTargets,
  type OptionEntry,
  type PlanTemplate,
  type TemplateDay,
} from './queries';
import { groupSum, optId, optX, r1 } from './slotMath';

/**
 * THE TEMPLATE EDITOR — a template's 14 days, filled in.
 *
 * Ported from the demo's split-pane composer (console-catalog.js
 * `renderTemplateEditor`/`loadDay` + the shared `slotEditor`): a card and the
 * 14-day grid on the LEFT, the selected day on the RIGHT. A day carries SLOTS; a
 * slot carries OPTIONS — the A/B/C alternatives — each a list of catalog items, a
 * bare id or `{id, x}` when a portion is taken more than once. Nutrition slots
 * carry a time and read their kcal/protein from the items' own nutrients.
 *
 * A PUBLISHED TEMPLATE IS FROZEN — it may already be a client's live plan — so it
 * reads as text with "Duplicate to edit", exactly as the demo freezes it.
 */

const CYCLE = 14;

const PILLAR_CLASS: Record<string, string> = {
  fitness: 'p-fitness',
  culture: 'p-culture',
  yoga: 'p-yoga',
  wellness: 'p-wellness',
  motivation: 'p-motivation',
};
const SLOT_WORD: Record<string, string> = {
  culture: 'meal',
  fitness: 'session',
  yoga: 'practice',
  wellness: 'practice',
  motivation: 'film',
};
const SLOT_DEFAULTS: Record<string, string[]> = {
  culture: ['Breakfast', 'Mid-morning', 'Lunch', 'Snack', 'Dinner'],
  fitness: ['Warm-up', 'Main set', 'Cool-down'],
  yoga: ['Practice'],
  wellness: ['Practice'],
  motivation: ['Film'],
};
const TARGET_FIELDS: Array<[keyof DayTargets, string]> = [
  ['kcal', 'Energy (kcal)'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['fibre', 'Fibre (g)'],
];
const TARGET_UNIT: Record<keyof DayTargets, string> = {
  kcal: 'kcal',
  protein: 'g protein',
  carbs: 'g carbs',
  fat: 'g fat',
  fibre: 'g fibre',
};
const letter = (i: number) => String.fromCharCode(65 + i);
const emptyDay = (): TemplateDay => ({ slots: [], targets: {} });

/** "1700 kcal · 75 g protein · …", omitting anything unstated. */
function fmtTargets(t: DayTargets | null | undefined): string {
  if (!t) return '';
  const parts = (Object.keys(TARGET_UNIT) as Array<keyof DayTargets>)
    .filter((k) => t[k] != null)
    .map((k) => `${t[k]} ${TARGET_UNIT[k]}`);
  return parts.join(' · ');
}

export function TemplateEditor({
  template,
  data,
  onClose,
  onOpenTemplate,
}: {
  template: PlanTemplate;
  data: CatalogData;
  onClose: () => void;
  onOpenTemplate: (t: PlanTemplate) => void;
}) {
  const toast = useToast();
  const saveDay = useSaveTemplateDay();
  const duplicate = useDuplicateTemplate();
  const publish = usePublishTemplate();
  const remove = useDeleteTemplate();

  const lib = data.libraries.find((l) => l.key === template.pillar);
  const canManage = lib?.canEdit ?? false;
  const editable = canManage && !template.published;
  const isNutrition = template.pillar === 'culture';
  const items = useMemo(() => (lib?.items ?? []).filter((i) => !i.archived), [lib]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const slotWord = SLOT_WORD[template.pillar] ?? 'item';
  const defaults = SLOT_DEFAULTS[template.pillar] ?? ['Item'];

  const [days, setDays] = useState<Record<string, TemplateDay>>(() =>
    structuredClone(template.days ?? {}),
  );
  const [day, setDay] = useState(1);
  const [dirtyDays, setDirtyDays] = useState<Set<number>>(new Set());
  const [newLabel, setNewLabel] = useState('');

  const cur = days[String(day)] ?? emptyDay();
  const itemName = (id: string) => byId.get(id)?.name ?? id;
  /* the card shows the inherited default — the first day that states targets */
  const baseTargets = useMemo(() => {
    for (let d = 1; d <= CYCLE; d++) {
      const t = days[String(d)]?.targets;
      if (t && Object.keys(t).length) return t;
    }
    return null;
  }, [days]);

  const update = (fn: (d: TemplateDay) => void) => {
    setDays((prev) => {
      const next = { ...prev };
      const d = structuredClone(next[String(day)] ?? emptyDay());
      fn(d);
      next[String(day)] = d;
      return next;
    });
    setDirtyDays((s) => new Set(s).add(day));
    setNewLabel('');
  };

  const addSlot = () => {
    const label = newLabel.trim() || defaults[0] || slotWord;
    update((d) => {
      const slot = { pillar: template.pillar, label, options: [[]] as OptionEntry[][] } as TemplateDay['slots'][number];
      if (isNutrition) slot.time = '';
      d.slots.push(slot);
    });
  };
  const setLabel = (si: number, v: string) => update((d) => void (d.slots[si]!.label = v));
  const setTime = (si: number, v: string) => update((d) => void (d.slots[si]!.time = v));
  const removeSlot = (si: number) => update((d) => void d.slots.splice(si, 1));
  const setNote = (si: number, v: string) =>
    update((d) => void (d.slots[si]!.dose = v.trim() ? { note: v } : null));
  const addOption = (si: number) => update((d) => void d.slots[si]!.options.push([]));
  const removeOption = (si: number, gi: number) =>
    update((d) => {
      if (d.slots[si]!.options.length > 1) d.slots[si]!.options.splice(gi, 1);
    });
  const addItem = (si: number, gi: number, id: string) =>
    update((d) => {
      const grp = d.slots[si]!.options[gi]!;
      if (!grp.some((e) => optId(e) === id)) grp.push(id);
      else toast('Already in that option.');
    });
  const removeItem = (si: number, gi: number, ii: number) =>
    update((d) => void d.slots[si]!.options[gi]!.splice(ii, 1));
  const cycleX = (si: number, gi: number, ii: number) =>
    update((d) => {
      const grp = d.slots[si]!.options[gi]!;
      const nxt = optX(grp[ii]!) >= 3 ? 1 : optX(grp[ii]!) + 1;
      grp[ii] = nxt === 1 ? optId(grp[ii]!) : { id: optId(grp[ii]!), x: nxt };
    });
  const setTarget = (k: keyof DayTargets, v: string) =>
    update((d) => {
      const t: DayTargets = { ...(d.targets ?? {}) };
      if (v.trim() === '') delete t[k];
      else t[k] = Number(v);
      d.targets = t;
    });

  const saveDayNow = () => {
    const slots = cur.slots.map((s) => ({
      ...s,
      options: s.options.filter((g) => g.length).map((g) => g.map((e) => (optX(e) === 1 ? optId(e) : e))),
    }));
    const bad = slots.find((s) => s.options.length === 0);
    if (bad) {
      toast(`${bad.label} has no options — a ${slotWord} needs at least one.`);
      return;
    }
    const body: TemplateDay = {
      slots,
      ...(cur.targets && Object.keys(cur.targets).length ? { targets: cur.targets } : {}),
    };
    saveDay.mutate(
      { id: template.id, day, body },
      {
        onSuccess: () => {
          setDirtyDays((s) => {
            const n = new Set(s);
            n.delete(day);
            return n;
          });
          toast(`Saved day ${day}`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const duplicateNow = () =>
    duplicate.mutate(template.id, {
      onSuccess: (t) => {
        onOpenTemplate(t as PlanTemplate);
        toast('Copied as a draft — this one is yours to edit.');
      },
      onError: (e) => toast((e as Error).message),
    });
  const publishNow = () =>
    publish.mutate(
      { id: template.id, published: !template.published },
      {
        onSuccess: () => {
          toast(template.published ? 'Unpublished — back to draft.' : 'Published.');
          onClose();
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  const deleteNow = () =>
    remove.mutate(template.id, {
      onSuccess: () => {
        toast('Template deleted');
        onClose();
      },
      onError: (e) => toast((e as Error).message),
    });

  const written = Object.values(days).filter((d) => (d?.slots?.length ?? 0) > 0).length;

  /* ---- one slot, read-only (published) or editable (draft) ---- */
  const renderSlot = (slot: TemplateDay['slots'][number], si: number) => {
    if (!editable) {
      return (
        <div className="roslot" key={si}>
          <div className="roslot-h">
            <b>{slot.label}</b>
            {slot.time ? <span className="rotime num">{slot.time}</span> : null}
          </div>
          {slot.options.map((grp, gi) => {
            const sum = groupSum(grp, byId);
            const names = grp.map((e) => itemName(optId(e)) + (optX(e) > 1 ? ` ×${optX(e)}` : '')).join(' + ');
            return (
              <div className="roopt" key={gi}>
                <span>
                  <b>Option {letter(gi)}:</b> {names || '—'}
                  {gi < slot.options.length - 1 ? <i className="roor"> or</i> : null}
                </span>
                {isNutrition && grp.length ? (
                  <small className="num romac">
                    {r1(sum.kcal)} kcal · {r1(sum.protein)} g protein
                  </small>
                ) : null}
              </div>
            );
          })}
          {slot.dose?.note ? <em className="ronote">{String(slot.dose.note)}</em> : null}
        </div>
      );
    }

    return (
      <div className="teditslot" key={si}>
        <div className="row" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
          <input className="input" style={{ fontWeight: 600, flex: 1 }} value={slot.label} onChange={(e) => setLabel(si, e.target.value)} />
          {isNutrition ? (
            <input className="input" style={{ width: 90 }} placeholder="13:00" value={slot.time ?? ''} onChange={(e) => setTime(si, e.target.value)} />
          ) : null}
          <button type="button" className="btn sm ghost" aria-label={`Remove ${slot.label}`} onClick={() => removeSlot(si)}>
            <Icon name="x" />
          </button>
        </div>

        {slot.options.map((grp, gi) => {
          const sum = groupSum(grp, byId);
          return (
            <div className="teditopt" key={gi}>
              <div className="row" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
                <span className="k" style={{ margin: 0 }}>
                  Option {letter(gi)}
                </span>
                {slot.options.length > 1 ? (
                  <button type="button" className="btn sm ghost" aria-label={`Remove option ${letter(gi)}`} onClick={() => removeOption(si, gi)}>
                    <Icon name="minus" />
                  </button>
                ) : null}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s1)', marginTop: 'var(--s1)' }}>
                {grp.length === 0 ? (
                  <small className="sub">No items yet.</small>
                ) : (
                  grp.map((e, ii) => (
                    <span className="chip" key={ii}>
                      {itemName(optId(e))}
                      {isNutrition ? (
                        <button type="button" className="chipx num" aria-label="Portion" onClick={() => cycleX(si, gi, ii)}>
                          ×{optX(e)}
                        </button>
                      ) : optX(e) > 1 ? (
                        <span className="chipx num">×{optX(e)}</span>
                      ) : null}
                      <button type="button" className="chipx" aria-label="Remove item" onClick={() => removeItem(si, gi, ii)}>
                        <Icon name="x" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <select
                className="input sel"
                style={{ marginTop: 'var(--s1)' }}
                value=""
                onChange={(e) => {
                  if (e.target.value) addItem(si, gi, e.target.value);
                }}
              >
                <option value="">Add {isNutrition ? 'food' : 'item'}…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
              {isNutrition && grp.length ? (
                <Audit>
                  Option {letter(gi)} reads <span className="num">{r1(sum.kcal)}</span> kcal ·{' '}
                  <span className="num">{r1(sum.protein)}</span> g protein
                </Audit>
              ) : null}
            </div>
          );
        })}

        <button type="button" className="btn sm ghost" onClick={() => addOption(si)}>
          <Icon name="plus" />
          Add alternative
        </button>

        <label className="teditfield" style={{ marginTop: 'var(--s2)' }}>
          <small>Note</small>
          <input
            className="input"
            placeholder="Only if genuinely hungry · Finish by 7:30 pm"
            value={(slot.dose?.note as string | undefined) ?? ''}
            onChange={(e) => setNote(si, e.target.value)}
          />
        </label>
      </div>
    );
  };

  return (
    <div className="teditpage">
      {/* the bar the demo carries: back, and the state's action */}
      <div className="teditbar">
        <button type="button" className="btn sm ghost" onClick={onClose}>
          <Icon name="chevL" />
          All templates
        </button>
        <span className="grow" />
        {template.published && canManage ? (
          <button type="button" className="btn" disabled={duplicate.isPending} onClick={duplicateNow}>
            <Icon name="clip" />
            Duplicate to edit
          </button>
        ) : null}
        {canManage ? (
          <button type="button" className="btn ghost" disabled={publish.isPending} onClick={publishNow}>
            {template.published ? 'Unpublish' : 'Publish'}
          </button>
        ) : null}
        {editable ? (
          <button type="button" className="btn ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={remove.isPending} onClick={deleteNow}>
            <Icon name="x" />
            Delete
          </button>
        ) : null}
      </div>

      <div className="teditcols">
        {/* LEFT — the template card and the 14-day grid */}
        <div className="teditleft">
          <div className={`card tplcard ${PILLAR_CLASS[template.pillar] ?? ''}`}>
            <div className="h1">{template.name}</div>
            <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
              <Pill kind="neutral">{lib?.name ?? template.pillar}</Pill>
              <Pill kind="neutral">L{template.level}</Pill>
              <Pill kind="neutral">{template.track}</Pill>
              <Pill kind={template.published ? 'ok' : 'warn'}>
                {template.published ? 'Published' : 'Draft'}
              </Pill>
            </div>
            {template.notes ? <p className="sub" style={{ marginTop: 'var(--s2)' }}>{template.notes}</p> : null}
            <Audit>
              By {template.createdBy?.name ?? 'the team'} · {written} of {CYCLE} days written
            </Audit>
            {template.published ? (
              <em className="sub" style={{ display: 'block', marginTop: 'var(--s1)' }}>
                Published templates are read-only — duplicate it to change anything.
              </em>
            ) : null}
            {isNutrition ? (
              <div style={{ marginTop: 'var(--s3)' }}>
                <span className="k">DAILY TARGETS</span>{' '}
                {baseTargets ? (
                  <>
                    <span className="num" style={{ fontWeight: 600 }}>{fmtTargets(baseTargets)}</span>
                    <Audit>from the first day that states them · every later day inherits it</Audit>
                  </>
                ) : (
                  <span className="sub"> Not stated — set them on any day; later days inherit until one does.</span>
                )}
              </div>
            ) : null}
          </div>

          <div className="teditgrid" role="tablist" aria-label="The cycle">
            {Array.from({ length: CYCLE }, (_, i) => i + 1).map((d) => {
              const n = days[String(d)]?.slots?.length ?? 0;
              const on = d === day;
              return (
                <button
                  type="button"
                  key={d}
                  role="tab"
                  aria-selected={on}
                  className={`teditday${on ? ' on' : ''}${n ? ' has' : ''}`}
                  onClick={() => setDay(d)}
                >
                  <b>{d}</b>
                  <small>{n ? `${n} ${n === 1 ? slotWord : `${slotWord}s`}` : '—'}</small>
                  {dirtyDays.has(d) ? <i className="teditdot" aria-label="unsaved" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — the selected day */}
        <div className="teditright card">
          <div className="k">DAY {day}</div>

          {isNutrition && editable ? (
            <>
              <div className="teditrow" style={{ marginTop: 'var(--s2)' }}>
                {TARGET_FIELDS.map(([k, label]) => (
                  <label key={k} className="teditfield">
                    <small>{label}</small>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      value={cur.targets?.[k] ?? ''}
                      onChange={(e) => setTarget(k, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <Audit>Daily targets — set them on any day; later days inherit until one states its own.</Audit>
            </>
          ) : isNutrition && cur.targets && Object.keys(cur.targets).length ? (
            <Audit>Daily targets: {fmtTargets(cur.targets)}</Audit>
          ) : null}

          {cur.slots.length === 0 ? (
            <Empty
              icon="cal"
              sentence="Nothing on this day."
              sub={editable ? `Add the first ${slotWord} below — a blank day is a legitimate answer too.` : 'A blank day is a legitimate answer too.'}
            />
          ) : (
            <div className="list" style={{ marginTop: 'var(--s3)' }}>
              {cur.slots.map(renderSlot)}
            </div>
          )}

          {editable ? (
            <div className="teditadd">
              <label className="field-label" htmlFor="tedit-newlabel">
                Add a {slotWord}
              </label>
              <div className="row" style={{ gap: 'var(--s2)' }}>
                <input
                  className="input"
                  id="tedit-newlabel"
                  list="tedit-names"
                  placeholder={defaults[0] ?? slotWord}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSlot();
                    }
                  }}
                />
                <datalist id="tedit-names">
                  {defaults.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <button type="button" className="btn" onClick={addSlot}>
                  <Icon name="plus" />
                  Add
                </button>
              </div>
            </div>
          ) : null}

          {editable ? (
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
              <button
                type="button"
                className="btn"
                disabled={saveDay.isPending || !dirtyDays.has(day)}
                onClick={saveDayNow}
              >
                Save day {day}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editable ? (
        <Notice>
          A published template cannot be deleted or edited — a client&rsquo;s live plan may already be
          built from it. Publish only when the days are ready.
        </Notice>
      ) : null}
    </div>
  );
}
