'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ago } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Empty, IconTile, Num, Pill, SkeletonRows } from '@/components/ui';
import {
  useAttentionTickets,
  type AttentionTicket,
} from '@/features/home/attention/queries';
import {
  SEVERITY as TICKET_SEVERITY,
  STATUS as TICKET_STATUS,
} from '@/features/home/attention/TicketRow';
import {
  useMarkNoticeRead,
  useNoticeBoard,
  useUnreadNotices,
  type NoticeCard,
} from '@/features/home/notices/board';
import {
  ICON as NOTICE_ICON,
  KIND_LABEL as NOTICE_KIND,
  SEVERITY as NOTICE_SEVERITY,
} from '@/features/home/notices/NoticeCardRow';
import { NoticeDetail, TicketDetail } from '@/features/notifications/cards';
import { useCornerTray } from '@/features/notifications/useCornerTray';

/**
 * THE BELL — notifications on every page of the console.
 *
 * Two feeds under one button, because they are the two things the building
 * says to a person without being asked: NOTICES (addressed to you by name —
 * escalations, reminders, leave decisions) and ATTENTION (the open tickets on
 * the clients you carry). Both keep their Home tabs; the bell is the short way
 * in, not a third copy of the data. Every row here is read through the same
 * hooks Home reads, so the count on the bell, the tray and the Home badge can
 * never disagree.
 *
 * THE BADGE COUNTS UNREAD NOTICES ONLY. A new ticket already arrives as a
 * notice, so counting both would ring the bell twice for one event; and a
 * ticket stays live for days by design, which would leave the bell red for as
 * long as the work was open — which is what Home › Attention is for.
 *
 * A TAP ON A ROW OPENS THE CARD IN PLACE, with the full text, every field and
 * the acts the reader may take. Opening a notice is what marks it read
 * (`useMarkNoticeRead`); the badge drains as the reader actually reads, not as
 * the tray happens to be open.
 *
 * NOTHING HERE IS A NEW ENDPOINT. The tray is the Home boards' first page.
 */

type Tab = 'notices' | 'attention';

export function NotificationBell() {
  const { open, at, btn, tray, toggle, close } = useCornerTray();

  const { data: badge } = useUnreadNotices();
  const unread = badge?.unread ?? 0;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`side-bell${open ? ' on' : ''}`}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        onClick={toggle}
      >
        <Icon name="bell" />
        {unread ? <span className="dot num">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      {/* PORTALLED TO THE BODY. The sidebar is `position: sticky`, which is a
          stacking context of its own, so a fixed tray rendered inside it paints
          UNDER the page beside it whatever z-index it wears — the click on a row
          landed on the tab strip behind. The body has no such ceiling. */}
      {open
        ? createPortal(
            <div
              ref={tray}
              className={`bell-tray${at ? ' at' : ''}`}
              role="dialog"
              aria-label="Notifications"
              style={at ? { left: at.left, right: at.right, top: at.top } : undefined}
            >
              <Tray unread={unread} close={close} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/* -------------------------------------------------------------------- tray */

/**
 * Mounted only while the tray is open, so the feeds are fetched when somebody
 * looks rather than on every page of the console.
 */
function Tray({ unread, close }: { unread: number; close: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('notices');
  const [noticeId, setNoticeId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const notices = useNoticeBoard({});
  const tickets = useAttentionTickets({ order: 'time' });
  const read = useMarkNoticeRead();

  const noticeRows = (notices.data?.pages ?? []).flatMap((p) => p.rows);
  const ticketRows = (tickets.data?.pages ?? []).flatMap((p) => p.rows);
  const live = tickets.data?.pages[0]?.total ?? 0;

  /* the card reads the LIVE row, so an acknowledge taken on it shows on it */
  const notice = noticeId ? (noticeRows.find((n) => n.id === noticeId) ?? null) : null;
  const ticket = ticketId ? (ticketRows.find((t) => t.id === ticketId) ?? null) : null;

  const openNotice = (n: NoticeCard) => {
    if (n.status === 'UNREAD') read.mutate(n.id);
    setNoticeId(n.id);
  };
  const openTicket = (t: AttentionTicket) => setTicketId(t.id);
  const back = () => {
    setNoticeId(null);
    setTicketId(null);
  };

  /* from a notice to the ticket it announces: in the tray when the ticket is
     still live, otherwise on Home, where the closed ones are */
  const followLink = () => {
    const id = notice?.attentionId;
    const t = id ? ticketRows.find((x) => x.id === id) : null;
    if (t) {
      setNoticeId(null);
      setTab('attention');
      setTicketId(t.id);
      return;
    }
    close();
    router.push('/home/attention');
  };

  const seeAll = () => {
    close();
    router.push(tab === 'notices' ? '/home/notices' : '/home/attention');
  };

  const detail = notice || ticket;

  return (
    <>
      <div className="bell-head">
        {detail ? (
          <button type="button" className="back" aria-label="Back to the list" onClick={back}>
            <Icon name="chevL" />
          </button>
        ) : null}
        <b>{notice ? 'Notice' : ticket ? 'Attention' : 'Notifications'}</b>
        <button type="button" className="x" aria-label="Close" onClick={close}>
          <Icon name="x" />
        </button>
      </div>

      {detail ? null : (
        <div className="bell-tabs">
          <div className="catseg" role="tablist" aria-label="Feed">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'notices'}
              className={tab === 'notices' ? 'on' : ''}
              onClick={() => setTab('notices')}
            >
              Notices{unread ? <Num> · {unread}</Num> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'attention'}
              className={tab === 'attention' ? 'on' : ''}
              onClick={() => setTab('attention')}
            >
              Attention{live ? <Num> · {live}</Num> : null}
            </button>
          </div>
        </div>
      )}

      <div className="bell-body">
        {notice ? <NoticeDetail n={notice} onOpenTicket={followLink} onLeave={close} /> : null}
        {ticket ? <TicketDetail t={ticket} onLeave={close} /> : null}

        {!detail && tab === 'notices' ? (
          <>
            {notices.isLoading ? <SkeletonRows rows={4} height={56} /> : null}
            {!notices.isLoading && noticeRows.length === 0 ? (
              <Empty icon="bell" sentence="Nothing has been sent to you." />
            ) : null}
            {noticeRows.map((n) => (
              <NoticeLine key={n.id} n={n} onOpen={() => openNotice(n)} />
            ))}
            {notices.hasNextPage ? (
              <button
                type="button"
                className="btn sm ghost"
                style={{ alignSelf: 'center', marginTop: 'var(--s2)' }}
                disabled={notices.isFetchingNextPage}
                onClick={() => void notices.fetchNextPage()}
              >
                {notices.isFetchingNextPage ? 'Loading…' : 'Show older'}
              </button>
            ) : null}
          </>
        ) : null}

        {!detail && tab === 'attention' ? (
          <>
            {tickets.isLoading ? <SkeletonRows rows={4} height={56} /> : null}
            {!tickets.isLoading && ticketRows.length === 0 ? (
              <Empty icon="flag" sentence="Nothing open on the people you carry." />
            ) : null}
            {ticketRows.map((t) => (
              <TicketLine key={t.id} t={t} onOpen={() => openTicket(t)} />
            ))}
            {tickets.hasNextPage ? (
              <button
                type="button"
                className="btn sm ghost"
                style={{ alignSelf: 'center', marginTop: 'var(--s2)' }}
                disabled={tickets.isFetchingNextPage}
                onClick={() => void tickets.fetchNextPage()}
              >
                {tickets.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {detail ? null : (
        <div className="bell-foot">
          <button type="button" className="btn sm ghost" onClick={seeAll}>
            {tab === 'notices' ? 'All notices on Home' : 'All attention on Home'}
            <Icon name="chevR" />
          </button>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- rows */

function NoticeLine({ n, onOpen }: { n: NoticeCard; onOpen: () => void }) {
  const sev = n.severity ? NOTICE_SEVERITY[n.severity] : null;
  const fresh = n.status === 'UNREAD';
  return (
    <button type="button" className={`bell-row${fresh ? ' fresh' : ''}`} onClick={onOpen}>
      <IconTile name={NOTICE_ICON[n.kind] ?? 'star'} className="sm" />
      <span className="bell-mid">
        <span className="bell-t">{n.title ?? NOTICE_KIND[n.kind] ?? 'Notice'}</span>
        <span className="bell-x">{n.text}</span>
        <span className="bell-m">
          {NOTICE_KIND[n.kind] ?? 'Notice'} · {ago(n.createdAt)}
          {n.client ? ` · ${n.client.name}` : ''}
          {n.status === 'ACKNOWLEDGED' ? ' · acknowledged' : ''}
        </span>
      </span>
      {sev ? <Pill kind={sev.kind}>{sev.label}</Pill> : fresh ? <Pill kind="info">New</Pill> : null}
    </button>
  );
}

function TicketLine({ t, onOpen }: { t: AttentionTicket; onOpen: () => void }) {
  const sev = TICKET_SEVERITY[t.severity];
  const status = TICKET_STATUS[t.status];
  return (
    <button type="button" className={`bell-row${t.status === 'OPEN' ? ' fresh' : ''}`} onClick={onOpen}>
      <IconTile name="flag" className="sm" />
      <span className="bell-mid">
        <span className="bell-t">{t.title}</span>
        <span className="bell-x">
          {t.client.name} · {t.description}
        </span>
        <span className="bell-m">
          Raised {ago(t.createdAt)}
          {t.assignedTo ? ` · with ${t.assignedTo.name}` : ' · nobody has taken it'}
          {status ? ` · ${status.label}` : ''}
        </span>
      </span>
      <Pill kind={sev.kind}>{sev.label}</Pill>
    </button>
  );
}
