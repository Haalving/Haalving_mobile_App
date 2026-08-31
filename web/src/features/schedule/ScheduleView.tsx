'use client';

import { useEffect, useState } from 'react';
import {
  KINDS,
  KIND_KEYS,
  RESP,
  addDays,
  dayName,
  fmtShortTime,
  todayISO,
  type RespState,
} from '@haalving/shared';

import { Notice, SkeletonRows, useToast } from '@/components/ui';
import { useSession } from '@/store/session.store';
import { useClients } from '@/features/clients/queries';
import { DailyRhythm } from '@/features/schedule/DailyRhythm';
import { DeleteSheet } from '@/features/schedule/DeleteSheet';
import { DetailSheet } from '@/features/schedule/DetailSheet';
import { Grid } from '@/features/schedule/Grid';
import { LensLegend, LensSheet } from '@/features/schedule/Lens';
import { ProposeSheet } from '@/features/schedule/ProposeSheet';
import { ScopeSheet } from '@/features/schedule/ScopeSheet';
import { TaskSheet } from '@/features/schedule/TaskSheet';
import { Toolbar, type ViewMode } from '@/features/schedule/Toolbar';
import { visibleDays } from '@/features/schedule/days';
import {
  useDeleteTask,
  useGroups,
  useMoveTask,
  usePropose,
  useRespond,
  useSchedule,
  useSetTaskDone,
  type Occurrence,
  type Scope,
} from '@/features/schedule/queries';

/**
 * The Schedule — the whole screen, and the one place its decisions are made.
 *
 * The pieces below it are drawings: the toolbar, the rhythm bar, the grid and
 * the sheets each render what they are handed and report a gesture back. Every
 * write, every "which scope?" and every refusal sentence passes through here, so
 * there is exactly one account of what a drag means and what happens when the
 * server says no.
 *
 * THE LENS DRAWN IS THE LENS THE SERVER APPLIED, not the one asked for. A coach
 * without the allocate permission is narrowed to themselves in `lensFor`, and
 * reading their own empty request back would have the toolbar say "Everyone"
 * over a grid holding one person's week.
 *
 * A REFUSAL SNAPS BACK BY DOING NOTHING. No drag is applied optimistically, so a
 * 409 leaves the tile where it already was and the only thing left to do is say
 * the server's sentence, verbatim.
 */

/** The demo's own line under the grid — what the gestures are, and what refuses. */
const AUDIT_LINE =
  'Drag a tile to move it, its lower edge to stretch it, empty grid to create. ' +
  'A clash is refused: nobody holds two things at once unless the task is ticked to allow it. ' +
  'Hatching is time outside the declared working week — a booking there is refused too.';

interface Prefill {
  date: string;
  startMin?: number;
  durMin?: number;
  assigneeIds?: string[];
}

export function ScheduleView() {
  const me = useSession((s) => s.user);
  const toast = useToast();

  const today = todayISO();
  const [anchor, setAnchor] = useState(today);
  const [asked, setAsked] = useState<ViewMode | null>(null);
  const [lens, setLens] = useState<string[]>([]);
  const [client, setClient] = useState('');

  /*
   * The viewport decides the view until somebody says otherwise — `resolveMode`
   * (console-schedule.js:539-542).
   *
   * Read at first render rather than in an effect: this tree only ever renders on
   * the client (the console shell draws nothing until `/me` has settled), so
   * there is no server pass to disagree with, and reading it late would fetch a
   * week on a phone and then immediately throw it away for a day.
   */
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 860,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const mode: ViewMode = asked ?? (narrow ? 'day' : 'week');
  const days = visibleDays(anchor, mode);
  const from = days[0] as string;
  const to = days[days.length - 1] as string;

  const schedule = useSchedule({ from, to }, lens, client);
  const groups = useGroups();
  const clients = useClients();

  const move = useMoveTask();
  const remove = useDeleteTask();
  const setDone = useSetTaskDone();
  const respond = useRespond();
  const propose = usePropose();

  /* one sheet at a time, and each mounted only while it is open */
  const [detail, setDetail] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [creating, setCreating] = useState<Prefill | null>(null);
  const [proposing, setProposing] = useState<Occurrence | null>(null);
  const [deleting, setDeleting] = useState<Occurrence | null>(null);
  const [lensOpen, setLensOpen] = useState(false);
  const [scopeAsk, setScopeAsk] = useState<{ title: string; run: (scope: Scope) => void } | null>(
    null,
  );

  const data = schedule.data;
  const clientNames = new Map((clients.data ?? []).map((c) => [c.id, c.name]));
  const groupNames = new Map((groups.data ?? []).map((g) => [g.id, g.name]));

  /* the server's sentence, whatever it is — never a summary of it */
  const refused = (e: unknown) => toast((e as Error).message);

  /**
   * A repeating task is asked BEFORE the write; a one-off simply happens.
   *
   * `occurrence` still travels for a task that does not repeat, and means
   * nothing there: with no series to choose between, `move` updates the row
   * whatever the scope says. Asking anyway would be a dialog with one answer.
   */
  const withScope = (occ: Occurrence, run: (scope: Scope) => void) => {
    if (!occ.recurring) {
      run('occurrence');
      return;
    }
    setScopeAsk({ title: occ.title, run });
  };

  const applyTimeChange = (occ: Occurrence, startMin: number, durMin: number) =>
    withScope(occ, (scope) =>
      move.mutate(
        { id: occ.taskId, fromDate: occ.date, toDate: occ.date, startMin, durMin, scope },
        {
          onSuccess: () =>
            toast(
              scope === 'occurrence' && occ.recurring
                ? `This occurrence now runs ${fmtShortTime(startMin)}–${fmtShortTime(startMin + durMin)}.`
                : `Rescheduled to ${fmtShortTime(startMin)}–${fmtShortTime(startMin + durMin)}.`,
            ),
          onError: refused,
        },
      ),
    );

  const applyMove = (occ: Occurrence, toDate: string, startMin: number) =>
    withScope(occ, (scope) =>
      move.mutate(
        { id: occ.taskId, fromDate: occ.date, toDate, startMin, durMin: occ.durMin, scope },
        {
          onSuccess: () =>
            toast(
              `${scope === 'occurrence' && occ.recurring ? 'Moved this occurrence to ' : 'Moved to '}` +
                `${dayName(toDate)} ${fmtShortTime(startMin)}.`,
            ),
          onError: refused,
        },
      ),
    );

  const toggleDone = (occ: Occurrence) =>
    setDone.mutate(
      { id: occ.taskId, date: occ.date, done: !occ.done },
      { onError: refused },
    );

  const openNew = (prefill: Prefill) => {
    setDetail(null);
    setCreating({
      /* an allocator books for anybody, so their sheet starts empty; everybody
         else can only book what they are on, so theirs starts with them */
      assigneeIds: data?.canWiden ? [] : me ? [me.id] : [],
      ...prefill,
    });
  };

  if (schedule.isLoading) return <SkeletonRows rows={5} height={72} />;
  if (schedule.isError) {
    return <Notice kind="bad">{(schedule.error as Error).message}</Notice>;
  }
  if (!data) return null;

  return (
    <>
      <Toolbar
        days={days}
        mode={mode}
        lens={data.lens}
        staff={data.staff}
        canWiden={data.canWiden}
        clients={clients.data ?? []}
        client={client}
        onToday={() => setAnchor(today)}
        onStep={(delta) => setAnchor(addDays(anchor, mode === 'day' ? delta : delta * 7))}
        onOpenLens={() => setLensOpen(true)}
        onClient={setClient}
        onMode={(next) => {
          if (next === mode) return;
          /* keep the eye where it was: week to day lands on today when today is
             in view, otherwise on the week's first day */
          setAnchor(next === 'day' ? (days.includes(today) ? today : from) : today);
          setAsked(next);
        }}
        onNew={() => openNew({ date: mode === 'day' ? anchor : today })}
      />

      <LensLegend
        lens={data.lens}
        byId={new Map(data.staff.map((u) => [u.id, u]))}
        onDrop={(id) => setLens(data.lens.filter((x) => x !== id))}
        onClear={() => setLens([])}
      />

      <DailyRhythm
        dailies={data.dailies}
        days={days}
        lens={data.lens}
        staff={data.staff}
        onOpen={setDetail}
        onToggleDone={toggleDone}
      />

      <Grid
        data={data}
        days={days}
        view={mode}
        today={today}
        clientNames={clientNames}
        onOpen={setDetail}
        onTimeChange={applyTimeChange}
        onMove={applyMove}
        onCreate={openNew}
        onGoDay={(date) => {
          setAsked('day');
          setAnchor(date);
        }}
      />

      <div className="schbar wrap" style={{ marginTop: 'calc(var(--s2) * -1)' }}>
        <span className="klegend">
          {KIND_KEYS.map((k) => (
            <span className={`kl ${KINDS[k].cls}`} key={k}>
              <i />
              {KINDS[k].name}
            </span>
          ))}
        </span>
      </div>

      <p className="audit" style={{ margin: 0 }}>
        {AUDIT_LINE}
      </p>

      {lensOpen ? (
        <LensSheet
          staff={data.staff}
          lens={data.lens}
          onClose={() => setLensOpen(false)}
          onCommit={(ids) => {
            setLens(ids);
            setLensOpen(false);
          }}
        />
      ) : null}

      {detail ? (
        <DetailSheet
          occ={detail}
          today={today}
          meId={me?.id ?? null}
          byId={new Map(data.staff.map((u) => [u.id, u]))}
          groupNames={groupNames}
          clientName={detail.clientId ? (clientNames.get(detail.clientId) ?? null) : null}
          onClose={() => setDetail(null)}
          onRespond={(state: RespState) =>
            respond.mutate(
              { id: detail.taskId, state },
              {
                onSuccess: () => {
                  setDetail(null);
                  toast(`Your response is in: ${RESP[state].label}.`);
                },
                onError: refused,
              },
            )
          }
          onPropose={() => {
            setDetail(null);
            setProposing(detail);
          }}
          onToggleDone={() => {
            setDetail(null);
            toggleDone(detail);
          }}
          onEdit={() => {
            setDetail(null);
            setEditing(detail);
          }}
          onDelete={() => {
            setDetail(null);
            /* a one-off has no second reading of "delete", so the demo removes it
               without a dialog and so does this */
            if (detail.recurring) {
              setDeleting(detail);
              return;
            }
            remove.mutate(
              { id: detail.taskId, scope: 'series' },
              { onSuccess: () => toast('Task deleted.'), onError: refused },
            );
          }}
        />
      ) : null}

      {editing || creating ? (
        <TaskSheet
          occ={editing}
          {...(creating ? { prefill: creating } : {})}
          today={today}
          staff={data.staff}
          bookableClientIds={data.bookableClientIds}
          groups={groups.data ?? []}
          clients={clients.data ?? []}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
        />
      ) : null}

      {proposing ? (
        <ProposeSheet
          occ={proposing}
          today={today}
          onClose={() => setProposing(null)}
          onSend={(date, startMin) =>
            propose.mutate(
              { id: proposing.taskId, date, startMin, durMin: proposing.durMin },
              {
                onSuccess: () => {
                  setProposing(null);
                  toast('Proposal sent — the owner can apply it from the task.');
                },
                onError: refused,
              },
            )
          }
        />
      ) : null}

      {deleting ? (
        <DeleteSheet
          occ={deleting}
          onClose={() => setDeleting(null)}
          onChoose={(scope) => {
            const occ = deleting;
            setDeleting(null);
            remove.mutate(
              { id: occ.taskId, scope, ...(scope === 'occurrence' ? { date: occ.date } : {}) },
              {
                onSuccess: () =>
                  toast(
                    scope === 'occurrence'
                      ? 'That occurrence is gone; the series continues.'
                      : 'Series deleted.',
                  ),
                onError: refused,
              },
            );
          }}
        />
      ) : null}

      {scopeAsk ? (
        <ScopeSheet
          title={scopeAsk.title}
          onClose={() => setScopeAsk(null)}
          onChoose={(scope) => {
            const { run } = scopeAsk;
            setScopeAsk(null);
            run(scope);
          }}
        />
      ) : null}
    </>
  );
}
