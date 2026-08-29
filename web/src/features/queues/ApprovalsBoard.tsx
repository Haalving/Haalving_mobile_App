'use client';

import { useState } from 'react';
import { ago } from '@haalving/shared';

import { AiDraft, Audit, Empty, Num, Pill, Ring, Sheet, SkeletonRows, useToast } from '@/components/ui';
import {
  useApprovals,
  useReturnApproval,
  useSignApproval,
  type ApprovalRow,
  type ApprovalsData,
} from '@/features/queues/queries';

/**
 * Approvals — every sign-off in the SOP, in one queue.
 *
 * Ported from console-approvals.js.
 *
 * THE CHAIN DRAWN ON A CARD IS THAT CARD'S SNAPSHOT, taken when it was created,
 * never today's configuration. An item that started before somebody edited the
 * Diet chain keeps walking the chain it started with — otherwise a half-signed
 * item could lose a signature already given, or demand one from a seat that was
 * never asked. The server sends the frozen sequence; the titles beside it are
 * live, because People & Access can rename a seat and "waiting on opshead" is
 * not a sentence anybody says.
 *
 * THE LAST SIGNATURE PUBLISHES. That is why the chain is drawn as steps rather
 * than a status word: what matters is not "pending" but which seat it is sitting
 * on and how many are left.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** The demo's stepper: Draft → each role in the snapshot → Published. */
function Stepper({ a, titles }: { a: ApprovalRow; titles: Record<string, string> }) {
  const steps = ['Draft', ...a.chain.map((s) => titles[s.role] ?? s.role), 'Published'];
  const cur = a.status === 'DRAFT' ? 0 : a.status === 'SUBMITTED' ? 1 + a.stage : steps.length;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--s1)', width: 'max-content' }}>
        {steps.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className={`chip${i < cur ? ' sel' : i === cur ? ' warn' : ''}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function WhoLine({ a }: { a: ApprovalRow }) {
  return (
    <div className="row" style={{ gap: 'var(--s2)' }}>
      <span className="sub">{a.about}</span>
      {a.isProspect ? <Pill kind="neutral">Prospect</Pill> : null}
      {a.pillar ? <span className={`chip p-${a.pillar}`}>{a.pillar}</span> : null}
    </div>
  );
}

/** `Due 13:00 · 23 min left` goes red once it is counting in minutes. */
function DuePill({ due }: { due: string }) {
  return (
    <span className={`pill ${/min/.test(due) ? 'bad' : 'warn'}`}>
      Due <Num>{due}</Num>
    </span>
  );
}

function Trail({ a }: { a: ApprovalRow }) {
  return (
    <>
      {a.history.map((h, i) => (
        <Audit key={i}>
          {cap(h.act)} — {h.by?.name ?? 'the system'} · <Num>{ago(h.at)}</Num>
          {h.note ? ` · “${h.note}”` : ''}
        </Audit>
      ))}
    </>
  );
}

function QueueCard({
  a,
  titles,
  onSign,
  onReturn,
}: {
  a: ApprovalRow;
  titles: Record<string, string>;
  onSign: () => void;
  onReturn: () => void;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div className="h1-row">
        <b>{a.title}</b>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <Pill kind="neutral">{a.typeLabel}</Pill>
          <DuePill due={a.due} />
        </span>
      </div>
      <WhoLine a={a} />
      <div className="sub">
        Proposed by {a.owner.name}
        {a.owner.role ? ` · ${titles[a.owner.role] ?? a.owner.role}` : ''}
      </div>
      <Stepper a={a} titles={titles} />
      <AiDraft>
        <div>{a.aiDraft}</div>
      </AiDraft>
      <Trail a={a} />
      <div className="row" style={{ gap: 'var(--s2)' }}>
        <button type="button" className="btn sm" onClick={onSign}>
          Approve
        </button>
        <button type="button" className="btn sm ghost" onClick={onReturn}>
          Return with reason
        </button>
      </div>
    </div>
  );
}

function FlightCard({ a, titles }: { a: ApprovalRow; titles: Record<string, string> }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div className="h1-row">
        <b>{a.title}</b>
        <Pill kind="info">Waiting on {a.waitingOn ? (titles[a.waitingOn] ?? a.waitingOn) : 'nobody'}</Pill>
      </div>
      <WhoLine a={a} />
      <Stepper a={a} titles={titles} />
    </div>
  );
}

function ReturnedCard({ a }: { a: ApprovalRow }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div className="h1-row">
        <b>{a.title}</b>
        <Pill kind="warn">Returned</Pill>
      </div>
      <WhoLine a={a} />
      <div className="notice warn">Returned with reason: “{a.returnReason}”</div>
    </div>
  );
}

function BoardRow({ a, titles }: { a: ApprovalRow; titles: Record<string, string> }) {
  const pill =
    a.status === 'DRAFT' ? (
      <Pill kind="neutral">Draft</Pill>
    ) : a.status === 'SUBMITTED' ? (
      <Pill kind="info">With {a.waitingOn ? (titles[a.waitingOn] ?? a.waitingOn) : '—'}</Pill>
    ) : (
      <Pill kind="ok">Published</Pill>
    );

  return (
    <div className="trow">
      <span className="grow">
        <b>{a.title}</b>
        <small>
          {a.about}
          {a.isProspect ? ' · prospect' : ''} · {a.typeLabel}
        </small>
      </span>
      {pill}
    </div>
  );
}

export function ApprovalsBoard() {
  const { data, isLoading } = useApprovals();
  const sign = useSignApproval();
  const back = useReturnApproval();
  const toast = useToast();

  const [signing, setSigning] = useState<ApprovalRow | null>(null);
  const [returning, setReturning] = useState<ApprovalRow | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  if (isLoading) return <SkeletonRows rows={3} height={160} />;
  if (!data) return null;

  const d: ApprovalsData = data;
  const titles = d.roleTitles;

  return (
    <>
      <div className="h1-row">
        <p className="sub" style={{ margin: 0 }}>
          Every sign-off in the SOP, one queue — the last signature publishes to the Care Circle.
        </p>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <Ring pct={d.queue.length ? 100 : 0} label={String(d.queue.length)} size="sm" />
          <span className="sub">waiting on you</span>
        </span>
      </div>

      <div className="sec-title">Waiting on your signature</div>
      {d.queue.length ? (
        <div className="list">
          {d.queue.map((a) => (
            <QueueCard
              key={a.id}
              a={a}
              titles={titles}
              onSign={() => {
                setNote('');
                setSigning(a);
              }}
              onReturn={() => {
                setReason('');
                setReturning(a);
              }}
            />
          ))}
        </div>
      ) : (
        <Empty icon="leaf" sentence="Nothing waiting on you. Charts move fast here." />
      )}

      {d.inFlight.length || d.returned.length ? (
        <>
          <div className="sec-title">Mine, in flight</div>
          <div className="list">
            {d.inFlight.map((a) => (
              <FlightCard key={a.id} a={a} titles={titles} />
            ))}
            {d.returned.map((a) => (
              <ReturnedCard key={a.id} a={a} />
            ))}
          </div>
        </>
      ) : null}

      {/* only for a caller who can see everybody's — the server sends an empty
          array otherwise, so this section simply never appears */}
      {d.seesAll ? (
        <>
          <div className="sec-title">All approvals</div>
          {d.all.length ? (
            <div className="list">
              {d.all.map((a) => (
                <BoardRow key={a.id} a={a} titles={titles} />
              ))}
            </div>
          ) : (
            <Empty icon="leaf" sentence="No approvals anywhere — the board is clear." />
          )}
        </>
      ) : null}

      {/* ---------------------------------------------------------- approve */}
      <Sheet open={!!signing} onClose={() => setSigning(null)} label="Approve">
        <div className="h1">Approve “{signing?.title}”</div>
        <p className="sub">
          Your signature moves it one step down the chain; the last signature publishes to the Care
          Circle.
        </p>
        <textarea
          className="input"
          aria-label="Note to the requester"
          placeholder="Note (optional) — travels with the audit trail"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className="btn block"
          disabled={sign.isPending}
          onClick={() =>
            signing &&
            sign.mutate(
              { id: signing.id, note: note.trim() || undefined },
              {
                onSuccess: () => {
                  setSigning(null);
                  toast('Signed.');
                },
                onError: (e) => toast((e as Error).message),
              },
            )
          }
        >
          Approve
        </button>
        <button type="button" className="btn block ghost" onClick={() => setSigning(null)}>
          Not yet
        </button>
      </Sheet>

      {/* ----------------------------------------------------------- return */}
      <Sheet open={!!returning} onClose={() => setReturning(null)} label="Return">
        <div className="h1">Return “{returning?.title}”</div>
        <p className="sub">A return never travels empty-handed — the owner sees exactly what to fix.</p>
        <textarea
          className="input"
          aria-label="Reason for returning"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {/* disabled until something is typed — the demo's own rule, and the
            server refuses an empty reason regardless */}
        <button
          type="button"
          className="btn block"
          disabled={!reason.trim() || back.isPending}
          onClick={() =>
            returning &&
            back.mutate(
              { id: returning.id, reason: reason.trim() },
              {
                onSuccess: () => {
                  setReturning(null);
                  toast('Returned with reason — back with the owner as a draft');
                },
                onError: (e) => toast((e as Error).message),
              },
            )
          }
        >
          Return with reason
        </button>
        <button type="button" className="btn block ghost" onClick={() => setReturning(null)}>
          Keep in the queue
        </button>
      </Sheet>
    </>
  );
}
