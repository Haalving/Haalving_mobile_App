'use client';

import { useState } from 'react';

import { Audit, Empty, IconTile, Notice, Num, Pill, SecTitle, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useSession } from '@/store/session.store';
import { useStaff } from '@/features/community/queries';
import { NoticesSection } from '@/features/queues/NoticesSection';
import { useCan } from '@/lib/can';
import {
  useCreateWork,
  useMarkWorkDone,
  useWorklist,
  type WorklistRow,
} from '@/features/queues/queries';
import { clock, localISO, whenLabel } from '@/features/queues/when';

/**
 * The work list — every line a rule put on somebody's desk.
 *
 * Ported from console-ops.js `renderWorkTab` + `workFilterHtml`.
 *
 * THE FILTERS ARE SENT TO THE SERVER, not applied to a list already in the
 * browser. The demo filters an array it holds; here the same chip row becomes a
 * query, so the rows a caller may not see are never sent in the first place. The
 * owner select is the one filter the server may ignore — it is only honoured for
 * somebody who can see everybody's work, and for anybody else the honest answer
 * is still their own rows.
 *
 * DONE ROWS SINK, they do not vanish. A row that disappeared the instant it was
 * ticked would give no way to notice you had ticked the wrong one.
 */

/* Creatable here (slotless desk work). A MEETING is booked on the Schedule, so it
   is shown and filterable below but never offered as an Add-task kind. */
const TYPE_LABELS: Record<string, string> = {
  TASK: 'Task',
  RATING: 'Rating',
  REVIEW: 'Review',
  REPORT: 'Session report',
};

/** Everything the board can DISPLAY/filter — the creatable kinds plus meetings. */
const DISPLAY_TYPE_LABELS: Record<string, string> = { ...TYPE_LABELS, MEETING: 'Meeting' };

const PILLARS: Record<string, string> = {
  fitness: 'Fitness',
  culture: 'Food Culture',
  yoga: 'Yoga',
  wellness: 'Wellness',
};

const STATUS_OPTS = [
  { v: 'OPEN', t: 'Open' },
  { v: 'DONE', t: 'Done' },
];
const PILLAR_OPTS = [{ v: '', t: 'All pillars' }, ...Object.entries(PILLARS).map(([v, t]) => ({ v, t }))];
const TYPE_OPTS = [
  { v: '', t: 'All types' },
  ...Object.entries(DISPLAY_TYPE_LABELS).map(([v, t]) => ({ v, t })),
];

/** One `.tfil` row per dimension — the chosen option wears the filled pill. */
function FilterRow({
  label,
  opts,
  current,
  onPick,
}: {
  label: string;
  opts: Array<{ v: string; t: string }>;
  current: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="tfil" role="group" aria-label={label}>
      {opts.map((o) => {
        const on = o.v === current;
        return (
          <button
            type="button"
            key={o.v || 'all'}
            className={on ? 'on' : ''}
            {...(on ? { 'aria-current': 'true' as const } : {})}
            onClick={() => onPick(o.v)}
          >
            {o.t}
          </button>
        );
      })}
    </div>
  );
}

function Row({ w, onDone, busy }: { w: WorklistRow; onDone: () => void; busy: boolean }) {
  const done = w.status === 'DONE';
  const dated = w.date != null;
  const meeting = w.type === 'MEETING';
  return (
    <div className="trow" style={done ? { opacity: 0.55 } : undefined}>
      <div className="grow" style={done ? { textDecoration: 'line-through' } : undefined}>
        {w.text}
        <small>
          {w.owner?.name ?? '—'}
          {w.client ? ` · ${w.client.name}` : ''}
          {meeting ? ' · Meeting' : ''}
          {dated && w.durMin ? ` · ${w.durMin} min` : ''}
        </small>
      </div>
      {done ? (
        <Pill kind="ok">Done</Pill>
      ) : (
        <span className={`pill ${w.pill}`}>
          <Num>{whenLabel(w)}</Num>
        </span>
      )}
      {/* a meeting offers its room as well as its tick — you join it, then you
          close it, and both belong on the row you are looking at */}
      {!done && meeting && w.link ? (
        <a className="btn sm quiet" href={w.link} target="_blank" rel="noreferrer">
          Join
        </a>
      ) : null}
      {/* EVERY open row can be ticked off, booked or not. A booked one closes its
          own occurrence — the same record the Schedule writes — so the two screens
          agree instead of one of them being the only door. */}
      {!done ? (
        <button type="button" className="btn sm quiet" disabled={busy} onClick={onDone}>
          Done
        </button>
      ) : null}
    </div>
  );
}

/**
 * Put a line of work on a desk.
 *
 * THE OWNER DEFAULTS TO YOU, because that is the common case and it needs no
 * permission — giving yourself work grants nothing. Choosing somebody else is
 * offered only to a caller who can already see everybody's queue, which is the
 * same rule the server enforces: you should not be able to fill a list you
 * cannot read.
 *
 * There is no time field here ON PURPOSE. This board is the slotless half of the
 * task table — work with a deadline and no hour booked for it. Giving a task a
 * time is a calendar act, and the Schedule's own sheet is where that happens.
 */
function AddWorkSheet({
  open,
  onClose,
  seeAll,
}: {
  open: boolean;
  onClose: () => void;
  seeAll: boolean;
}) {
  const meId = useSession((st) => st.user?.id ?? null);
  const meName = useSession((st) => st.user?.name ?? 'me');
  const create = useCreateWork();
  const toast = useToast();
  const { data: staff } = useStaff(seeAll && open);

  const [text, setText] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [type, setType] = useState('TASK');
  const [due, setDue] = useState('today');
  const [pill, setPill] = useState('info');

  const owner = ownerId || meId || '';

  const submit = () => {
    const t = text.trim();
    if (!t) {
      toast('Say what needs doing.');
      return;
    }
    if (!owner) {
      toast('Choose who it is for.');
      return;
    }
    create.mutate(
      { text: t, ownerId: owner, type, due: due.trim() || 'today', pill },
      {
        onSuccess: () => {
          setText('');
          setOwnerId('');
          setDue('today');
          setPill('info');
          setType('TASK');
          onClose();
          toast(owner === meId ? 'Added to your list.' : 'Added to their list.');
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="Add a task">
      <div className="h1">Add a task</div>

      <label className="field-label" htmlFor="wl-text">
        What needs doing
      </label>
      <textarea
        className="input"
        id="wl-text"
        rows={2}
        value={text}
        placeholder="e.g. Call Meena I. — no logs for 48 hours"
        onChange={(e) => setText(e.target.value)}
      />

      <label className="field-label" htmlFor="wl-owner">
        Whose list
      </label>
      {seeAll ? (
        <select
          className="input"
          id="wl-owner"
          value={owner}
          onChange={(e) => setOwnerId(e.target.value)}
        >
          <option value={meId ?? ''}>{meName} (you)</option>
          {(staff ?? [])
            .filter((u) => u.id !== meId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.roleTitle}
              </option>
            ))}
        </select>
      ) : (
        <>
          <input className="input" id="wl-owner" value={`${meName} (you)`} readOnly />
          <Audit>
            Putting work on somebody else&rsquo;s list needs the permission that lets you see it.
          </Audit>
        </>
      )}

      <label className="field-label" htmlFor="wl-type">
        Kind
      </label>
      <select className="input" id="wl-type" value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(TYPE_LABELS).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="wl-due">
        Due — in your own words
      </label>
      <input
        className="input"
        id="wl-due"
        value={due}
        placeholder="today · 13:00 · before Friday"
        onChange={(e) => setDue(e.target.value)}
      />

      <label className="field-label" htmlFor="wl-pill">
        How urgent
      </label>
      <select className="input" id="wl-pill" value={pill} onChange={(e) => setPill(e.target.value)}>
        <option value="info">Ordinary</option>
        <option value="warn">Needs attention</option>
        <option value="bad">Late or urgent</option>
      </select>

      <Notice>
        This lands on the Work Queue, not the Schedule — it has a deadline, not an hour. Book time
        for it on the Schedule instead.
      </Notice>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={create.isPending} onClick={submit}>
          Add task
        </button>
      </div>
    </Sheet>
  );
}

export function WorklistBoard() {
  const seeAll = useCan('seeAllClients');
  const toast = useToast();

  const [status, setStatus] = useState('OPEN');
  const [pillar, setPillar] = useState('');
  const [type, setType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useWorklist({ status, pillar, type, ownerId });
  const done = useMarkWorkDone();

  /* HAPPENING NOW — a meeting live within the ten minutes before it starts until
     it ends. The queue is where a coach stands between jobs, so it is also the
     door into a room that is open right now. (Demo: console-ops.js liveNowHtml.) */
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = localISO(now);
  const liveNow = (data ?? []).filter(
    (w) =>
      w.type === 'MEETING' &&
      w.date === today &&
      w.startMin != null &&
      nowMin >= w.startMin - 10 &&
      nowMin < w.startMin + (w.durMin ?? 0),
  );

  /* the owner select's options are the people who actually own rows here — the
     demo lists every staff member, but a name that can only ever return an empty
     list is a filter that lies about what it will do */
  const owners = new Map<string, string>();
  for (const w of data ?? []) if (w.owner) owners.set(w.owner.id, w.owner.name);

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add task
        </button>
      </div>

      <AddWorkSheet open={adding} onClose={() => setAdding(false)} seeAll={seeAll} />

      {/* the board, top to bottom: what is live now, the filtered task list, then
          the notices (the demo put notices second — console-ops.js `mountWork` —
          which buried the work under a column nobody acts on). */}
      {liveNow.length ? (
        <section style={{ marginBottom: 'var(--s4)' }}>
          <SecTitle>Happening now</SecTitle>
          <div className="list">
            {liveNow.map((w) => (
              <div key={w.id} className="trow">
                <IconTile name="video" />
                <span className="grow">
                  <b>{w.text}</b>
                  <small>
                    {w.client ? `${w.client.name} · ` : ''}
                    <Num>{clock(w.startMin)}</Num>–<Num>{clock((w.startMin ?? 0) + (w.durMin ?? 0))}</Num>
                  </small>
                </span>
                {w.link ? (
                  <a className="btn sm" href={w.link} target="_blank" rel="noreferrer">
                    Join
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
        <FilterRow label="Status" opts={STATUS_OPTS} current={status} onPick={setStatus} />
        <FilterRow label="Pillar" opts={PILLAR_OPTS} current={pillar} onPick={setPillar} />
        <FilterRow label="Type" opts={TYPE_OPTS} current={type} onPick={setType} />
        {seeAll ? (
          <select
            className="input sel"
            aria-label="Owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Everyone</option>
            {[...owners].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {isLoading ? <SkeletonRows rows={5} height={64} /> : null}

      {data && !data.length ? (
        <Empty
          icon="leaf"
          sentence={
            status === 'OPEN' && !pillar && !type && !ownerId
              ? 'No tasks for you right now — the rules are quiet.'
              : 'No tasks match these filters.'
          }
        />
      ) : null}

      {data && data.length ? (
        <>
          <div className="list">
            {/* open first, done sunk — a stable sort, so rule order survives inside each half */}
            {[...data]
              .sort((a, b) => (a.status === 'DONE' ? 1 : 0) - (b.status === 'DONE' ? 1 : 0))
              .map((w) => (
                <Row
                  key={w.id}
                  w={w}
                  busy={done.isPending}
                  onDone={() =>
                    done.mutate(w.id, {
                      onSuccess: () => toast('Closed.'),
                      onError: (e) => toast((e as Error).message),
                    })
                  }
                />
              ))}
          </div>
          <Audit>Every task traces to its generating rule.</Audit>
        </>
      ) : null}

      {/* NOTICES SIT UNDER THE WORK. They are what the sweeps have already said,
          not a thing to do — above the list they pushed the first task off the
          screen and made a read-only column the first thing a shift saw. */}
      <NoticesSection />
    </>
  );
}
