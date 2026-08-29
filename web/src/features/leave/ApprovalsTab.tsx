'use client';

import { useState } from 'react';
import { LEAVE_STATUS_LABEL, leaveStatusTone } from '@haalving/shared';

import { Empty, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { useApprovals, useApproveLeave, useDeclineLeave } from '@/features/leave/queries';

/**
 * Approvals — the sign-off packet.
 *
 * Ported from `approveHtml` / `declineSheet` (console-leave.js:692-767, 1064-1128).
 *
 * ONE SIGNATURE APPROVES BOTH HALVES. The packet shows the leave AND how the work
 * was reallocated, because approving the first without seeing the second is
 * approving an absence with no idea who is covering it.
 */
export function ApprovalsTab() {
  const { data, isLoading } = useApprovals(true);
  const approve = useApproveLeave();
  const decline = useDeclineLeave();
  const toast = useToast();

  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (isLoading) return <SkeletonRows rows={3} height={110} />;
  if (!data) return null;

  return (
    <>
      <p className="sub">
        Each packet shows the leave and how the work was reallocated — one signature approves both.
      </p>

      {!data.pending.length ? (
        <div className="card">
          <Empty icon="check" sentence="Nothing waiting on your signature." />
        </div>
      ) : (
        data.pending.map((l) => (
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

            <div className="sec-title" style={{ marginTop: 'var(--s3)' }}>
              Seats
            </div>
            <div className="lv-retab">
              {l.reallocations.map((r) => (
                <div className="lv-re" key={`${r.clientId}-${r.seatKey}`}>
                  <span className="grow">
                    <b>{r.clientName}</b>
                    <small>
                      {r.seatKey} seat → {r.toName}
                    </small>
                  </span>
                </div>
              ))}
              {!l.reallocations.length ? <p className="sub">No seats ride on this leave.</p> : null}
            </div>

            <div className="sec-title" style={{ marginTop: 'var(--s3)' }}>
              Sessions
            </div>
            <div className="lv-retab">
              {l.sessionCovers.map((s) => (
                <div className="lv-re" key={`${s.taskId}-${s.date}`}>
                  <span className="grow">
                    <b>{s.date}</b>
                    <small>taken by {s.toName}</small>
                  </span>
                </div>
              ))}
              {!l.sessionCovers.length ? (
                <p className="sub">No booked sessions fall inside the window.</p>
              ) : null}
            </div>

            <p className="sub" style={{ marginTop: 'var(--s3)' }}>
              <Num>{l.reallocations.length}</Num> reallocations ·{' '}
              <Num>{l.sessionCovers.length}</Num> sessions · every cover has accepted.
            </p>

            <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
              <button
                type="button"
                className="btn sm"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(l.id, {
                    onSuccess: () => toast(`Approved — covers switch on ${l.from}`),
                    onError: (e) => toast((e as Error).message),
                  })
                }
              >
                Approve
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  setReason('');
                  setDeclining(l.id);
                }}
              >
                Decline…
              </button>
            </div>
          </div>
        ))
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
                      {l.from} to {l.to}
                      {l.declineReason ? ` · ${l.declineReason}` : ''}
                    </small>
                  </span>
                  <Pill kind={leaveStatusTone(l.status)}>{LEAVE_STATUS_LABEL[l.status]}</Pill>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <Sheet open={!!declining} onClose={() => setDeclining(null)} label="Decline this leave">
        <div className="h1">Decline this leave?</div>
        <p className="sub">
          The reason goes back to the applicant — a decline they cannot act on is worse than none.
        </p>
        <textarea
          className="input"
          value={reason}
          aria-label="Reason for declining"
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
          <button type="button" className="btn sm ghost" onClick={() => setDeclining(null)}>
            Keep it pending
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={reason.trim().length < 3}
            onClick={() =>
              decline.mutate(
                { id: declining as string, reason: reason.trim() },
                {
                  onSuccess: () => {
                    setDeclining(null);
                    toast('Declined.');
                  },
                  onError: (e) => toast((e as Error).message),
                },
              )
            }
          >
            Decline with reason
          </button>
        </div>
      </Sheet>
    </>
  );
}
