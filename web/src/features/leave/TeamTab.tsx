'use client';

import { useState } from 'react';
import { LEAVE_STATUS_LABEL, fmtShortTime, leaveStatusTone } from '@haalving/shared';

import { Avatar, Empty, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { useBoard, usePlanCover, useTeamLeave } from '@/features/leave/queries';

/**
 * Team — the cover board.
 *
 * Ported from `teamHtml` / `planSheet` (console-leave.js:490-691).
 *
 * THE BOARD PLANS BOTH HALVES AT ONCE. Seats alone leave the appointments naming
 * a coach who is away; sessions alone leave the clients riding on nobody. So
 * `Send for approval` stays disabled until every riding client and every booked
 * session has a name against it — the same completeness the server refuses
 * without.
 */

export function TeamTab() {
  const { data, isLoading } = useTeamLeave(true);
  const [planning, setPlanning] = useState<string | null>(null);
  const board = useBoard(planning);
  const plan = usePlanCover();
  const toast = useToast();

  /* one select per riding client and per booked session, keyed the way the body
     will be built */
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<Record<string, string>>({});

  if (isLoading) return <SkeletonRows rows={3} height={110} />;
  if (!data) return null;

  const b = board.data;
  const sessionKey = (taskId: string, date: string) => `${taskId}|${date}`;

  const complete =
    !!b &&
    b.riding.every((r) => seats[r.clientId]) &&
    b.sessions.every((s) => sessions[sessionKey(s.taskId, s.date)]);

  const send = () => {
    if (!b || !planning) return;
    plan.mutate(
      {
        id: planning,
        reallocations: b.riding.map((r) => ({ clientId: r.clientId, toId: seats[r.clientId]! })),
        sessions: b.sessions.map((s) => ({
          taskId: s.taskId,
          date: s.date,
          toId: sessions[sessionKey(s.taskId, s.date)]!,
        })),
      },
      {
        onSuccess: (r) => {
          setPlanning(null);
          setSeats({});
          setSessions({});
          const names = [...new Set(r.named)].length;
          toast(
            r.status === 'PENDING'
              ? 'Sent for approval — no covers needed'
              : `Cover plan sent — waiting on ${names} ${names === 1 ? 'person' : 'people'}`,
          );
        },
        /* the server's own sentence, naming who clashes and why */
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <>
      {data.needsPlan.length ? (
        <>
          <div className="sec-title">Needs a cover plan</div>
          {data.needsPlan.map((l) => (
            <div className="card" style={{ marginTop: 'var(--s3)' }} key={l.id}>
              <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
                <Avatar name={l.staff.name} />
                <span className="grow">
                  <div className="row" style={{ gap: 'var(--s2)', alignItems: 'baseline' }}>
                    <b>{l.staff.name}</b>
                    <Pill kind="warn">{LEAVE_STATUS_LABEL[l.status]}</Pill>
                  </div>
                  {/* `small` is only block-level inside a .trow; this card is a
                      .row, so the two lines are made blocks explicitly rather
                      than running into each other */}
                  <small style={{ display: 'block' }}>
                    {l.from} to {l.to} · &ldquo;{l.reason}&rdquo;
                  </small>
                  <small style={{ display: 'block' }}>
                    <Num>{l.ridingCount}</Num> clients ride on this seat ·{' '}
                    <Num>{l.sessionCount}</Num> booked sessions in the window
                  </small>
                </span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setSeats({});
                    setSessions({});
                    setPlanning(l.id);
                  }}
                >
                  Plan the cover
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {data.waiting.length ? (
        <>
          <div className="sec-title" style={{ marginTop: 'var(--s4)' }}>
            Waiting
          </div>
          {data.waiting.map((l) => (
            <div className="card" style={{ marginTop: 'var(--s3)' }} key={l.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b>
                  {l.staff.name} · {l.from} to {l.to}
                </b>
                <Pill kind={leaveStatusTone(l.status)}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
              </div>
              <small>
                {l.stillToAnswer.length
                  ? `Still to answer: ${l.stillToAnswer.join(', ')}`
                  : 'Every cover has accepted — waiting on the signature.'}
              </small>
            </div>
          ))}
        </>
      ) : null}

      <div className="sec-title" style={{ marginTop: 'var(--s4)' }}>
        Covers running today
      </div>
      {data.runningToday.length ? (
        <div className="card">
          <div className="list">
            {data.runningToday.map((c) => (
              <div className="trow" key={c.id}>
                <span className="grow">
                  <b>
                    {c.coverName} covers {c.ownerName ?? 'the seat'}
                  </b>
                  <small>
                    {c.clientName} · {c.seatKey} seat · Until {c.until}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <p className="audit" style={{ marginTop: 'var(--s2)' }}>
            Covers lapse by date on their own — the seat returns to its owner the morning after.
          </p>
        </div>
      ) : (
        <div className="card">
          <Empty icon="check" sentence="Nobody is covering for anybody today." />
        </div>
      )}

      {data.decided.length ? (
        <>
          <div className="sec-title" style={{ marginTop: 'var(--s4)' }}>
            Decided
          </div>
          <div className="card">
            <div className="list">
              {data.decided.map((l) => (
                <div className="trow" key={l.id}>
                  <span className="grow">
                    <b>{l.staff.name}</b>
                    <small>
                      {l.from} to {l.to} · &ldquo;{l.reason}&rdquo;
                    </small>
                  </span>
                  <Pill kind={leaveStatusTone(l.status)}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <Sheet open={!!planning} onClose={() => setPlanning(null)} label="Cover board">
        {board.isLoading ? <p className="sub">Reading the bench…</p> : null}
        {b ? (
          <>
            <div className="h1">Cover board — {b.leave.staff.name}</div>
            <p className="sub">
              {b.leave.from} to {b.leave.to} · &ldquo;{b.leave.reason}&rdquo;
            </p>

            {!b.bench.length ? (
              <Notice kind="bad">
                Nobody on that bench is free across the window. The leave cannot be planned until
                somebody is.
              </Notice>
            ) : null}

            <div className="sec-title">The pod seats</div>
            {b.riding.length ? (
              <div className="lv-retab">
                {b.riding.map((r) => (
                  <div className="lv-cbrow" key={r.clientId}>
                    <Avatar name={r.clientName} />
                    <span className="grow">
                      <b>{r.clientName}</b>
                      <small>{r.seatKey} seat</small>
                    </span>
                    <select
                      className="input lv-sel"
                      value={seats[r.clientId] ?? ''}
                      aria-label={`Who covers ${r.clientName}`}
                      onChange={(e) => setSeats({ ...seats, [r.clientId]: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {b.bench.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.level ? ` · L${c.level}` : ''}
                          {c.sameLevel ? ' · same level' : ''}
                          {c.isHod ? ' · HoD' : ''}
                          {c.loadWords}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <Notice>Nobody rides this seat today — only the booked sessions need a name.</Notice>
            )}

            <div className="sec-title" style={{ marginTop: 'var(--s3)' }}>
              The booked sessions
            </div>
            {b.sessions.length ? (
              <>
                <p className="sub">
                  <Num>{b.sessions.length}</Num> appointments fall inside this window. Each needs a
                  name against it — the client is expecting somebody.
                </p>
                <div className="lv-retab">
                  {b.sessions.map((s) => {
                    const k = sessionKey(s.taskId, s.date);
                    return (
                      <div className="lv-cbrow" key={k}>
                        <span className="grow">
                          <b>{s.title}</b>
                          <small>
                            {s.date} · {fmtShortTime(s.startMin)}
                          </small>
                        </span>
                        <select
                          className="input lv-sel"
                          value={sessions[k] ?? ''}
                          aria-label={`Who takes ${s.title} on ${s.date}`}
                          onChange={(e) => setSessions({ ...sessions, [k]: e.target.value })}
                        >
                          <option value="">Choose…</option>
                          {b.bench.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.reasons[k] ?? 'free'}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <Notice>No booked sessions inside the window — only the seats need covering.</Notice>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
              <button type="button" className="btn sm ghost" onClick={() => setPlanning(null)}>
                Not yet
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={!complete || plan.isPending}
                onClick={send}
              >
                Send for approval
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
