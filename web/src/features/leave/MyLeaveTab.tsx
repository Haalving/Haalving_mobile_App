'use client';

import { useState } from 'react';
import { ACT_LABELS, LEAVE_STATUS_LABEL, fmtShortTime, leaveStatusTone, type LeaveAct } from '@haalving/shared';

import { Empty, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import {
  useApplyLeave,
  useMyLeave,
  useRespondCover,
  useWithdrawLeave,
  type LeaveRow,
} from '@/features/leave/queries';

/**
 * My leave — my applications, and the covers waiting on me to say yes or no.
 *
 * Ported from `toAcceptHtml` / `mineHtml` / `applySheet` (console-leave.js:378-489).
 *
 * THE ACCEPT STEP IS THE POINT OF THIS TAB. Somebody picking your name from a
 * dropdown is not you agreeing to work the morning, so every named cover answers
 * before the approver ever sees the plan — and each session carries the pill that
 * says what it would cost you.
 */

/** The pill the demo puts on each session in a cover packet. */
function coverPill(reason: string) {
  if (reason === 'free') return <Pill kind="ok">You are free</Pill>;
  if (reason === 'already booked') return <Pill kind="bad">Clashes for you</Pill>;
  if (reason === 'on leave') return <Pill kind="bad">You are on leave</Pill>;
  return <Pill kind="warn">Outside your hours</Pill>;
}

function History({ events }: { events: LeaveRow['events'] }) {
  return (
    <>
      {events.map((e, i) => (
        <div className="audit" key={i}>
          {ACT_LABELS[e.act as LeaveAct] ?? e.act}
          {e.by ? ` — ${e.by.name}` : ''} · {new Date(e.at).toLocaleDateString()}
        </div>
      ))}
    </>
  );
}

export function MyLeaveTab() {
  const { data, isLoading } = useMyLeave();
  const apply = useApplyLeave();
  const respond = useRespondCover();
  const withdraw = useWithdrawLeave();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  if (isLoading) return <SkeletonRows rows={3} height={96} />;

  const mine = data?.mine ?? [];
  const toAccept = data?.toAccept ?? [];

  const submit = () =>
    apply.mutate(
      { from, to, reason: reason.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setFrom('');
          setTo('');
          setReason('');
          toast('Applied — next stop is the cover board.');
        },
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <>
      <Notice>
        A leave walks four steps: the cover board plans it, every named cover accepts, the approver
        signs, and the covers switch on by date. Any decline sends the plan back to the board.
      </Notice>

      {toAccept.length ? (
        <>
          <div className="sec-title">Covers to accept</div>
          {toAccept.map((l) => (
            <div className="card" style={{ marginTop: 'var(--s3)' }} key={l.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b>
                  {l.staff.name} · {l.from} to {l.to}
                </b>
                <Pill kind={leaveStatusTone(l.status)}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
              </div>
              <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
                &ldquo;{l.reason}&rdquo;
              </p>

              {l.sessions.length ? (
                <div className="list" style={{ marginTop: 'var(--s3)' }}>
                  {l.sessions.map((s) => (
                    <div className="trow" key={`${s.taskId}-${s.date}`}>
                      <span className="grow">
                        <b>{s.title}</b>
                        <small>
                          {s.date} · {fmtShortTime(s.startMin)}
                        </small>
                      </span>
                      {coverPill(s.reason)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sub" style={{ marginTop: 'var(--s2)' }}>
                  No booked sessions inside the window — only the seat.
                </p>
              )}

              <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    respond.mutate(
                      { id: l.id, accept: true },
                      {
                        onSuccess: (r) =>
                          toast(
                            r.status === 'PENDING'
                              ? 'Accepted — it goes to the approver now.'
                              : 'Accepted — still waiting on the others.',
                          ),
                        onError: (e) => toast((e as Error).message),
                      },
                    )
                  }
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() =>
                    respond.mutate(
                      { id: l.id, accept: false },
                      {
                        onSuccess: () => toast('Declined — the board will re-plan it.'),
                        onError: (e) => toast((e as Error).message),
                      },
                    )
                  }
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      <div className="sec-title" style={{ marginTop: 'var(--s4)' }}>
        My applications
      </div>

      {!mine.length ? (
        <div className="card">
          <Empty
            icon="leaf"
            sentence="No leave on file."
            sub="Apply below when you need a break — the team plans the cover."
          />
        </div>
      ) : (
        mine.map((l) => (
          <div className="card" style={{ marginTop: 'var(--s3)' }} key={l.id}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <b>
                {l.from} to {l.to}
              </b>
              <Pill kind={leaveStatusTone(l.status)}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
            </div>
            <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
              &ldquo;{l.reason}&rdquo;
            </p>

            {l.reallocations.length ? (
              <p className="sub" style={{ marginTop: 'var(--s2)' }}>
                <Num>{l.reallocations.length}</Num> seats and{' '}
                <Num>{l.sessionCovers.length}</Num> sessions covered by{' '}
                {[...new Set(l.reallocations.map((r) => r.toName))].join(', ')}.
              </p>
            ) : null}

            {l.declineReason ? (
              <div style={{ marginTop: 'var(--s2)' }}>
                <Notice kind="bad">{l.declineReason}</Notice>
              </div>
            ) : null}

            <div style={{ marginTop: 'var(--s3)' }}>
              <History events={l.events} />
            </div>

            {['REASSIGN', 'ACCEPT', 'PENDING'].includes(l.status) ? (
              <div className="row" style={{ marginTop: 'var(--s3)' }}>
                <button
                  type="button"
                  className="btn sm quiet"
                  onClick={() =>
                    withdraw.mutate(l.id, {
                      onSuccess: () => toast('Withdrawn.'),
                      onError: (e) => toast((e as Error).message),
                    })
                  }
                >
                  Withdraw
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}

      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 'var(--s4)' }}
        onClick={() => setOpen(true)}
      >
        Apply for leave
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Apply for leave">
        <div className="h1">Apply for leave</div>
        <p className="sub">
          This goes to your department head, or the Ops Head where a bench has none — they plan the
          cover before anybody signs it.
        </p>

        <label className="k" htmlFor="lv-from">
          From
        </label>
        <input
          id="lv-from"
          className="input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />

        <label className="k" htmlFor="lv-to">
          To
        </label>
        <input
          id="lv-to"
          className="input"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />

        <label className="k" htmlFor="lv-why">
          Reason
        </label>
        <textarea
          id="lv-why"
          className="input"
          value={reason}
          placeholder="The cover board is read by whoever has to work the morning."
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
          <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={!from || !to || reason.trim().length < 3 || apply.isPending}
            onClick={submit}
          >
            Apply
          </button>
        </div>
      </Sheet>
    </>
  );
}
