'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Sheet, useToast } from '@/components/ui';
import { SEAT_META } from '@/features/clients/PodSeats';
import { TeamAllocationPanel } from '@/features/clients/onboarding/TeamAllocationPanel';
import { useArrivalThread, useReplyArrival, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * My Circle, before there is a circle — the arrival's room, docked on the
 * right of the onboarding workspace the way the Team panel docks on a client
 * record. Open by default: the person running onboarding reads the client's
 * questions beside the checklist they are working through, not under it.
 *
 * BUILT FOR 332px. Everything is one size smaller than the record's Circle
 * tab — the sub-line, the bubbles, the member row — because the panel is a
 * third of the width and a room that wraps every line reads as noise. The
 * members are a single row of faces with a count; names live in the tooltip
 * and in "Edit members", which opens the same allocation the checklist's
 * step 2 uses, so there is one place the seats are decided.
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

  /* the newest line is what the reader came for — land there on every load */
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t || reply.isPending) return;
    reply.mutate(t, {
      onSuccess: () => setText(''),
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
        <button type="button" className="on" aria-current="page" style={{ justifyContent: 'flex-start', padding: 'var(--s3) var(--s4)' }}>
          <Icon name="chat" />
          My Circle
        </button>
        {onClose ? (
          <button type="button" style={{ flex: 'none', padding: '0 var(--s3)' }} onClick={onClose} aria-label="Hide My Circle" title="Hide My Circle">
            <Icon name="chevR" />
          </button>
        ) : null}
      </div>

      {/* who is in the room — faces, a count, and the one door to change them */}
      <div className="row" style={{ gap: 'var(--s2)', padding: 'var(--s3) var(--s4)', boxShadow: 'inset 0 -1px 0 var(--line-soft)' }}>
        <span className="row" style={{ gap: 0 }} aria-label={[...team.map((m) => `${m.name} · ${seatLabel(m.seat)}`), `${a.name} · Client`].join(', ')}>
          {team.slice(0, 5).map((m, i) => (
            <span key={`${m.seat}:${m.id}`} title={`${m.name} · ${seatLabel(m.seat)}`} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)' }}>
              <Avatar name={m.name} className="sm" />
            </span>
          ))}
          <span title={`${a.name} · Client`} style={{ marginLeft: team.length ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)' }}>
            <Avatar name={a.name} className="sm" />
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <b style={{ fontSize: 'var(--t-xs)' }}>{team.length + 1} members</b>
          <br />
          <small className="sub" style={{ fontSize: 'var(--t-micro)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {team.length ? team.map((m) => m.name.split(' ')[0]).join(', ') + ` and ${F}` : `Only ${F} so far`}
          </small>
        </span>
        {a.canRun ? (
          <button type="button" className="btn sm ghost" style={{ flex: 'none', padding: 'var(--s1) var(--s3)' }} onClick={() => setMembers(true)}>
            Edit
          </button>
        ) : null}
      </div>

      <div className="padbody" style={{ gap: 'var(--s3)' }}>
        <p className="sub" style={{ margin: 0, fontSize: 'var(--t-micro)', color: 'var(--ink-3)', lineHeight: 1.4 }}>
          {data?.sub ?? `What ${F} reads in the app while they are onboarding.`}
        </p>

        {isLoading ? (
          <p className="audit" style={{ margin: 0 }}>Opening the room…</p>
        ) : null}

        {data && data.messages.length ? (
          <div className="chat" style={{ gap: 'var(--s2)' }}>
            {data.messages.map((m) => (
              <div className={`msg ${m.mine ? 'them' : 'me'}`} key={m.id} style={{ fontSize: 'var(--t-xs)', padding: 'var(--s2) var(--s3)' }}>
                <span className="who">{m.mine ? F : (m.who ?? 'Onboarding team')}</span>
                {m.text}
                <span className="when">{m.ago}</span>
              </div>
            ))}
            <div ref={end} />
          </div>
        ) : null}

        {data && !data.messages.length ? (
          <p className="audit" style={{ margin: 0 }}>Nothing in {F}’s room yet — say hello; it lands in their app.</p>
        ) : null}

        {!a.canRun ? <p className="audit" style={{ margin: 0 }}>Only whoever runs onboarding writes here; {F} reads every line in the app.</p> : null}
      </div>

      {a.canRun ? (
        <div className="padfoot">
          <input
            className="input"
            placeholder={`Message ${F}`}
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
          <button type="button" className="btn sm" disabled={!text.trim() || reply.isPending} onClick={send} aria-label={`Send to ${F}`} title="Send — lands in their app" style={{ flex: 'none', padding: '0 var(--s3)' }}>
            <Icon name="send" />
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
