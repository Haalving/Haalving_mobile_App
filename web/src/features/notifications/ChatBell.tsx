'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ago } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Empty, Num, Pill, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/api';
import { useCan } from '@/lib/can';
import { useCornerTray } from '@/features/notifications/useCornerTray';

/**
 * THE CHATS — every room this person is part of, beside the bell.
 *
 * Two lists under two tabs, each newest word first: ONBOARDED — the clients'
 * care circles — and ONBOARDING — the threads of people still walking the
 * rail, which only the desk that runs onboarding is shown. The same name walks
 * from the second tab to the first on promotion.
 *
 * THE BADGE COUNTS ROOMS WAITING FOR A REPLY — the person wrote last and nobody
 * has answered — not "unread", which the server cannot honestly say for a staff
 * reader (rooms.service.ts). A tap opens the room itself: the record's Circle
 * tab, or the onboarding workspace with its docked circle.
 */

export interface RoomLast {
  text: string;
  at: string;
  fromKind: 'STAFF' | 'CLIENT' | 'AI';
  from: string | null;
  lane: 'client' | 'team';
}

export interface RoomRow {
  key: string;
  kind: 'client' | 'onboarding';
  id: string;
  name: string;
  plan: string;
  where: string;
  last: RoomLast | null;
  lit: boolean;
}

export interface RoomsPage {
  rows: RoomRow[];
  lit: number;
}

/** Polled, so the badge moves without the page being reloaded. */
function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get<RoomsPage>('/rooms'),
    refetchInterval: 60_000,
  });
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** Who said the last line, the way a phone's inbox says it. */
function said(r: RoomRow): string {
  const l = r.last;
  if (!l) return 'No messages yet';
  const who = l.fromKind === 'CLIENT' ? firstName(r.name) : l.fromKind === 'AI' ? 'AI' : (l.from ?? 'Team');
  return `${who}: ${l.text}`;
}

export function ChatBell() {
  const { open, at, btn, tray, toggle, close } = useCornerTray();
  const { data } = useRooms();
  const lit = data?.lit ?? 0;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`side-bell${open ? ' on' : ''}`}
        aria-label={lit ? `Chats (${lit} waiting for a reply)` : 'Chats'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Chats"
        onClick={toggle}
      >
        <Icon name="chat" />
        {lit ? <span className="dot num">{lit > 99 ? '99+' : lit}</span> : null}
      </button>

      {open
        ? createPortal(
            <div
              ref={tray}
              className={`bell-tray${at ? ' at' : ''}`}
              role="dialog"
              aria-label="Chats"
              style={at ? { left: at.left, right: at.right, top: at.top } : undefined}
            >
              <Rooms close={close} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type Tab = 'client' | 'onboarding';

function Rooms({ close }: { close: () => void }) {
  const router = useRouter();
  const q = useRooms();
  /* the Onboarding tab is drawn only for a desk that would ever have a row in
     it — a coach is refused the rail, and an always-empty tab is a tease */
  const ownsOnboarding = useCan('ownsOnboarding');
  const [tab, setTab] = useState<Tab>('client');

  const rows = q.data?.rows ?? [];
  const lit = q.data?.lit ?? 0;
  const clients = rows.filter((r) => r.kind === 'client');
  const arrivals = rows.filter((r) => r.kind === 'onboarding');
  const shown = tab === 'client' ? clients : arrivals;
  const litIn = (xs: RoomRow[]) => xs.filter((r) => r.lit).length;

  const go = (r: RoomRow) => {
    close();
    router.push(
      r.kind === 'client' ? `/clients/${r.id}?tab=circle` : `/clients?rail=onboarding&arrival=${r.id}`,
    );
  };

  return (
    <>
      <div className="bell-head">
        <b>Chats</b>
        <span className="bell-sub">
          {lit ? (
            <>
              <Num>{lit}</Num> waiting for a reply
            </>
          ) : (
            'Nobody is waiting'
          )}
        </span>
        <button type="button" className="x" aria-label="Close" onClick={close}>
          <Icon name="x" />
        </button>
      </div>

      <div className="bell-tabs">
        <div className="catseg" role="tablist" aria-label="Rooms">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'client'}
            className={tab === 'client' ? 'on' : ''}
            onClick={() => setTab('client')}
          >
            Onboarded{clients.length ? <Num> · {clients.length}</Num> : null}
            {litIn(clients) ? <span className="bell-lit" aria-label={`${litIn(clients)} waiting`} /> : null}
          </button>
          {ownsOnboarding ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'onboarding'}
              className={tab === 'onboarding' ? 'on' : ''}
              onClick={() => setTab('onboarding')}
            >
              Onboarding{arrivals.length ? <Num> · {arrivals.length}</Num> : null}
              {litIn(arrivals) ? <span className="bell-lit" aria-label={`${litIn(arrivals)} waiting`} /> : null}
            </button>
          ) : null}
        </div>
      </div>

      <div className="bell-body">
        {q.isLoading ? <SkeletonRows rows={5} height={56} /> : null}
        {!q.isLoading && shown.length === 0 ? (
          <Empty
            icon="chat"
            sentence={
              tab === 'client' ? 'No rooms on the people you carry.' : 'Nobody is onboarding right now.'
            }
          />
        ) : null}
        {shown.map((r) => (
          <button
            type="button"
            key={r.key}
            className={`bell-row room${r.lit ? ' fresh' : ''}`}
            onClick={() => go(r)}
          >
            <Avatar name={r.name} />
            <span className="bell-mid">
              <span className="bell-t">{r.name}</span>
              <span className="bell-x">{said(r)}</span>
              <span className="bell-m">
                {r.last ? ago(r.last.at) : '—'}
                {r.kind === 'onboarding' ? ` · ${r.where}` : r.where !== 'active' ? ` · ${r.where}` : ''}
                {r.last?.lane === 'team' ? ' · team only' : ''}
              </span>
            </span>
            {r.lit ? <Pill kind="bad">Reply</Pill> : null}
          </button>
        ))}
      </div>
    </>
  );
}
