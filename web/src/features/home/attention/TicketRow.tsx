'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { ago } from '@haalving/shared';

import { IconTile, Pill, useToast, type PillKind } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';
import {
  useTicketAction,
  type AttentionTicket,
  type TicketSeverity,
  type TicketStatus,
} from '@/features/home/attention/queries';

/**
 * ONE ATTENTION TICKET — the row a person actually works.
 *
 * It borrows the digest row's grammar deliberately (tile, a growing middle
 * holding a name row, a sentence and the evidence line) because the two sit on
 * the same tab and a second layout language between them would read as two
 * boards rather than one.
 *
 * WHICH DOORS A ROW OFFERS IS DECIDED BY ITS STATUS, and it is decided here
 * rather than by disabling four buttons on every line: a closed ticket with four
 * greyed controls says "you may not", when the truth is "there is nothing left
 * to do". The server re-checks every one of them — `FROM` in
 * `attention.service.ts` — so this only decides what is DRAWN.
 */

/**
 * The scale, as pills.
 *
 * TWO TONES ACROSS FOUR STEPS, because a flag is a VOLUME and the console only
 * has two volumes that mean "look at this": amber for watch it, red for act on
 * it. Giving `CRITICAL` a fifth colour of its own would spend a hue on a
 * distinction the row already makes in words.
 */
const SEVERITY: Record<TicketSeverity, { label: string; kind: PillKind }> = {
  CRITICAL: { label: 'Critical', kind: 'bad' },
  HIGH: { label: 'High', kind: 'bad' },
  WATCH: { label: 'Watch', kind: 'warn' },
  INFO: { label: 'Info', kind: 'neutral' },
};

/**
 * The lifecycle, as pills — and OPEN deliberately wears none.
 *
 * Open is what every ticket on the default board already is, and a pill every
 * row wears says nothing. Only a ticket somebody has moved earns one.
 */
const STATUS: Partial<Record<TicketStatus, { label: string; kind: PillKind }>> = {
  ACKNOWLEDGED: { label: 'Acknowledged', kind: 'info' },
  IN_PROGRESS: { label: 'In hand', kind: 'info' },
  RESOLVED: { label: 'Resolved', kind: 'ok' },
  DISMISSED: { label: 'Dismissed', kind: 'neutral' },
};

const LIVE: TicketStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];

export function TicketRow({
  t,
  onClose,
  onAssign,
}: {
  t: AttentionTicket;
  /** Opens the reason sheet — a close is owed one, so it is never taken inline. */
  onClose: (mode: 'resolve' | 'dismiss') => void;
  /** Only ever handed in for a caller who may name somebody else. */
  onAssign?: (() => void) | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const meId = useSession((s) => s.user?.id ?? null);
  const seeAll = useCan('seeAllClients');
  const act = useTicketAction();

  const live = LIVE.includes(t.status);
  const sev = SEVERITY[t.severity];
  const status = STATUS[t.status];
  const mine = !!meId && t.assignedToId === meId;

  const open = () => router.push(`/clients/${t.clientId}`);

  /** Every inline door: run it, say what happened, and never leave the record. */
  const take = (
    action: 'acknowledge' | 'start' | 'assign',
    assignedToId: string | null | undefined,
    said: string,
  ) => {
    act.mutate(
      {
        id: t.id,
        action,
        ...(action === 'assign' ? { assignedToId: assignedToId ?? null } : {}),
      },
      {
        onSuccess: () => toast(said),
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  /* the row is a button, so every control inside it has to stop the click
     reaching the row — otherwise acting on a ticket also navigates away from it */
  const inline = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="trow click"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <IconTile name="flag" />

      {/* `.grow` is inert inside a `.trow` (app.css:540) — the flex is shipped
          here, as `Trow` does, or the middle column sizes to its content and the
          action row below it goes with it */}
      <span className="grow" style={{ flex: 1, minWidth: 0 }}>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <b>{t.title}</b>
          <Pill kind={sev.kind}>{sev.label}</Pill>
          {status ? <Pill kind={status.kind}>{status.label}</Pill> : null}
        </span>

        <small>
          {t.client.name} · {t.description}
        </small>

        {t.evidence.length ? <small>Evidence: {t.evidence.join(' · ')}</small> : null}

        <small>
          Raised {ago(t.createdAt)} · {t.source}
          {t.assignedTo ? ` · with ${t.assignedTo.name}` : ' · nobody has taken it'}
        </small>

        {/* THE CLOSE IS THE ONE THING THE ROW STILL SAYS AFTER IT IS CLOSED.
            A resolved ticket with no reason on it is exactly the row this
            build's mandatory reason exists to prevent. */}
        {!live && t.resolutionReason ? (
          <small>
            {t.resolvedBy ? `${t.resolvedBy.name} — ` : ''}
            {t.resolutionReason}
          </small>
        ) : null}

        {live ? (
          <span className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
            {t.status === 'OPEN' ? (
              <button
                type="button"
                className="btn sm quiet"
                disabled={act.isPending}
                onClick={inline(() => take('acknowledge', undefined, 'Acknowledged.'))}
              >
                Acknowledge
              </button>
            ) : null}

            {t.status !== 'IN_PROGRESS' ? (
              <button
                type="button"
                className="btn sm quiet"
                disabled={act.isPending}
                onClick={inline(() => take('start', undefined, 'You are working it.'))}
              >
                Pick up
              </button>
            ) : null}

            {/*
              ONE ASSIGNMENT CONTROL PER ROW, and which one depends on the
              permission rather than on the ticket.
              Taking work yourself needs nothing — the server gates only on
              naming SOMEBODY ELSE (`seeAllClients`, attention.service.ts). So a
              coach gets the two acts that are theirs, take it and hand it back,
              and a seat that can see everybody gets the sheet that can name
              anybody. Drawing all three would offer a coach a button the API
              answers 403 to.
            */}
            {seeAll && onAssign ? (
              <button
                type="button"
                className="btn sm quiet"
                disabled={act.isPending}
                onClick={inline(onAssign)}
              >
                Assign
              </button>
            ) : mine ? (
              <button
                type="button"
                className="btn sm quiet"
                disabled={act.isPending}
                onClick={inline(() => take('assign', null, 'Handed back to the pod.'))}
              >
                Hand back
              </button>
            ) : (
              <button
                type="button"
                className="btn sm quiet"
                disabled={act.isPending || !meId}
                onClick={inline(() => take('assign', meId, 'It is yours.'))}
              >
                Take it
              </button>
            )}

            <button
              type="button"
              className="btn sm"
              disabled={act.isPending}
              onClick={inline(() => onClose('resolve'))}
            >
              Resolve
            </button>
            <button
              type="button"
              className="btn sm ghost"
              disabled={act.isPending}
              onClick={inline(() => onClose('dismiss'))}
            >
              Dismiss
            </button>
          </span>
        ) : null}
      </span>
    </div>
  );
}
