'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fmtTime, hmToMin } from '@haalving/shared';

import { Empty, IconTile, Notice, Pill, SkeletonRows, useToast } from '@/components/ui';
import { useCatalog, usePublishTemplate, type CatalogItem } from '@/features/catalog/queries';
import { optId, optX, r1 } from '@/features/catalog/slotMath';
import {
  useApprovePlan,
  useClientPlan,
  type ClientPlan,
  type PlanPillar,
  type PlanSlot,
  type PlanTemplateFull,
} from '@/features/clients/queries';
import { first } from './ScratchPad';

/**
 * `HV.ago` (core.js:3654), as the plan's log lines say it: minutes under an
 * hour, then hours and minutes — "48 h ago", "4 h 20 m ago". The pad's own
 * `ago` speaks in days and would read differently on the same line.
 */
function planAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60 ? `${mins % 60} m ` : ''}ago`;
}
import { CallSheet } from './plan/CallSheet';
import { DaySheet } from './plan/DaySheet';
import { dayKeys, doseOf, effectiveDay, isEdited, nutTargetsFor, slotSum, tplTargetsOn } from './plan/planMath';
import { TEMPLATE_PILLARS, isSessionPillar, letter, specFor } from './plan/spec';
import { DiscardSheet, DoseSheet, SaveTemplateSheet, TargetsSheet, TimeSheet } from './plan/TuneSheets';

/**
 * The Plan tab — the per-pillar plan editor.
 *
 * Ported from the demo's `planHtml` (console-clients.js:1239-1495) and the
 * sheets it opens.
 *
 * THE MODEL IS A TICKET. A template is the master recipe book; calling one for
 * a client writes a TICKET, and the client is served only what the chef has
 * signed. Every edit here — a day, the client's own hour, dose or targets — is
 * staged on that ticket; "Approve — publish" copies it onto the live plan
 * wholesale and "Discard draft" throws it away. THE CONSOLE READS THE TICKET;
 * the client app reads only the live fields. Which of the two the tab draws is
 * decided ON THE SERVER (`view` on every pillar), so this file never has to
 * choose — and cannot choose wrong.
 *
 * WHO MAY TOUCH WHAT IS THE SERVER'S ANSWER, per pillar, on `mayAssign`. Ops
 * assigns and edits every pillar; a pillar coach assigns and edits their own
 * and reads the rest; everyone else — the Doctor, the Super User — reads.
 * Computing that here from the role would be a second copy of the matrix, and
 * the copy that drifts is always the one on the screen.
 */

type SheetKind = 'assign' | 'edit' | 'time' | 'dose' | 'targets' | 'discard' | 'savetpl';

interface Sel {
  cid: string;
  pillar: string | null;
  day: number | null;
}

export function PlanTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, error, refetch } = useClientPlan(clientId);
  const { data: catalog } = useCatalog();
  /* the open pillar and day, kept across re-reads and reset when the client
     changes — a yoga coach opening a client wants yoga, not whatever sorted first */
  const [sel, setSel] = useState<Sel>({ cid: clientId, pillar: null, day: null });
  const [sheet, setSheet] = useState<SheetKind | null>(null);

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

  const cur: Sel = sel.cid === clientId ? sel : { cid: clientId, pillar: null, day: null };
  return (
    <PlanBody
      plan={data}
      catalogLibs={catalog?.libraries ?? []}
      categories={catalog?.categories ?? []}
      sel={cur}
      setSel={setSel}
      sheet={sheet}
      setSheet={setSheet}
    />
  );
}

/* the pillar's colour, on the pillar's own dot and nowhere else */
function PillarDot({ cls, name }: { cls: string; name: string }) {
  return (
    <span className={cls} style={{ display: 'inline-flex', flex: 'none' }} title={name}>
      <span className="pdot" />
    </span>
  );
}

function PlanBody({
  plan,
  catalogLibs,
  categories,
  sel,
  setSel,
  sheet,
  setSheet,
}: {
  plan: ClientPlan;
  catalogLibs: Array<{ key: string; items: CatalogItem[] }>;
  categories: Array<{ key: string; name: string }>;
  sel: Sel;
  setSel: (s: Sel) => void;
  sheet: SheetKind | null;
  setSheet: (s: SheetKind | null) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const approve = useApprovePlan();
  const publishTpl = usePublishTemplate();
  const c = plan;
  const F = first(c.clientName);
  const rows = useMemo(() => new Map(c.pillars.map((p) => [p.pillar, p])), [c.pillars]);

  /* the category's own name, from the one list that holds it — capitalising
     the raw key printed "Athlete" here while the Catalog printed "athlete" */
  const trackWord = (k: string | null | undefined) =>
    categories.find((x) => x.key === k)?.name ?? String(k ?? '');

  /* a pillar with a row — assigned, called, or once assigned */
  const hasRow = (p: PlanPillar | undefined) =>
    !!p && !!(p.live.templateId || p.ticket || p.assignedBy || p.log.length);
  const assigned = TEMPLATE_PILLARS.filter((k) => hasRow(rows.get(k)));
  /* open on the viewer's own pillar if they have one — a lone entry in
     mayAssign is a pillar coach's own aisle; Ops holds all five */
  const own = c.mayAssign.length === 1 ? c.mayAssign[0]! : null;
  const planPillar: string =
    sel.pillar && (TEMPLATE_PILLARS as readonly string[]).includes(sel.pillar)
      ? sel.pillar
      : (own ?? assigned[0] ?? 'culture');

  const sp = specFor(planPillar);
  const a = rows.get(planPillar) ?? null;
  const mayHere = a ? a.mayAssign : c.mayAssign.includes(planPillar);
  const session = isSessionPillar(planPillar);
  /* the console reads the TICKET — the draft when one is open, else the live
     plan; the server made that choice and handed it over as `view` */
  const v = a?.view ?? null;
  const t: PlanTemplateFull | null = v?.templateId ? (c.templates[v.templateId] ?? null) : null;
  const liveT: PlanTemplateFull | null = a?.live.templateId ? (c.templates[a.live.templateId] ?? null) : null;

  const lib = catalogLibs.find((l) => l.key === planPillar);
  const items = useMemo(() => lib?.items ?? [], [lib]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const itemName = (id: string) => byId.get(id)?.name ?? id;

  const chips = (
    <div className="tfil" role="group" aria-label="Pillar">
      {TEMPLATE_PILLARS.map((k) => {
        const on = k === planPillar;
        return (
          <button
            type="button"
            key={k}
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={() => setSel({ cid: c.clientId, pillar: k, day: null })}
          >
            {specFor(k).name}
            {hasRow(rows.get(k)) ? null : (
              <>
                {' '}
                <span className="pdim">—</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  if (!a || !v || !t) {
    return (
      <div className="ccscroll">
        {chips}
        <Empty
          icon="cal"
          sentence={`No ${sp.name} template assigned.`}
          sub={`${sp.name} has nothing on ${F}’s calendar until one lands here.`}
        />
        {mayHere ? (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={() => setSheet('assign')}>
              Call a {sp.name} template
            </button>
          </div>
        ) : (
          <p className="audit" style={{ textAlign: 'center' }}>
            {sp.name} is assigned by its own coach, or by Ops.
          </p>
        )}
        {sheet === 'assign' ? (
          <CallSheet
            plan={c}
            row={a ?? emptyRow(planPillar)}
            trackWord={trackWord}
            onClose={() => setSheet(null)}
            onCalled={() => setSel({ cid: c.clientId, pillar: planPillar, day: null })}
          />
        ) : null}
      </div>
    );
  }

  const nums = dayKeys(t);
  if (!nums.length) {
    return (
      <div className="ccscroll">
        {chips}
        <div className="notice warn">This template has no days.</div>
      </div>
    );
  }
  const planDay: number =
    sel.day && nums.includes(sel.day) ? sel.day : Math.min(c.day || 1, nums[nums.length - 1]!);
  const setDay = (d: number) => setSel({ cid: c.clientId, pillar: planPillar, day: d });

  const day = effectiveDay(v, t, planDay);
  const edits = a.edits;
  const staged = new Set(a.stagedDays);
  const { restDays, reviewDay, meetingDay, cycleDays } = c.shape;
  const isRest = (d: number) => restDays.includes(d);
  const lvl = c.levels[planPillar];

  const head = (
    <div className={`card tplhead ${sp.cls}`}>
      <div className="h1-row">
        <b>{t.name}</b>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <span className={`tshelf ${sp.cls}`}>
            <span className="tsp">{sp.name}</span>
            <span className="tsl">
              L<span className="num">{t.level || 1}</span>
            </span>
            <span className="tst">{trackWord(t.track)}</span>
          </span>
          {a.unpublished ? null : a.modified ? (
            <Pill kind="warn">Modified</Pill>
          ) : (
            <Pill kind="ok">As published</Pill>
          )}
          {a.hasDraft ? (
            <Pill kind="warn">{a.unpublished ? `Draft — ${F} sees nothing yet` : 'Draft — unpublished'}</Pill>
          ) : null}
        </span>
      </div>
      <p className="sub" style={{ margin: 'var(--s1) 0 0' }}>
        {t.desc || ''}
      </p>
      {/* the level the template was written for, against the level this client
          actually stands at — a mismatch is not an error, but it is worth seeing */}
      {Number(t.level) !== Number(lvl || t.level) ? (
        <p className="audit">
          Written for level <span className="num">{t.level || 1}</span>; {F} is at level{' '}
          <span className="num">{lvl || 1}</span> in {sp.name}.
        </p>
      ) : null}
      {edits ? (
        <p className="audit">
          {a.hasDraft ? 'On this draft, ' : `Modified from ${t.name} — `}
          <span className="num">{edits}</span> {edits === 1 ? 'day rides' : 'days ride'} on top of the
          template.
        </p>
      ) : null}
      {a.hasDraft ? <p className="audit">Nothing on this draft reaches {F} until it is approved.</p> : null}
      {/* the demo prints the line from the moment a template is CALLED — the
          row's author is the caller until somebody approves it live */}
      {(a.assignedBy ?? a.ticket?.by) ? (
        <p className="audit">Assigned by {(a.assignedBy ?? a.ticket?.by)!.name}</p>
      ) : null}
      {a.log.map((l, i) => (
        <p className="audit" key={i}>
          {l.act} — {l.by?.name ?? '—'} · <span className="num">{planAgo(l.at)}</span>
        </p>
      ))}
    </div>
  );

  /* The two things a ticket carries that the recipe book cannot: this
     client's own hour for the pillar, and — on Nutrition — the daily targets
     their panel reads. Both stage like any other edit. */
  const tune: ReactNode[] = [];
  if (session) {
    const tmin = hmToMin(v.time);
    tune.push(
      <div className="trow pslot" key="time">
        <IconTile name="clock" className="sm" />
        <span className="grow">
          <b>Session time</b>
          <small>
            {tmin != null
              ? `${F}’s own hour, on every day ${sp.name.toLowerCase()} runs`
              : 'Following the template’s own times'}
          </small>
        </span>
        {tmin != null ? (
          <span className="pill">
            <span className="num">{fmtTime(tmin)}</span>
          </span>
        ) : (
          <Pill kind="neutral">Template</Pill>
        )}
        {a.stagedKeys.includes('time') ? <Pill kind="warn">Staged</Pill> : null}
        {mayHere ? (
          <button type="button" className="btn sm ghost" onClick={() => setSheet('time')}>
            Set
          </button>
        ) : null}
      </div>,
    );
    /* the client's own numbers — sets, reps, a weight — over the plan's. Same
       contract as the hour above: they describe the person, and they beat the
       template's own doses on every day until cleared. */
    const dstg = (v.dose ?? {}) as Record<string, unknown>;
    const dbits = sp.fields
      .filter((f) => dstg[f.k] !== undefined && dstg[f.k] !== '')
      .map((f) => (
        <span className="pill" key={f.k}>
          <span className="num">{String(dstg[f.k])}</span>
          {f.k === 'rpe'
            ? ' RPE'
            : f.k === 'count'
              ? ' rounds'
              : f.k === 'mins'
                ? ' min'
                : f.kind === 'num'
                  ? ` ${f.t.toLowerCase()}`
                  : ''}
        </span>
      ));
    tune.push(
      <div className="trow pslot" key="dose">
        <IconTile name="gauge" className="sm" />
        <span className="grow">
          <b>Session dose</b>
          <small>{dbits.length ? `${F}’s own numbers, over the plan’s` : 'Following the plan’s own doses'}</small>
        </span>
        {dbits.length ? dbits : <Pill kind="neutral">Template</Pill>}
        {a.stagedKeys.includes('dose') ? <Pill kind="warn">Staged</Pill> : null}
        {mayHere ? (
          <button type="button" className="btn sm ghost" onClick={() => setSheet('dose')}>
            Set
          </button>
        ) : null}
      </div>,
    );
    /* the door into the room, on the day being looked at. When there is no
       booking on this day, nothing renders: a Join that opens nowhere is a
       broken promise. */
    const bk = a.bookings[String(planDay)];
    if (bk) {
      const nowD = new Date();
      const nowM = nowD.getHours() * 60 + nowD.getMinutes();
      const liveNow = planDay === c.day && nowM >= bk.startMin - 10 && nowM < bk.startMin + bk.durMin;
      tune.push(
        <div className="trow pslot" key="room">
          <IconTile name="video" className="sm" />
          <span className="grow">
            <b>Session room</b>
            <small>
              <span className="num">{fmtTime(bk.startMin)}</span>
              {bk.coach ? ` · with ${first(bk.coach.name)}` : ''}
              {liveNow ? ' · open now' : ' · opens ten minutes before'}
            </small>
          </span>
          {liveNow && bk.joinable && bk.link ? (
            <a className="btn sm" href={bk.link} target="_blank" rel="noopener noreferrer">
              Join
            </a>
          ) : (
            <Pill kind="neutral">Not open</Pill>
          )}
        </div>,
      );
    }
  }
  if (planPillar === 'culture') {
    const stg = v.targets ?? {};
    const tplT = tplTargetsOn(t, planDay, cycleDays) ?? {};
    const res = nutTargetsFor(a.live, liveT, planDay, cycleDays);
    const show = (k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre') =>
      stg[k] || tplT[k] || res?.[k] || '—';
    const srcWord = stg.kcal
      ? `Set for ${F}, over the template`
      : tplT.kcal
        ? `From ${t.name} — day ${planDay}’s reading`
        : 'Derived from energy — nobody has stated these yet';
    tune.push(
      <div className="trow pslot" key="targets">
        <IconTile name="target" className="sm" />
        <span className="grow">
          <b>Daily targets</b>
          <small>{srcWord}</small>
        </span>
        <span className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="pill">
            <span className="num">{show('kcal')}</span> kcal
          </span>
          <span className="pill">
            <span className="num">{show('protein')}</span> g protein
          </span>
          <span className="pill">
            <span className="num">{show('carbs')}</span> g carbs
          </span>
          <span className="pill">
            <span className="num">{show('fat')}</span> g fat
          </span>
          <span className="pill">
            <span className="num">{show('fibre')}</span> g fibre
          </span>
        </span>
        {a.stagedKeys.includes('targets') ? <Pill kind="warn">Staged</Pill> : null}
        {mayHere ? (
          <button type="button" className="btn sm ghost" onClick={() => setSheet('targets')}>
            Set
          </button>
        ) : null}
      </div>,
    );
  }

  const grid = (
    <div className={`pdays ${sp.cls}`} role="group" aria-label="Days">
      {nums.map((d) => {
        const ed = isEdited(v, d);
        const st = staged.has(d);
        const n = (effectiveDay(v, t, d)?.slots ?? []).length;
        const mark = isRest(d) ? 'Rest' : d === reviewDay ? 'Review' : d === meetingDay ? 'Meeting' : '';
        const word = sp.slotWord.toLowerCase();
        return (
          <button
            type="button"
            key={d}
            className={`pday${d === planDay ? ' on' : ''}${n ? ' has' : ''}`}
            {...(d === planDay ? { 'aria-current': 'true' as const } : {})}
            aria-label={`Day ${d}${mark ? ` · ${mark}` : ''} · ${
              n ? `${n} ${word}${n > 1 ? 's' : ''}` : 'nothing'
            }${ed ? ' · edited' : ''}${st ? ' · staged' : ''}`}
            {...(d === (c.day || 0) ? { 'data-today': '1' } : {})}
            onClick={() => setDay(d)}
          >
            <span className="d num">{d}</span>
            <span className="m">
              {n ? (
                <>
                  <span className="num">{n}</span> {word}
                  {n > 1 ? 's' : ''}
                </>
              ) : (
                mark || '—'
              )}
            </span>
            {st ? <span className="e stg">Staged</span> : ed ? <span className="e">Edited</span> : null}
          </button>
        );
      })}
    </div>
  );

  const marks = (
    <>
      {isRest(planDay) ? <Pill kind="neutral">Active rest</Pill> : null}
      {planDay === reviewDay ? <Pill kind="info">Day-{reviewDay} review</Pill> : null}
      {planDay === meetingDay ? <Pill kind="info">Team meeting</Pill> : null}
      {planDay === (c.day || 0) ? <Pill kind="info">Today</Pill> : null}
      {staged.has(planDay) ? (
        <Pill kind="warn">Staged</Pill>
      ) : isEdited(v, planDay) ? (
        <Pill kind="warn">Edited</Pill>
      ) : null}
    </>
  );

  /* the AND/OR line, the plan's whole grammar in one sentence */
  const optionsLine = (slot: PlanSlot) =>
    (slot.options ?? []).map((grp, i) => (
      <Fragment key={i}>
        {i > 0 ? (
          <>
            {' '}
            <span className="cwor">or</span>{' '}
          </>
        ) : null}
        {slot.options.length > 1 ? <b>Option {letter(i)}:</b> : null}
        {slot.options.length > 1 ? ' ' : ''}
        {grp.map((e, j) => {
          const x = optX(e);
          return (
            <Fragment key={j}>
              {j > 0 ? ' + ' : ''}
              {itemName(optId(e))}
              {x > 1 ? (
                <>
                  {' '}
                  <span className="num">×{x}</span>
                </>
              ) : null}
            </Fragment>
          );
        })}
      </Fragment>
    ));

  /* one slot on the Plan tab, in its pillar's own language — the same reading
     the template editor gives, so a coach sees the identical thing in both.
     The console reads the TICKET, so the dose rows show the staged per-client
     numbers the client will get on approval. */
  const slotRow = (slot: PlanSlot, i: number) => {
    const note = doseOf(slot, 'note', byId, v);
    let dose: ReactNode = null;
    if (sp.sums) {
      const n = slotSum(slot, byId);
      if (n.kcal) {
        dose = (
          <span
            className="tdose"
            title={`${r1(n.kcal)} kcal · ${r1(n.protein)} g protein · ${r1(n.carbs)} g carbs · ${r1(n.fat)} g fat · ${r1(n.fibre)} g fibre`}
          >
            <span className="num">{r1(n.kcal)}</span> kcal
            {n.protein ? (
              <>
                {' '}
                · <span className="num">{r1(n.protein)}</span> g
              </>
            ) : null}
          </span>
        );
      }
    } else {
      const bits: ReactNode[] = [];
      const sets = doseOf(slot, 'sets', byId, v);
      const reps = doseOf(slot, 'reps', byId, v);
      if (sets && reps)
        bits.push(
          <Fragment key="sr">
            <span className="num">{String(sets)}</span>×<span className="num">{String(reps)}</span>
          </Fragment>,
        );
      const count = doseOf(slot, 'count', byId, v);
      if (count)
        bits.push(
          <Fragment key="count">
            <span className="num">{String(count)}</span> rounds
          </Fragment>,
        );
      const weight = doseOf(slot, 'weight', byId, v);
      if (weight) bits.push(<Fragment key="weight">{String(weight)}</Fragment>);
      const mins = doseOf(slot, 'mins', byId, v);
      if (mins)
        bits.push(
          <Fragment key="mins">
            <span className="num">{String(mins)}</span> min
          </Fragment>,
        );
      const rpe = doseOf(slot, 'rpe', byId, v);
      if (rpe)
        bits.push(
          <Fragment key="rpe">
            RPE <span className="num">{String(rpe)}</span>
          </Fragment>,
        );
      const focus = doseOf(slot, 'focus', byId, v);
      if (focus) bits.push(<Fragment key="focus">{String(focus)}</Fragment>);
      if (bits.length)
        dose = (
          <span className="tdose">
            {bits.map((b, j) => (
              <Fragment key={j}>
                {j > 0 ? ' · ' : ''}
                {b}
              </Fragment>
            ))}
          </span>
        );
    }
    return (
      <div className="trow pslot" key={i}>
        <PillarDot cls={sp.cls} name={sp.name} />
        <span className="grow">
          <b>{slot.label || sp.slotWord}</b>
          <small>{optionsLine(slot)}</small>
          {note ? <small className="audit">{String(note)}</small> : null}
        </span>
        {dose}
        {sp.time && slot.time ? (
          <span className="pill neutral">
            <span className="num">{slot.time}</span>
          </span>
        ) : null}
      </div>
    );
  };

  const dayBody =
    day && (day.slots ?? []).length ? (
      <div className="list">{day.slots.map(slotRow)}</div>
    ) : (
      <Empty
        icon="cal"
        sentence={`${sp.name} does not run on day ${planDay}.`}
        {...(mayHere ? { sub: 'Open the day to put something on it.' } : {})}
      />
    );

  const approveNow = () =>
    approve.mutate(
      { clientId: c.clientId, pillar: planPillar },
      {
        onSuccess: () => toast(`Approved — ${F} sees this plan now.`),
        onError: (e) => toast((e as Error).message),
      },
    );

  const acts = (
    <>
      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
        {mayHere ? (
          <button type="button" className="btn sm" onClick={() => setSheet('edit')}>
            Edit day <span className="num">{planDay}</span>
          </button>
        ) : null}
        {mayHere && a.hasDraft ? (
          <>
            <button type="button" className="btn sm" disabled={approve.isPending} onClick={approveNow}>
              Approve — publish to {F}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setSheet('discard')}>
              Discard draft
            </button>
          </>
        ) : null}
        {mayHere && a.modified && c.canSaveTemplate ? (
          <button type="button" className="btn sm ghost" onClick={() => setSheet('savetpl')}>
            Save as new template
          </button>
        ) : null}
        {mayHere ? (
          <button type="button" className="btn sm ghost" onClick={() => setSheet('assign')}>
            {a.hasDraft ? 'Call another' : 'Reassign'}
          </button>
        ) : null}
      </div>
      {mayHere ? null : (
        <p className="audit">Read-only for your role — {sp.name} is edited by its own coach and Ops.</p>
      )}
    </>
  );

  /* templates saved out of THIS client's plan, offered their sign-off button */
  const derived = c.derived.filter((dt) => dt.pillar === planPillar);
  const derivedHtml = derived.length ? (
    <>
      <div className="sec-title">Saved from this plan</div>
      <div className="list">
        {derived.map((dt) => {
          const inflight = dt.approval?.status === 'SUBMITTED';
          const pill = dt.published ? (
            <Pill kind="ok">Published</Pill>
          ) : inflight ? (
            <Pill kind="info">With {dt.approval?.waitingOnTitle ?? 'the chain'}</Pill>
          ) : (
            <Pill kind="neutral">Draft</Pill>
          );
          const can = mayHere && !dt.published && !inflight;
          return (
            <div className="trow pslot" key={dt.id}>
              <IconTile name="bookmark" className="sm" />
              <span className="grow">
                <b>{dt.name}</b>
                <small>{dt.desc || ''}</small>
              </span>
              {pill}
              {can ? (
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={publishTpl.isPending}
                  onClick={() =>
                    publishTpl.mutate(
                      { id: dt.id, published: true },
                      {
                        onSuccess: (r) => {
                          /* the derived list is the plan read's, not the catalog's */
                          void qc.invalidateQueries({ queryKey: ['clients', c.clientId, 'plan'] });
                          toast(
                            `Sent up the chain — ${r.template?.approval?.waitingOnTitle ?? r.approval?.waitingOnTitle ?? 'the Operations Head'} signs next.`,
                          );
                        },
                        onError: (e) => toast((e as Error).message),
                      },
                    )
                  }
                >
                  Submit for approval
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div className="ccscroll">
      {chips}
      {head}
      {tune.length ? <div className="list">{tune}</div> : null}
      {grid}
      <div className="h1-row">
        <div className="sec-title" style={{ margin: 0 }}>
          Day <span className="num">{planDay}</span>
        </div>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          {marks}
        </span>
      </div>
      {dayBody}
      {acts}
      {derivedHtml}

      {sheet === 'assign' ? (
        <CallSheet
          plan={c}
          row={a}
          trackWord={trackWord}
          onClose={() => setSheet(null)}
          onCalled={() => setSel({ cid: c.clientId, pillar: planPillar, day: null })}
        />
      ) : null}
      {sheet === 'edit' && mayHere ? (
        <DaySheet plan={c} row={a} template={t} day={planDay} items={items} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'time' ? <TimeSheet plan={c} row={a} onClose={() => setSheet(null)} /> : null}
      {sheet === 'dose' ? <DoseSheet plan={c} row={a} onClose={() => setSheet(null)} /> : null}
      {sheet === 'targets' ? (
        <TargetsSheet plan={c} row={a} liveTemplate={liveT} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'discard' ? <DiscardSheet plan={c} row={a} onClose={() => setSheet(null)} /> : null}
      {sheet === 'savetpl' ? <SaveTemplateSheet plan={c} row={a} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

/**
 * A pillar the server sent no row for — the Call sheet still needs a row shape
 * to read its view from. Every field empty, nothing staged, nothing live.
 */
function emptyRow(pillar: string): PlanPillar {
  const sp = specFor(pillar);
  const view = { templateId: null, template: null, overrides: {}, time: null, dose: null, targets: null };
  return {
    pillar,
    name: sp.name,
    cls: sp.cls,
    mayAssign: true,
    live: view,
    ticket: null,
    view,
    hasDraft: false,
    unpublished: false,
    modified: false,
    edits: 0,
    stagedDays: [],
    stagedKeys: [],
    assignedBy: null,
    assignedAt: null,
    log: [],
    bookings: {},
  };
}
