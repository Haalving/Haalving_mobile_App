'use client';

import { useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Empty, Sheet, useToast } from '@/components/ui';
import { SEAT_META } from '@/features/clients/PodSeats';
import { TeamAllocationPanel } from '@/features/clients/onboarding/TeamAllocationPanel';
import { useArrivalThread, useReplyArrival, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * My Circle, before there is a circle — the arrival's room, docked on the
 * right of the onboarding workspace the way the Team panel docks on a client
 * record. Open by default: the person running onboarding reads the client's
 * questions beside the checklist they are working through, not under it.
 *
 * WHO IS IN THE ROOM sits at the top: the Super Admin(s) running onboarding
 * (in by default — the server seats whoever's role owns onboarding), any coach
 * Team allocation has already named, and the client. "Edit members" opens the
 * same allocation the checklist's step 2 uses, so there is one place the seats
 * are decided — the pod that promotion writes is exactly what is shown here.
 *
 * RIGHT-HAND BUBBLES ARE THE TEAM'S, each carrying its author, because more
 * than one person may run onboarding; the client's lines sit on the left. The
 * composer belongs only to whoever may run onboarding — everyone else reads.
 */
export function ArrivalCircle({ a, onClose }: { a: Arrival; onClose?: () => void }) {
  const { data, isLoading } = useArrivalThread(a.id, a.canRun);
  const reply = useReplyArrival(a.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const [members, setMembers] = useState(false);
  const F = a.name.split(' ')[0] ?? a.name;
  const team = data?.members ?? [];
  const seatLabel = (seat: string) => (seat === 'onboarding' ? 'Onboarding' : (SEAT_META[seat as keyof typeof SEAT_META]?.label ?? seat));

  const send = () => {
    const t = text.trim();
    if (!t || reply.isPending) return;
    reply.mutate(t, {
      onSuccess: () => {
        setText('');
        toast(`Sent to ${F} — it is in their My Circle.`);
      },
      onError: (e) => toast((e as Error).message),
    });
  };

  /* STICKY, with its own height: the onboarding page scrolls as a whole (the
     twelve-step checklist is long), so the room pins itself to the viewport and
     scrolls its own thread — the composer is always in reach */
  return (
    <aside
      className="ccpad"
      aria-label="My Circle"
      style={{ position: 'sticky', top: 'var(--s4)', alignSelf: 'flex-start', height: 'calc(100dvh - var(--s8))', borderRadius: 'var(--r-lg)' }}
    >
      <div className="padtabs">
        <button type="button" className="on" aria-current="page">
          <Icon name="chat" />
          My Circle
        </button>
        {onClose ? (
          <button type="button" style={{ flex: 'none', padding: '0 var(--s3)' }} onClick={onClose} aria-label="Hide My Circle" title="Hide My Circle">
            <Icon name="chevR" />
          </button>
        ) : null}
      </div>

      <div className="padbody">
        <p className="sub" style={{ margin: 0 }}>
          {data?.sub ?? `What ${F} reads in the app while they are onboarding.`}
        </p>

        {/* members — the room's people, and the one door to change them */}
        <div>
          <div className="h1-row" style={{ marginBottom: 'var(--s2)' }}>
            <span className="k">Members · {team.length + 1}</span>
            {a.canRun ? (
              <button type="button" className="btn sm ghost" onClick={() => setMembers(true)}>
                Edit members
              </button>
            ) : null}
          </div>
          <div className="row" style={{ gap: 'var(--s3)', flexWrap: 'wrap' }}>
            {team.map((m) => (
              <span key={`${m.seat}:${m.id}`} className="row" style={{ gap: 'var(--s2)' }}>
                <Avatar name={m.name} className="sm" />
                <span style={{ lineHeight: 1.25 }}>
                  <b style={{ fontSize: 'var(--t-xs)' }}>{m.name.split(' ')[0]}</b>
                  <br />
                  <small className="sub" style={{ fontSize: 'var(--t-micro)' }}>{seatLabel(m.seat)}</small>
                </span>
              </span>
            ))}
            <span className="row" style={{ gap: 'var(--s2)' }}>
              <Avatar name={a.name} className="sm" />
              <span style={{ lineHeight: 1.25 }}>
                <b style={{ fontSize: 'var(--t-xs)' }}>{F}</b>
                <br />
                <small className="sub" style={{ fontSize: 'var(--t-micro)' }}>Client</small>
              </span>
            </span>
          </div>
        </div>

        {isLoading ? <div className="skel" style={{ height: 96 }} /> : null}

        {data && data.messages.length ? (
          <div className="chat">
            {data.messages.map((m) => (
              <div className={`msg ${m.mine ? 'them' : 'me'}`} key={m.id}>
                <span className="who">{m.mine ? F : (m.who ?? 'Onboarding team')}</span>
                {m.text}
                <span className="when">{m.ago}</span>
              </div>
            ))}
          </div>
        ) : null}

        {data && !data.messages.length ? <Empty icon="chat" sentence={`Nothing in ${F}’s room yet.`} /> : null}

        {!a.canRun ? <p className="audit">Only whoever runs onboarding writes here; {F} reads every line in the app.</p> : null}
      </div>

      {a.canRun ? (
        <div className="padfoot">
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
          <button type="button" className="btn sm" disabled={!text.trim() || reply.isPending} onClick={send}>
            <Icon name="send" />
            Send
          </button>
        </div>
      ) : null}

      {members ? (
        <Sheet open onClose={() => setMembers(false)}>
          <div className="h1">Who’s in {F}’s circle</div>
          <p className="sub">
            The Super Admin is in by default — they run the onboarding. The coaches you seat here read the room from
            now on and become {F}’s pod at promotion; this is the same allocation as step 2 of the checklist.
          </p>
          <TeamAllocationPanel a={a} />
          <button type="button" className="btn block ghost" onClick={() => setMembers(false)}>
            Done
          </button>
        </Sheet>
      ) : null}
    </aside>
  );
}
