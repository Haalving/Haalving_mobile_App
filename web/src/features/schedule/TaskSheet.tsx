'use client';

import { useEffect, useRef, useState } from 'react';
import {
  KINDS,
  KIND_KEYS,
  RECUR,
  RECUR_LABEL,
  clashWords,
  fmtShortTime,
  type RecurFreq,
  type TaskKind,
} from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Notice, Sheet, useToast } from '@/components/ui';
import type { ClientListItem } from '@/features/clients/queries';
import {
  DURATIONS,
  TIME_CHOICES,
  dayChoices,
  dayLabel,
  durationLabel,
  firstName,
} from '@/features/schedule/days';
import {
  useCreateTask,
  useDryRunTask,
  useEditTask,
  useMoveTask,
  type Occurrence,
  type SchedGroup,
  type SchedStaff,
  type Scope,
  type TaskInput,
} from '@/features/schedule/queries';

/**
 * New task / Edit task — ported from `openTaskSheet` (console-schedule.js:1129-1377),
 * field by field and in its order.
 *
 * THE CLASH LINE COMES FROM THE SERVER. `POST /schedule/tasks?dryRun=1` runs the
 * very code the save runs and stops one step short of writing, so the sentence a
 * coach reads while typing and the sentence that refuses them on submit are the
 * same string built by the same `clashWords`. A second copy of the rule in the
 * browser is exactly the thing this arrangement exists to prevent.
 *
 * IT ONLY RUNS FOR A NEW TASK. The dry run cannot be told to ignore a task id, so
 * an edit asking it would be told it clashes with itself; an edit's refusal
 * arrives from the PATCH, which does exclude the task being changed.
 *
 * THREE FIELDS OF THE DEMO'S ARE NOT HERE, all for the same reason — there is
 * nothing on this side to write them to: the "require a session report" tick
 * (`reportRequired` has no column), the client's own clock under the time fields
 * (the client LIST carries no timezone), and the "outside declared availability"
 * warning. The third is not a loss: declared hours are a hard refusal in this
 * port, so the clash line already says it, in the server's words.
 */

export interface TaskSheetProps {
  /** The occurrence being edited, or null for a new task. */
  occ: Occurrence | null;
  /** A slot drawn on empty grid, or the day the toolbar was looking at. */
  prefill?: { date: string; startMin?: number; durMin?: number; assigneeIds?: string[] };
  today: string;
  staff: SchedStaff[];
  /** The clients this reader may put on a task — their pod, or all of them. */
  bookableClientIds: string[];
  groups: SchedGroup[];
  clients: ClientListItem[];
  onClose: () => void;
}

export function TaskSheet({ occ, prefill, today, staff, bookableClientIds, groups, clients, onClose }: TaskSheetProps) {
  const isNew = !occ;
  const toast = useToast();

  const create = useCreateTask();
  const edit = useEditTask();
  const move = useMoveTask();
  const dry = useDryRunTask();

  const [title, setTitle] = useState(occ?.title ?? '');
  const [kind, setKind] = useState<TaskKind>(occ?.kind ?? 'internal');
  const [clientId, setClientId] = useState(occ?.clientId ?? '');
  const [date, setDate] = useState(occ?.date ?? prefill?.date ?? today);
  const [startMin, setStartMin] = useState(occ?.startMin ?? prefill?.startMin ?? 10 * 60);
  const [durMin, setDurMin] = useState(occ?.durMin ?? prefill?.durMin ?? 30);
  const [link, setLink] = useState(occ?.link ?? '');
  const [notes, setNotes] = useState(occ?.notes ?? '');
  const [assignees, setAssignees] = useState<string[]>(
    occ ? occ.assigneeIds : (prefill?.assigneeIds ?? []),
  );
  const [groupIds, setGroupIds] = useState<string[]>(occ?.groups ?? []);
  /*
   * TWO FIELDS THE GRID'S READ DOES NOT CARRY: which rhythm a repeating task
   * keeps, and whether it may overlap. The occurrence says `recurring` as a
   * yes/no and says nothing at all about overlap.
   *
   * So neither control STATES a value it does not know. The rhythm picker gains
   * a leading "Keep how it repeats", and the overlap tick starts indeterminate —
   * both mean "unchanged unless you touch me", and both are left out of the body
   * until touched. Painting an unticked box over a task that allows overlap
   * would be a lie the author could act on: they would see it off, want it off,
   * and change nothing.
   *
   * A task that does NOT repeat is a different case — `recurring: false` is a
   * fact, so its picker opens on "Does not repeat" and speaks plainly.
   */
  const rhythmUnknown = !!occ?.recurring;
  const [recurFreq, setRecurFreq] = useState<RecurFreq | ''>(rhythmUnknown ? '' : 'none');
  const [allowOverlap, setAllowOverlap] = useState<boolean | null>(isNew ? false : null);

  /* the demo's default is "Only this occurrence" — the cautious half of the
     question, because a series edit reaches days nobody is looking at */
  const [scope, setScope] = useState<Scope>(occ?.recurring ? 'occurrence' : 'series');

  const [clash, setClash] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
   * `indeterminate` is a DOM property with no HTML attribute and no React prop,
   * so it can only be set on the node. It is what draws the third state the
   * checkbox above genuinely has: not off, not on, not yet said.
   */
  const overlapBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (overlapBox.current) overlapBox.current.indeterminate = allowOverlap === null;
  }, [allowOverlap]);

  /* occurrence edits cannot change the rhythm — only the series can */
  const showRecur = scope === 'series';
  const enough = title.trim().length >= 2 && (assignees.length > 0 || groupIds.length > 0);

  /* the create body. A new task always knows both of its own answers, so the two
     "unchanged" readings above cannot reach it. */
  const body = (): TaskInput => ({
    title: title.trim(),
    kind,
    clientId: clientId || null,
    date,
    startMin,
    durMin,
    recurFreq: recurFreq || 'none',
    assigneeIds: assignees,
    groupIds,
    link: link.trim() || null,
    notes: notes.trim() || null,
    allowOverlap: allowOverlap === true,
  });

  /*
   * The live clash line, debounced.
   *
   * `seq` is what keeps a slow answer from overwriting a fast one: two dry runs
   * in flight settle in whatever order the network chooses, and without this the
   * line under the fields could be the answer to the question before last.
   *
   * The title is deliberately NOT a trigger — the demo re-runs its hints on the
   * slot and the people only, and typing a name cannot change who is busy. It
   * still travels in the body, because the schema wants one.
   */
  const seq = useRef(0);
  useEffect(() => {
    if (!isNew) return;
    if (!enough) {
      setClash(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      dry
        .mutateAsync(body())
        .then((r) => {
          if (mine !== seq.current) return;
          if (r.ok) {
            setClash(null);
            return;
          }
          const busy = r.conflicts.some((c) => c.type === 'busy');
          setClash(
            `${clashWords(r.conflicts)}${
              busy
                ? ' — tick “Allow this task to overlap” below, or pick another time.'
                : ' — pick a time inside their working week.'
            }`,
          );
        })
        .catch(() => {
          /* the dry run is a courtesy; a failed one must never block the save,
             which asks the same question for real */
          if (mine === seq.current) setClash(null);
        });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, enough, date, startMin, durMin, clientId, kind, recurFreq, assignees, groupIds, allowOverlap]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  /* ---------------------------------------------------------------- save */

  const fail = (e: unknown) => setRefusal((e as Error).message);
  const done = (message: string) => {
    onClose();
    toast(message);
  };

  const submit = () => {
    setRefusal(null);
    if (!title.trim()) {
      toast('Give the task a name first.');
      return;
    }
    if (!assignees.length && !groupIds.length) {
      toast('Add at least one person or group.');
      return;
    }

    if (isNew) {
      create.mutate(body(), {
        onSuccess: () => done('On the calendar. Everyone attached can see it now.'),
        onError: fail,
      });
      return;
    }

    const task = occ as Occurrence;
    const fields = {
      title: title.trim(),
      startMin,
      durMin,
      link: link.trim() || null,
      notes: notes.trim() || null,
    };

    if (scope === 'occurrence') {
      if (date === task.date) {
        edit.mutate(
          { id: task.taskId, scope: 'occurrence', occurrenceDate: task.date, ...fields },
          {
            onSuccess: () => done('Changed this occurrence only — the series is untouched.'),
            onError: fail,
          },
        );
        return;
      }
      /*
       * A moved occurrence DETACHES into its own task, and that is `move`'s job —
       * the PATCH's occurrence branch writes an exception against a date and has
       * no way to put one on a different day. So the move goes first, because it
       * is the half that can be refused, and the freshly detached task then takes
       * the rest of the edit as a series of one.
       */
      move.mutate(
        {
          id: task.taskId,
          fromDate: task.date,
          toDate: date,
          startMin,
          durMin,
          scope: 'occurrence',
        },
        {
          onSuccess: (r) =>
            edit.mutate(
              { id: r.id, scope: 'series', ...fields },
              {
                onSuccess: () => done('Moved that one day out on its own; the series is untouched.'),
                onError: fail,
              },
            ),
          onError: fail,
        },
      );
      return;
    }

    edit.mutate(
      {
        id: task.taskId,
        scope: 'series',
        kind,
        clientId: clientId || null,
        assigneeIds: assignees,
        groupIds,
        ...(recurFreq ? { recurFreq } : {}),
        ...(allowOverlap === null ? {} : { allowOverlap }),
        /* only when the author actually moved it: an untouched Day field must
           not re-anchor a series whose first occurrence is behind us */
        ...(date !== task.date ? { date } : {}),
        ...fields,
      },
      {
        onSuccess: () => done(task.recurring ? 'Series updated.' : 'Saved.'),
        onError: fail,
      },
    );
  };

  const pending = create.isPending || edit.isPending || move.isPending;

  /* ------------------------------------------------------------- drawing */

  return (
    <Sheet open onClose={onClose} label={isNew ? 'New task' : 'Edit task'}>
      <div className="h1">{isNew ? 'New task' : 'Edit task'}</div>

      {!isNew && occ.recurring ? (
        <div className="vtog" role="group" aria-label="Apply to">
          <button
            type="button"
            className={scope === 'occurrence' ? 'on' : ''}
            aria-pressed={scope === 'occurrence'}
            onClick={() => setScope('occurrence')}
          >
            Only this occurrence
          </button>
          <button
            type="button"
            className={scope === 'series' ? 'on' : ''}
            aria-pressed={scope === 'series'}
            onClick={() => setScope('series')}
          >
            Whole series
          </button>
        </div>
      ) : null}

      <label className="field-label" htmlFor="tf-title">
        Title
      </label>
      <input
        className="input"
        id="tf-title"
        value={title}
        placeholder="What happens?"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="grid2">
        <span>
          <label className="field-label" htmlFor="tf-kind">
            Kind
          </label>
          <select
            className="input"
            id="tf-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as TaskKind)}
          >
            {KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {KINDS[k].name}
              </option>
            ))}
          </select>
        </span>
        <span>
          <label className="field-label" htmlFor="tf-client">
            Client (optional)
          </label>
          <select
            className="input"
            id="tf-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">—</option>
            {/* THE PICKER AND THE RULE ARE THE SAME ANSWER. The server refuses a client
                off your pod and a colleague you may not book; offering them here would
                make the sheet a list of things that fail on submit. */}
            {clients.filter((c) => bookableClientIds.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="grid3 tight">
        <span>
          <label className="field-label" htmlFor="tf-day">
            Day
          </label>
          <select
            className="input"
            id="tf-day"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          >
            {dayChoices(today).map((d) => (
              <option key={d} value={d}>
                {dayLabel(d, today)}
              </option>
            ))}
          </select>
        </span>
        <span>
          <label className="field-label" htmlFor="tf-start">
            Starts
          </label>
          <select
            className="input"
            id="tf-start"
            value={startMin}
            onChange={(e) => setStartMin(Number(e.target.value))}
          >
            {TIME_CHOICES.map((m) => (
              <option key={m} value={m}>
                {fmtShortTime(m)}
              </option>
            ))}
          </select>
        </span>
        <span>
          <label className="field-label" htmlFor="tf-dur">
            Length
          </label>
          <select
            className="input"
            id="tf-dur"
            value={durMin}
            onChange={(e) => setDurMin(Number(e.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d)}
              </option>
            ))}
          </select>
        </span>
      </div>

      {showRecur ? (
        <span>
          <label className="field-label" htmlFor="tf-recur">
            Repeats
          </label>
          <select
            className="input"
            id="tf-recur"
            value={recurFreq}
            onChange={(e) => setRecurFreq(e.target.value as RecurFreq | '')}
          >
            {rhythmUnknown ? <option value="">Keep how it repeats</option> : null}
            {RECUR.map((f) => (
              <option key={f} value={f}>
                {RECUR_LABEL[f]}
              </option>
            ))}
          </select>
        </span>
      ) : null}

      <label className="field-label" id="tf-people-l">
        People — individuals
      </label>
      <div id="tf-people" role="group" aria-labelledby="tf-people-l">
        {staff.filter((u) => u.bookable).map((u) => {
          const on = assignees.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`chip${on ? ' sel' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(assignees, setAssignees, u.id)}
            >
              <Avatar name={u.name} className="sm" /> {firstName(u.name)}
            </button>
          );
        })}
      </div>

      <label className="field-label" id="tf-groups-l">
        People — groups
      </label>
      <div id="tf-groups" role="group" aria-labelledby="tf-groups-l">
        {groups.filter((g) => g.bookable !== false).map((g) => {
          const on = groupIds.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className={`chip${on ? ' sel' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(groupIds, setGroupIds, g.id)}
            >
              <Icon name="users" /> {g.name}
            </button>
          );
        })}
      </div>

      <label className="field-label" htmlFor="tf-link">
        Meeting link
      </label>
      <input
        className="input"
        id="tf-link"
        value={link}
        placeholder="https://meet.google.com/…"
        inputMode="url"
        onChange={(e) => setLink(e.target.value)}
      />

      <label className="field-label" htmlFor="tf-notes">
        Notes
      </label>
      <textarea
        className="input"
        id="tf-notes"
        rows={2}
        value={notes}
        placeholder="Agenda, SOP step, anything the team should read first…"
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* consent to overlap is given BEFORE saving, so there is no "warn, then
          offer a parallel box" afterthought — a clash the author has not already
          permitted is simply refused */}
      <label className="row sch3-noov">
        <input
          ref={overlapBox}
          type="checkbox"
          checked={allowOverlap === true}
          onChange={(e) => setAllowOverlap(e.target.checked)}
        />{' '}
        Allow this task to overlap another — they run both, in their own order
      </label>

      {/* a refusal already arrived in the server's own words ("Blocked — …"), so
          it is printed whole; the live line is a fragment and takes the demo's
          label */}
      {refusal ? (
        <Notice kind="bad">{refusal}</Notice>
      ) : clash ? (
        <Notice kind="bad">
          <b>Blocked:</b> {clash}
        </Notice>
      ) : null}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={pending} onClick={submit}>
          {isNew ? 'Add to calendar' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}
