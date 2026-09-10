'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ago } from '@haalving/shared';

import { IconTile, Pill, useToast } from '@/components/ui';
import { useCan } from '@/lib/can';
import { AssignSheet } from '@/features/home/attention/AssignSheet';
import { CloseSheet } from '@/features/home/attention/CloseSheet';
import {
  useTicketAction,
  type AttentionTicket,
} from '@/features/home/attention/queries';
import {
  SEVERITY as TICKET_SEVERITY,
  STATUS as TICKET_STATUS,
} from '@/features/home/attention/TicketRow';
import { useAcknowledgeNotice, type NoticeCard } from '@/features/home/notices/board';
import {
  ICON as NOTICE_ICON,
  KIND_LABEL as NOTICE_KIND,
  SEVERITY as NOTICE_SEVERITY,
} from '@/features/home/notices/NoticeCardRow';

/**
 * THE TWO CARDS THE BELL OPENS — one notice, one attention ticket, in full.
 *
 * A row in the tray is a headline; this is the whole thing: every field the
 * server sent, spelled out with a label, and the acts the reader may take on it.
 * The rows on Home already know what each pill and icon means, so those tables
 * are IMPORTED from them rather than copied — a kind that gets a new icon on
 * Home gets it here on the same deploy.
 *
 * The acts are the same doors the Home rows offer, through the same hooks, so a
 * ticket acknowledged from the bell is acknowledged everywhere the next render
 * looks. Nothing here can do what Home cannot.
 */

/** A full timestamp — the card is where "1 d ago" is not enough. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LIVE = new Set<AttentionTicket['status']>(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']);

/* ------------------------------------------------------------------ notice */

export function NoticeDetail({
  n,
  onOpenTicket,
  onLeave,
}: {
  n: NoticeCard;
  /** Jump to the ticket this notice announces, when there is one. */
  onOpenTicket: () => void;
  /** Called before a navigation, so the tray is not left open over the new page. */
  onLeave: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ack = useAcknowledgeNotice();

  const sev = n.severity ? NOTICE_SEVERITY[n.severity] : null;
  const acknowledged = n.status === 'ACKNOWLEDGED';
  const state =
    n.status === 'ACKNOWLEDGED'
      ? { label: 'Acknowledged', kind: 'ok' as const }
      : n.status === 'READ'
        ? { label: 'Read', kind: 'neutral' as const }
        : { label: 'New', kind: 'info' as const };

  return (
    <div className="bell-card">
      <div className="bell-card-head">
        <IconTile name={NOTICE_ICON[n.kind] ?? 'star'} />
        <div className="grow">
          <b>{n.title ?? NOTICE_KIND[n.kind] ?? 'Notice'}</b>
          <small>
            {NOTICE_KIND[n.kind] ?? 'Notice'} · {ago(n.createdAt)}
          </small>
        </div>
      </div>

      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
        {sev ? <Pill kind={sev.kind}>{sev.label}</Pill> : null}
        <Pill kind={state.kind}>{state.label}</Pill>
      </div>

      <p className="bell-card-text">{n.text}</p>

      <dl className="bell-facts">
        <div>
          <dt>Sent</dt>
          <dd>{when(n.createdAt)}</dd>
        </div>
        {n.client ? (
          <div>
            <dt>Client</dt>
            <dd>{n.client.name}</dd>
          </div>
        ) : null}
        {n.acknowledgedAt ? (
          <div>
            <dt>Acknowledged</dt>
            <dd>{when(n.acknowledgedAt)}</dd>
          </div>
        ) : null}
        {n.attentionId ? (
          <div>
            <dt>Linked</dt>
            <dd>An attention ticket was raised with this notice.</dd>
          </div>
        ) : null}
      </dl>

      <div className="bell-acts">
        {!acknowledged ? (
          <button
            type="button"
            className="btn sm"
            disabled={ack.isPending}
            onClick={() =>
              ack.mutate(n.id, {
                onSuccess: () => toast('Acknowledged.'),
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Acknowledge
          </button>
        ) : null}
        {n.attentionId ? (
          <button type="button" className="btn sm quiet" onClick={onOpenTicket}>
            View ticket
          </button>
        ) : null}
        {n.client ? (
          <button
            type="button"
            className="btn sm quiet"
            onClick={() => {
              onLeave();
              router.push(`/clients/${n.client!.id}`);
            }}
          >
            Open client
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ticket */

export function TicketDetail({ t, onLeave }: { t: AttentionTicket; onLeave: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const seeAll = useCan('seeAllClients');
  const act = useTicketAction();

  const [closing, setClosing] = useState<'resolve' | 'dismiss' | null>(null);
  const [assigning, setAssigning] = useState(false);

  const live = LIVE.has(t.status);
  const sev = TICKET_SEVERITY[t.severity];
  const status = TICKET_STATUS[t.status];

  const take = (action: 'acknowledge' | 'start', said: string) =>
    act.mutate(
      { id: t.id, action },
      { onSuccess: () => toast(said), onError: (e) => toast((e as Error).message) },
    );

  return (
    <div className="bell-card">
      <div className="bell-card-head">
        <IconTile name="flag" />
        <div className="grow">
          <b>{t.title}</b>
          <small>
            {t.client.name} · raised {ago(t.createdAt)}
          </small>
        </div>
      </div>

      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
        <Pill kind={sev.kind}>{sev.label}</Pill>
        {status ? <Pill kind={status.kind}>{status.label}</Pill> : <Pill kind="neutral">Open</Pill>}
      </div>

      <p className="bell-card-text">{t.description}</p>

      <dl className="bell-facts">
        <div>
          <dt>Client</dt>
          <dd>{t.client.name}</dd>
        </div>
        <div>
          <dt>Raised</dt>
          <dd>
            {when(t.createdAt)} · {t.source}
          </dd>
        </div>
        <div>
          <dt>With</dt>
          <dd>{t.assignedTo ? `${t.assignedTo.name} (${t.assignedTo.role})` : 'Nobody has taken it'}</dd>
        </div>
        {t.dueAt ? (
          <div>
            <dt>Due</dt>
            <dd>{when(t.dueAt)}</dd>
          </div>
        ) : null}
        {t.evidence.length ? (
          <div>
            <dt>Evidence</dt>
            <dd>{t.evidence.join(' · ')}</dd>
          </div>
        ) : null}
        {!live ? (
          <div>
            <dt>{t.status === 'DISMISSED' ? 'Dismissed' : 'Resolved'}</dt>
            <dd>
              {t.resolvedAt ? when(t.resolvedAt) : ''}
              {t.resolvedBy ? ` · ${t.resolvedBy.name}` : ''}
              {t.resolutionReason ? ` — ${t.resolutionReason}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="bell-acts">
        {live && t.status === 'OPEN' ? (
          <button
            type="button"
            className="btn sm"
            disabled={act.isPending}
            onClick={() => take('acknowledge', 'Acknowledged.')}
          >
            Acknowledge
          </button>
        ) : null}
        {live && t.status !== 'IN_PROGRESS' ? (
          <button
            type="button"
            className="btn sm quiet"
            disabled={act.isPending}
            onClick={() => take('start', 'You are working it.')}
          >
            Pick up
          </button>
        ) : null}
        {live ? (
          <>
            <button type="button" className="btn sm quiet" onClick={() => setClosing('resolve')}>
              Resolve
            </button>
            <button type="button" className="btn sm quiet" onClick={() => setClosing('dismiss')}>
              Dismiss
            </button>
          </>
        ) : null}
        {live && seeAll ? (
          <button type="button" className="btn sm quiet" onClick={() => setAssigning(true)}>
            Assign
          </button>
        ) : null}
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            onLeave();
            router.push(`/clients/${t.clientId}`);
          }}
        >
          Open client
        </button>
      </div>

      {/* the same reason sheet Home uses — a close is owed a reason here too */}
      <CloseSheet
        ticket={closing ? t : null}
        mode={closing ?? 'resolve'}
        open={closing !== null}
        onClose={() => setClosing(null)}
      />
      <AssignSheet ticket={assigning ? t : null} open={assigning} onClose={() => setAssigning(false)} />
    </div>
  );
}
