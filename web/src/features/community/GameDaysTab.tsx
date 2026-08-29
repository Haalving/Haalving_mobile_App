'use client';

import { useState } from 'react';

import { Audit, Empty, IconTile, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { linesToArr } from './lines';
import {
  useCommunityMeta,
  useDeleteGameDay,
  useGameDays,
  useSaveGameDay,
  type GameDay,
} from './queries';

/**
 * Game days — the Health Games book, five questions to a day.
 *
 * Ported from console-community.js:312-416.
 *
 * `ans` IS ZERO-BASED ON THE WIRE and the label says so out loud, because a
 * one-off here does not break anything visibly — it silently marks the wrong
 * option correct, and nobody finds out until a client is told they were wrong.
 * The server refuses `ans >= opts.length`; the save button refuses it too, so the
 * operator learns before the round trip rather than after it.
 */

interface QDraft {
  q: string;
  opts: string;
  ans: string;
  why: string;
  /** How many clients have already answered. Member state — carried, never sent. */
  answers?: number;
}

interface Draft {
  label: string;
  date: string;
  qs: QDraft[];
}

const BLANK_Q: QDraft = { q: '', opts: '', ans: '0', why: '' };

function draftOf(d: GameDay): Draft {
  return {
    label: d.label,
    date: d.date,
    qs: d.qs.map((q) => ({
      q: q.q,
      opts: (q.opts ?? []).join('\n'),
      ans: String(q.ans ?? 0),
      why: q.why ?? '',
      ...(q.answers !== undefined ? { answers: q.answers } : {}),
    })),
  };
}

/** A question is publishable when it has text, two options, and an in-range answer. */
function questionReady(q: QDraft): boolean {
  const opts = linesToArr(q.opts);
  const ans = Number(q.ans);
  return q.q.trim().length > 0 && opts.length >= 2 && Number.isInteger(ans) && ans >= 0 && ans < opts.length;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </>
  );
}

function QuestionBlock({
  q,
  i,
  onChange,
  onRemove,
}: {
  q: QDraft;
  i: number;
  onChange: (next: QDraft) => void;
  onRemove: () => void;
}) {
  const opts = linesToArr(q.opts);
  const ans = Number(q.ans);
  const outOfRange = opts.length > 0 && (!Number.isInteger(ans) || ans < 0 || ans >= opts.length);

  return (
    <div className="card" style={{ marginTop: 'var(--s2)' }}>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <div className="sec-title grow" style={{ marginTop: 0 }}>
          Question <Num>{i + 1}</Num>
        </div>
        {q.answers ? (
          <Pill kind="neutral">
            <Num>{q.answers}</Num> answered
          </Pill>
        ) : null}
        <button
          type="button"
          className="btn sm ghost"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={onRemove}
        >
          <Icon name="x" />
          Remove
        </button>
      </div>

      <Field id={`qq-${i}`} label="Question">
        <textarea
          className="input"
          id={`qq-${i}`}
          rows={2}
          value={q.q}
          onChange={(e) => onChange({ ...q, q: e.target.value })}
        />
      </Field>
      <Field id={`qo-${i}`} label="Options — one per line">
        <textarea
          className="input"
          id={`qo-${i}`}
          rows={3}
          value={q.opts}
          placeholder="One option per line"
          onChange={(e) => onChange({ ...q, opts: e.target.value })}
        />
      </Field>
      <Field id={`qa-${i}`} label="Correct option — 0 is the first line">
        <input
          className="input num"
          id={`qa-${i}`}
          type="number"
          min={0}
          value={q.ans}
          onChange={(e) => onChange({ ...q, ans: e.target.value })}
        />
      </Field>
      {/* the answer named back in words, so a zero-based index is checkable at a
          glance rather than counted on fingers */}
      {opts.length ? (
        outOfRange ? (
          <Notice kind="bad">
            There {opts.length === 1 ? 'is' : 'are'} only <Num>{opts.length}</Num> options — the
            correct one has to be between <Num>0</Num> and <Num>{opts.length - 1}</Num>.
          </Notice>
        ) : (
          <Audit>Correct answer: “{opts[ans]}”</Audit>
        )
      ) : null}
      <Field id={`qw-${i}`} label="Why">
        <textarea
          className="input"
          id={`qw-${i}`}
          rows={2}
          value={q.why}
          onChange={(e) => onChange({ ...q, why: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function GameDaysTab() {
  const { data, isLoading } = useGameDays();
  const { data: meta } = useCommunityMeta();
  const save = useSaveGameDay();
  const remove = useDeleteGameDay();
  const toast = useToast();

  const [editing, setEditing] = useState<GameDay | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>({ label: '', date: '', qs: [] });
  const [deleting, setDeleting] = useState<GameDay | null>(null);

  const canManage = !!meta?.canManage;
  const canDelete = !!meta?.canDelete;

  const openNew = () => {
    setDraft({ label: '', date: '', qs: [{ ...BLANK_Q }] });
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (d: GameDay) => {
    setDraft(draftOf(d));
    setAdding(false);
    setEditing(d);
  };
  const closeSheet = () => {
    setAdding(false);
    setEditing(null);
  };

  const filled = draft.qs.filter((q) => q.q.trim());
  const allValid = filled.length > 0 && filled.every(questionReady);
  const canSave = draft.label.trim().length > 0 && allValid;

  const submit = () => {
    if (!draft.label.trim()) {
      toast('Give the day a label first.');
      return;
    }
    save.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        body: {
          label: draft.label.trim(),
          date: draft.date.trim(),
          /* unfilled stubs are dropped rather than sent — the demo does the same,
             so half-typed sixth question does not fail the whole save */
          qs: filled.map((q) => ({
            q: q.q.trim(),
            opts: linesToArr(q.opts),
            ans: Number(q.ans) || 0,
            why: q.why.trim(),
          })),
        },
      },
      {
        onSuccess: () => {
          closeSheet();
          toast(editing ? `Saved — ${draft.label.trim()}` : `Added — ${draft.label.trim()}`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const open = adding || !!editing;

  return (
    <>
      {canManage ? (
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            Add game day
          </button>
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={5} height={64} /> : null}

      {data && !data.length ? (
        <Empty icon="bulb" sentence="No game days yet. Add one to start the daily Health Games book." />
      ) : null}

      {data && data.length ? (
        <div className="list">
          {data.map((d) => (
            <div className="trow" key={d.id}>
              <IconTile name="bulb" />
              <div className="grow">
                <b>{d.label}</b>
                <small>{d.date}</small>
              </div>
              <Pill kind="neutral">
                <Num>{d.answered}</Num> of <Num>{d.qs.length}</Num> answered
              </Pill>
              {canManage ? (
                <button type="button" className="btn sm ghost" onClick={() => openEdit(d)}>
                  <Icon name="pencil" />
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setDeleting(d)}
                >
                  <Icon name="x" />
                  Delete
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Sheet open={open} onClose={closeSheet} label={editing ? 'Edit game day' : 'Add game day'}>
        <div className="h1">{editing ? 'Edit game day' : 'Add game day'}</div>

        <Field id="qd-label" label="Label">
          <input
            className="input"
            id="qd-label"
            value={draft.label}
            placeholder="e.g. Mon"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </Field>
        <Field id="qd-date" label="Date">
          <input
            className="input"
            id="qd-date"
            value={draft.date}
            placeholder="e.g. 3 Aug"
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          />
        </Field>

        <div className="sec-title">Questions</div>
        {draft.qs.map((q, i) => (
          <QuestionBlock
            key={i}
            q={q}
            i={i}
            onChange={(next) =>
              setDraft((d) => ({ ...d, qs: d.qs.map((x, j) => (j === i ? next : x)) }))
            }
            onRemove={() => setDraft((d) => ({ ...d, qs: d.qs.filter((_x, j) => j !== i) }))}
          />
        ))}
        <button
          type="button"
          className="btn sm ghost"
          style={{ marginTop: 'var(--s2)' }}
          onClick={() => setDraft((d) => ({ ...d, qs: [...d.qs, { ...BLANK_Q }] }))}
        >
          <Icon name="plus" />
          Add question
        </button>

        <Audit>
          The Health Games book runs on five questions a day — add five so the star row fills
          correctly. Whether a client has already answered a question is member state and is never
          changed here.
        </Audit>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!canSave || save.isPending} onClick={submit}>
            {editing ? 'Save' : 'Add game day'}
          </button>
        </div>
      </Sheet>

      <Sheet open={!!deleting} onClose={() => setDeleting(null)} label="Delete game day">
        <div className="h1">Delete “{deleting?.label}”?</div>
        <Notice kind="bad">
          {deleting?.answers ? (
            <>
              Clients have already given <Num>{deleting.answers}</Num> answers on this day. Deleting
              it takes those with it and cannot be undone.
            </>
          ) : (
            <>This removes the day and its questions from the Health Games book. It cannot be undone.</>
          )}
        </Notice>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: 'var(--danger-fill)' }}
            disabled={remove.isPending}
            onClick={() =>
              deleting &&
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  toast('Game day deleted');
                },
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Delete game day
          </button>
        </div>
      </Sheet>
    </>
  );
}
