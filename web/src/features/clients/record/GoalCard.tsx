'use client';

import { Fragment, useEffect, useState } from 'react';

import { Audit, Notice, Pill, SecTitle, Sheet, useToast, type PillKind } from '@/components/ui';
import { useSetGoal, type ClientDetail, type GoalLedgerRow } from '@/features/clients/queries';
import { useSession } from '@/store/session.store';

/**
 * THE GOAL CARD — console-clients.js `goalCard`, plus the editor the demo
 * never had.
 *
 * The demo typed every ledger into its seed; a real client starts with none,
 * so this card is also where the ledger gets written. Two seats write it, by
 * the flow's own steps: the Operations Head (with the Haalving Coach and the
 * Super Admin) sets the goal and its per-level targets at Day-1 goal setting;
 * a coach seated on the pod records ONE level's result and verdict at the
 * review. The server enforces that split — the card only offers each person
 * the door that is theirs, so nobody is shown a button that would refuse them.
 */

const LEDGER_STATE: Record<GoalLedgerRow['state'], [string, PillKind]> = {
  ok: ['Achieved', 'ok'],
  cur: ['In play', 'info'],
  todo: ['Ahead', 'neutral'],
  miss: ['Missed', 'bad'],
};

const STATE_OPTIONS: Array<[GoalLedgerRow['state'], string]> = [
  ['todo', 'Ahead'],
  ['cur', 'In play'],
  ['ok', 'Achieved'],
  ['miss', 'Missed'],
];

/* the same two seat lists the server holds in client.service.setGoal */
const SETTERS = new Set(['admin', 'opsmgr', 'opshead']);
const RESULT_WRITERS = new Set(['doctor', 'dietitian', 'fitness', 'yoga', 'mind']);

/** Seven levels, the programme's own count — the app's level-up card holds at L7 too. */
const LEVELS = 7;

export function GoalCard({ c }: { c: ClientDetail }) {
  const role = useSession((s) => s.user?.role ?? '');
  const meId = useSession((s) => s.user?.id ?? null);

  const ledger = c.goalLedger ?? [];
  const setter = SETTERS.has(role);
  const seated = RESULT_WRITERS.has(role) && c.pod.some((s) => s.staffId != null && s.staffId === meId);
  const mode: 'set' | 'result' | null = setter ? 'set' : seated && ledger.length ? 'result' : null;
  const [open, setOpen] = useState(false);

  if (!c.goal && !c.purpose && !ledger.length && !mode) return null;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <SecTitle>Goal</SecTitle>
        {mode ? (
          <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>
            {mode === 'set' ? (ledger.length ? 'Edit goal' : 'Set goal') : 'Record result'}
          </button>
        ) : null}
      </div>

      {c.goal ? (
        <p style={{ margin: 'var(--s1) 0 0' }}>
          <b>{c.goal}</b>
        </p>
      ) : null}
      {c.purpose ? (
        <p className="sub" style={{ margin: 'var(--s1) 0 0' }}>
          “{c.purpose}”
        </p>
      ) : null}

      {ledger.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="c360-ledger">
            <thead>
              <tr>
                <th>Level</th>
                <th>Target</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ledger.map((g) => {
                const st = LEDGER_STATE[g.state];
                const word = st ? st[0] : g.state;
                const kind: PillKind = st ? st[1] : 'neutral';
                return (
                  <tr key={g.level}>
                    <td className="num">L{g.level}</td>
                    <td>{g.target || '—'}</td>
                    <td className="num">{g.result || '—'}</td>
                    <td>
                      <Pill kind={kind}>{word}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : mode === 'set' ? (
        <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
          No goal by level yet. Day-1 goal setting divides the goal across the seven levels.
        </p>
      ) : null}

      <Audit>The ledger moves only at the Day-{c.reviewDay} review — one level, one verdict.</Audit>

      {mode ? <GoalSheet c={c} mode={mode} open={open} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

type Draft = { level: number; target: string; result: string; state: GoalLedgerRow['state'] };

/** One row per level, whether or not the ledger has it yet. */
function draftOf(ledger: GoalLedgerRow[]): Draft[] {
  const by = new Map(ledger.map((r) => [r.level, r]));
  return Array.from({ length: LEVELS }, (_, i) => {
    const r = by.get(i + 1);
    return { level: i + 1, target: r?.target ?? '', result: r?.result ?? '', state: r?.state ?? 'todo' };
  });
}

function GoalSheet({
  c,
  mode,
  open,
  onClose,
}: {
  c: ClientDetail;
  /** `set` writes the goal and every target; `result` writes results and verdicts only. */
  mode: 'set' | 'result';
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSetGoal(c.id);

  const [goal, setGoal] = useState('');
  const [purpose, setPurpose] = useState('');
  const [rows, setRows] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* the draft is taken from the record each time the sheet opens, so a save
     made elsewhere is what the next edit starts from */
  useEffect(() => {
    if (!open) return;
    setGoal(c.goal ?? '');
    setPurpose(c.purpose ?? '');
    setRows(draftOf(c.goalLedger ?? []));
    setError(null);
  }, [open, c.goal, c.purpose, c.goalLedger]);

  /* a coach sees only the levels that have a target — there is nothing to
     record against a level nobody has set */
  const stored = new Set((c.goalLedger ?? []).map((r) => r.level));
  const shown = mode === 'set' ? rows : rows.filter((r) => stored.has(r.level));

  const patch = (level: number, part: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.level === level ? { ...r, ...part } : r)));

  const confirm = () => {
    setError(null);
    const ledger = shown
      .filter((r) => r.target.trim())
      .map((r) => ({ level: r.level, target: r.target.trim(), result: r.result.trim() || null, state: r.state }));
    if (mode === 'set' && !goal.trim() && !ledger.length) {
      setError('Write the goal, or at least one level’s target.');
      return;
    }
    save.mutate(
      mode === 'set' ? { goal: goal.trim() || null, purpose: purpose.trim() || null, ledger } : { ledger },
      {
        onSuccess: () => {
          toast(mode === 'set' ? 'Goal saved.' : 'Result recorded.');
          onClose();
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label={mode === 'set' ? 'Set the goal by level' : 'Record a level result'}>
      <div className="h1">{mode === 'set' ? 'Goal by level' : 'Record the result'}</div>
      <p className="sub">
        {mode === 'set'
          ? `${c.name}’s goal, divided across the seven levels — each level carries its share.`
          : 'The targets stay as they were set on Day 1. Write what came of the level under review, and its verdict.'}
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      {mode === 'set' ? (
        <>
          <label className="field-label" htmlFor="goal-text">
            Goal
          </label>
          <input
            className="input"
            id="goal-text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="In the client’s own words"
            maxLength={400}
          />
          <label className="field-label" htmlFor="goal-why">
            Why it matters to them
          </label>
          <input
            className="input"
            id="goal-why"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="What the goal is for"
            maxLength={400}
          />
        </>
      ) : null}

      <div className="goal-edit">
        <div className="k">Level</div>
        <div className="k">Target</div>
        <div className="k">Result</div>
        <div className="k">Verdict</div>
        {shown.map((r) => (
          <Fragment key={r.level}>
            <div className="num">L{r.level}</div>
            <input
              className="input"
              aria-label={`Level ${r.level} target`}
              value={r.target}
              disabled={mode === 'result'}
              onChange={(e) => patch(r.level, { target: e.target.value })}
              placeholder="This level’s share"
              maxLength={80}
            />
            <input
              className="input"
              aria-label={`Level ${r.level} result`}
              value={r.result}
              onChange={(e) => patch(r.level, { result: e.target.value })}
              placeholder="—"
              maxLength={80}
            />
            <select
              className="input"
              aria-label={`Level ${r.level} verdict`}
              value={r.state}
              onChange={(e) => patch(r.level, { state: e.target.value as GoalLedgerRow['state'] })}
            >
              {STATE_OPTIONS.map(([v, w]) => (
                <option key={v} value={v}>
                  {w}
                </option>
              ))}
            </select>
          </Fragment>
        ))}
      </div>

      <Audit>
        {mode === 'set'
          ? 'A level left without a target is not written. The save goes on the record’s log.'
          : 'A coach changes results and verdicts only — a target that moved is refused.'}
      </Audit>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" disabled={save.isPending} onClick={confirm}>
          {mode === 'set' ? 'Save goal' : 'Record'}
        </button>
      </div>
    </Sheet>
  );
}
