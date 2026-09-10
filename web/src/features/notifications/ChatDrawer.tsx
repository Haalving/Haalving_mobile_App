'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Num, Pill, SkeletonRows, useToast } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';
import { useClient, useCircle, usePostCircle, type CircleMessage } from '@/features/clients/queries';
import { useArrivalThread, useReplyArrival } from '@/features/clients/onboarding/queries';
import { firstName, said, useRooms, type RoomRow } from '@/features/notifications/rooms';

/**
 * THE CHAT DRAWER — every room, read and answered without leaving the page.
 *
 * A panel over the right seven-tenths of the screen, laid out the way a phone's
 * messaging app is: the rooms down the left, newest word first, the open room
 * on the right with its thread and composer. The list is the same `/rooms`
 * read the badge counts from; the thread is the same lane the record's Circle
 * tab shows, so a line sent here lands where a line sent there does — in the
 * client's app — and nowhere else. Team-only notes stay on the record's pad by
 * design: a toggle beside a client-facing composer is a thing you can be wrong
 * about once.
 *
 * Narrower than 860px the two columns become two screens, list then room,
 * with a back arrow; nothing is hidden, only stacked.
 */

const KIND_LABEL: Record<string, string> = {
  CARD: 'Pinned',
  DOC: 'Published',
  RATING: 'Rating',
  MEAL: 'Meal',
  PROMO: 'Announcement',
  WISH: 'Wishes',
};

type Tab = 'client' | 'onboarding';

/* ------------------------------------------------------------- time words */

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** "Today", "Yesterday", else "12 Sept 2026" — the separators between days. */
function dayWord(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The list's time column: a clock today, a weekday this week, a date beyond. */
function listWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "HAALVING Poorna" from the stored `POORNA` — the record header's own wording. */
function planWord(plan: string): string {
  const p = String(plan || '').toLowerCase();
  return p ? `HAALVING ${p[0]!.toUpperCase()}${p.slice(1)}` : '';
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/* ------------------------------------------------------------------ drawer */

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rooms = useRooms(open ? 15_000 : 60_000);
  const ownsOnboarding = useCan('ownsOnboarding');
  const narrow = useNarrow();

  const [tab, setTab] = useState<Tab>('client');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const rows = useMemo(() => rooms.data?.rows ?? [], [rooms.data]);
  const clients = rows.filter((r) => r.kind === 'client');
  const arrivals = rows.filter((r) => r.kind === 'onboarding');
  const litIn = (xs: RoomRow[]) => xs.filter((r) => r.lit).length;

  const needle = q.trim().toLowerCase();
  const shown = (tab === 'client' ? clients : arrivals).filter((r) => !needle || r.name.toLowerCase().includes(needle));
  const current = rows.find((r) => r.key === picked) ?? null;

  /* the page behind does not scroll while the drawer is up, and Escape closes it */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.overlay')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const showList = !narrow || !current;
  const showRoom = !narrow || !!current;

  return (
    <>
      <div className="cd-scrim" onClick={onClose} aria-hidden="true" />
      <aside className={`cd${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-label="Chats">
        {showList ? (
          <section className="cd-side" aria-label="Rooms">
            <header className="cd-side-head">
              <div className="grow">
                <b>Chats</b>
                <small className="sub">
                  {rooms.data?.lit ? (
                    <>
                      <Num>{rooms.data.lit}</Num> waiting for a reply
                    </>
                  ) : (
                    'Nobody is waiting'
                  )}
                </small>
              </div>
              <button type="button" className="cd-x" aria-label="Close chats" onClick={onClose}>
                <Icon name="x" />
              </button>
            </header>

            <div className="cd-search">
              <Icon name="search" />
              <input
                className="input"
                placeholder="Search people"
                aria-label="Search rooms"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="cd-tabs" role="tablist" aria-label="Rooms">
              <button type="button" role="tab" aria-selected={tab === 'client'} className={tab === 'client' ? 'on' : ''} onClick={() => setTab('client')}>
                Onboarded <Num>{clients.length}</Num>
                {litIn(clients) ? <span className="cd-dot" aria-label={`${litIn(clients)} waiting`} /> : null}
              </button>
              {ownsOnboarding ? (
                <button type="button" role="tab" aria-selected={tab === 'onboarding'} className={tab === 'onboarding' ? 'on' : ''} onClick={() => setTab('onboarding')}>
                  Onboarding <Num>{arrivals.length}</Num>
                  {litIn(arrivals) ? <span className="cd-dot" aria-label={`${litIn(arrivals)} waiting`} /> : null}
                </button>
              ) : null}
            </div>

            <div className="cd-list">
              {rooms.isLoading ? <SkeletonRows rows={8} height={64} /> : null}
              {!rooms.isLoading && shown.length === 0 ? (
                <p className="cd-none">
                  {needle ? 'Nobody by that name.' : tab === 'client' ? 'No rooms on the people you carry.' : 'Nobody is onboarding right now.'}
                </p>
              ) : null}
              {shown.map((r) => (
                <button
                  type="button"
                  key={r.key}
                  className={`cd-row${r.key === picked ? ' on' : ''}${r.lit ? ' lit' : ''}`}
                  onClick={() => setPicked(r.key)}
                  aria-current={r.key === picked ? 'true' : undefined}
                >
                  <Avatar name={r.name} />
                  <span className="cd-row-mid">
                    <span className="cd-row-top">
                      <span className="cd-row-name">{r.name}</span>
                      <span className="cd-row-when num">{r.last ? listWhen(r.last.at) : ''}</span>
                    </span>
                    <span className="cd-row-bot">
                      <span className="cd-row-text">{said(r)}</span>
                      {r.lit ? <span className="cd-badge" title="Waiting for your reply">1</span> : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showRoom ? (
          <section className="cd-main" aria-label={current ? `${current.name}'s room` : 'No room open'}>
            {current ? (
              current.kind === 'client' ? (
                <ClientRoom key={current.key} room={current} narrow={narrow} onBack={() => setPicked(null)} onLeave={onClose} />
              ) : (
                <ArrivalRoom key={current.key} room={current} narrow={narrow} onBack={() => setPicked(null)} onLeave={onClose} />
              )
            ) : (
              <div className="cd-empty">
                <span className="cd-empty-icon">
                  <Icon name="chat" />
                </span>
                <b>Choose a conversation</b>
                <p className="sub">Every line you send here lands in that person’s app. Team-only notes stay on their record.</p>
              </div>
            )}
          </section>
        ) : null}
      </aside>
    </>
  );
}

/* ---------------------------------------------------------- room header */

function RoomHead({
  room,
  sub,
  narrow,
  onBack,
  onOpen,
}: {
  room: RoomRow;
  sub: string;
  narrow: boolean;
  onBack: () => void;
  onOpen: () => void;
}) {
  return (
    <header className="cd-head">
      {narrow ? (
        <button type="button" className="cd-back" aria-label="Back to rooms" onClick={onBack}>
          <Icon name="chevL" />
        </button>
      ) : null}
      <Avatar name={room.name} />
      <div className="grow">
        <b>{room.name}</b>
        <small className="sub">{sub}</small>
      </div>
      <button type="button" className="btn sm ghost" onClick={onOpen}>
        Open record
      </button>
    </header>
  );
}

/* ------------------------------------------------------- a client's room */

function ClientRoom({ room, narrow, onBack, onLeave }: { room: RoomRow; narrow: boolean; onBack: () => void; onLeave: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const meId = useSession((s) => s.user?.id ?? null);
  const { data: c } = useClient(room.id);
  const thread = useCircle(room.id, 'client', { refetchInterval: 10_000 });
  const post = usePostCircle(room.id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const F = firstName(room.name);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread.data?.length]);

  const send = () => {
    const t = text.trim();
    if (!t || post.isPending) return;
    post.mutate(
      { text: t },
      {
        onSuccess: () => setText(''),
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const members = (c?.pod ?? []).filter((p) => p.staff).map((p) => firstName(p.staff!.name));
  const sub = [planWord(room.plan), room.where !== 'active' ? room.where : null, members.length ? `${members.join(', ')} and ${F}` : null]
    .filter(Boolean)
    .join(' · ');

  /* day separators: a line before the first message of each day */
  const items = useMemo(() => {
    const out: Array<{ day: string } | { m: CircleMessage }> = [];
    let lastDay = '';
    for (const m of thread.data ?? []) {
      const day = dayWord(m.at);
      if (day !== lastDay) {
        out.push({ day });
        lastDay = day;
      }
      out.push({ m });
    }
    return out;
  }, [thread.data]);

  return (
    <>
      <RoomHead
        room={room}
        sub={sub}
        narrow={narrow}
        onBack={onBack}
        onOpen={() => {
          onLeave();
          router.push(`/clients/${room.id}?tab=circle`);
        }}
      />
      <div className="cd-thread">
        {thread.isLoading ? <SkeletonRows rows={4} height={48} /> : null}
        {thread.data && !thread.data.length ? <p className="cd-none">Nothing in {F}’s room yet — say hello; it lands in their app.</p> : null}
        {items.map((it, i) =>
          'day' in it ? (
            <div className="cd-day" key={`d${i}`}>
              <span>{it.day}</span>
            </div>
          ) : (
            <Bubble key={it.m.id} m={it.m} mine={!!meId && it.m.from?.id === meId} clientName={F} />
          ),
        )}
        <div ref={end} />
      </div>
      <div className="cd-composer">
        <input
          className="input"
          placeholder={`Message ${F} — lands in their app`}
          aria-label={`Message ${F}`}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="btn cd-send" disabled={!text.trim() || post.isPending} onClick={send} aria-label={`Send to ${F}`}>
          <Icon name="send" />
        </button>
      </div>
    </>
  );
}

function Bubble({ m, mine, clientName }: { m: CircleMessage; mine: boolean; clientName: string }) {
  const fromClient = m.fromKind === 'CLIENT';
  const label = KIND_LABEL[m.kind];
  const who = fromClient ? clientName : m.from?.name ? firstName(m.from.name) : 'HAALVING';
  return (
    <div className={`cd-msg ${mine ? 'me' : 'them'}${fromClient ? ' client' : ''}`}>
      {!mine ? <span className="who">{who}</span> : null}
      {label ? (
        <span className="cd-kind">
          <Pill kind={m.kind === 'DOC' ? 'ok' : 'neutral'}>{label}</Pill>
        </span>
      ) : null}
      <span className="text">{m.text}</span>
      <span className="when num">{clock(m.at)}</span>
    </div>
  );
}

/* --------------------------------------------------- an onboarding room */

function ArrivalRoom({ room, narrow, onBack, onLeave }: { room: RoomRow; narrow: boolean; onBack: () => void; onLeave: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const thread = useArrivalThread(room.id, true);
  const reply = useReplyArrival(room.id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const F = firstName(room.name);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread.data?.messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t || reply.isPending) return;
    reply.mutate(t, {
      onSuccess: () => setText(''),
      onError: (e) => toast((e as Error).message),
    });
  };

  const team = thread.data?.members ?? [];
  const sub = [`Onboarding · ${room.where}`, team.length ? `${team.map((m) => firstName(m.name)).join(', ')} and ${F}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <RoomHead
        room={room}
        sub={sub}
        narrow={narrow}
        onBack={onBack}
        onOpen={() => {
          onLeave();
          router.push(`/clients?rail=onboarding&arrival=${room.id}`);
        }}
      />
      <div className="cd-thread">
        {thread.isLoading ? <SkeletonRows rows={4} height={48} /> : null}
        {thread.data && !thread.data.messages.length ? <p className="cd-none">Nothing in {F}’s room yet — say hello; it lands in their app.</p> : null}
        {(thread.data?.messages ?? []).map((m) => (
          <div className={`cd-msg ${m.mine ? 'them client' : 'me'}`} key={m.id}>
            {m.mine ? <span className="who">{F}</span> : null}
            <span className="text">{m.text}</span>
            <span className="when">{m.ago}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="cd-composer">
        <input
          className="input"
          placeholder={`Message ${F} — lands in their app`}
          aria-label={`Message ${F}`}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="btn cd-send" disabled={!text.trim() || reply.isPending} onClick={send} aria-label={`Send to ${F}`}>
          <Icon name="send" />
        </button>
      </div>
    </>
  );
}
