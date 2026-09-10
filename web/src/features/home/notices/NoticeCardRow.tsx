'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { ago } from '@haalving/shared';

import { IconTile, Pill, useToast, type PillKind } from '@/components/ui';
import {
  useAcknowledgeNotice,
  useMarkNoticeRead,
  type NoticeCard,
  type NoticeKind,
  type NoticeSeverity,
} from '@/features/home/notices/board';

/**
 * ONE NOTICE — something that was said to this reader, by name.
 *
 * It borrows the ticket row's grammar (tile, a growing middle, pills, an action
 * strip) because the two boards sit one tab apart and a second layout language
 * would read as two products. What it does NOT borrow is the ticket's doors: a
 * notice cannot be assigned, worked or resolved, because a notice is not work.
 * It has exactly two states past arrival — read, and acknowledged — and they are
 * the only two controls here.
 *
 * OPENING ONE MARKS IT READ. That is the honest reading of the act: a person who
 * expanded a notice has read it. Acknowledging is separate and deliberate,
 * because "this was on their screen" and "they said they have it" are different
 * facts and the second one is the one anybody chases.
 */

/**
 * Kind → icon, with a STAR for anything this build has not met.
 *
 * `NOTICE_KINDS` is appended to, never reordered (shared/schemas/notices.ts), so
 * an old console and a new row have to keep working together. Falling back to a
 * known-good icon means a kind added after this deploy renders as a notice
 * rather than as a hole.
 */
export const ICON: Record<NoticeKind, string> = {
  LEAVE: 'cal',
  SLA: 'clock',
  REMINDER: 'bell',
  CELEBRATION: 'award',
  TASK: 'check',
  CLIENT_RISK: 'flag',
  SLA_BREACH: 'warn',
};

/** What each kind is called in the one place a reader sees it spelled. */
export const KIND_LABEL: Record<NoticeKind, string> = {
  LEAVE: 'Leave',
  SLA: 'SLA',
  REMINDER: 'Reminder',
  CELEBRATION: 'Celebration',
  TASK: 'Task',
  CLIENT_RISK: 'Client risk',
  SLA_BREACH: 'SLA breach',
};

/**
 * The scale, as pills — the same two tones the ticket board uses.
 *
 * Amber for watch it, red for act on it. A notice with no severity wears no
 * pill: most of them are announcements, and a neutral badge on every row says
 * nothing while making the loud ones harder to find.
 */
export const SEVERITY: Record<NoticeSeverity, { label: string; kind: PillKind }> = {
  CRITICAL: { label: 'Critical', kind: 'bad' },
  HIGH: { label: 'High', kind: 'bad' },
  WATCH: { label: 'Watch', kind: 'warn' },
  INFO: { label: 'Info', kind: 'neutral' },
};

export function NoticeCardRow({
  n,
  onOpen,
}: {
  n: NoticeCard;
  /** When given, a tap opens the notice IN FULL (the card) instead of leaving
      for the client's record. Marking read happens either way. */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const read = useMarkNoticeRead();
  const ack = useAcknowledgeNotice();

  const sev = n.severity ? SEVERITY[n.severity] : null;
  const unread = n.status === 'UNREAD';
  const acknowledged = n.status === 'ACKNOWLEDGED';
  const busy = read.isPending || ack.isPending;

  /*
   * Where the row goes when it is opened, and it is the notice's SUBJECT rather
   * than a notices detail page — there isn't one, and there should not be. A
   * notice about a client is read by looking at the client.
   *
   * A notice with neither a client nor a ticket is an announcement about nothing
   * openable (a leave decision, a reminder): it still marks itself read, it just
   * has nowhere to send anybody.
   */
  const target = n.client ? `/clients/${n.client.id}` : null;

  const open = () => {
    /* mark first, navigate second — a row that navigates before the write lands
       leaves the notice unread and the badge lying about it */
    if (unread) read.mutate(n.id);
    if (onOpen) {
      onOpen();
      return;
    }
    if (target) router.push(target);
  };

  /* the row is a button, so a control inside it has to stop the click reaching
     the row — otherwise acknowledging also navigates away from what was read */
  const inline = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={`trow click${unread ? ' dg-fresh' : ''}`}
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
      <IconTile name={ICON[n.kind] ?? 'star'} />

      {/* `.grow` is inert inside a `.trow` (app.css:540) — the flex is shipped
          here, as `Trow` does, or the middle column sizes to its content */}
      <span className="grow" style={{ flex: 1, minWidth: 0 }}>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <b>{n.title ?? KIND_LABEL[n.kind] ?? 'Notice'}</b>
          {sev ? <Pill kind={sev.kind}>{sev.label}</Pill> : null}
          {unread ? <Pill kind="info">New</Pill> : null}
          {acknowledged ? <Pill kind="ok">Acknowledged</Pill> : null}
        </span>

        <small>{n.text}</small>

        <small>
          {KIND_LABEL[n.kind] ?? 'Notice'} · {ago(n.createdAt)}
          {n.client ? ` · ${n.client.name}` : ''}
          {n.acknowledgedAt ? ` · you had it ${ago(n.acknowledgedAt)}` : ''}
        </small>

        {/*
          ONE CONTROL, AND ONLY WHILE IT MEANS SOMETHING.

          An acknowledged notice is finished: there is no third state to move it
          to, so it carries no button rather than a greyed one. A greyed control
          says "you may not"; the truth here is "there is nothing left to do".
        */}
        {!acknowledged ? (
          <span className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
            <button
              type="button"
              className="btn sm quiet"
              disabled={busy}
              onClick={inline(() =>
                ack.mutate(n.id, {
                  onSuccess: () => toast('Acknowledged.'),
                  onError: (e) => toast((e as Error).message),
                }),
              )}
            >
              Acknowledge
            </button>

            {/* only offered where opening would NOT already do it: a row with
                nowhere to go still needs a way to stop being new */}
            {unread && !target && !onOpen ? (
              <button
                type="button"
                className="btn sm ghost"
                disabled={busy}
                onClick={inline(() =>
                  read.mutate(n.id, { onError: (e) => toast((e as Error).message) }),
                )}
              >
                Mark read
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}
