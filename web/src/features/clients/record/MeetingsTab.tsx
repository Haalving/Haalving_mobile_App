'use client';

import { Audit, Empty, IconTile, SecTitle } from '@/components/ui';
import { useClientMeetings, type ClientDetail, type MeetingRow } from '@/features/clients/queries';

/**
 * MEETINGS — the Schedule's rows for this client, with time and join link.
 *
 * A meeting is a Task of kind MEETING, created in Schedule against this client
 * with a start time, duration and (when it has a room) a join link. This tab is
 * the client-scoped read of exactly those — `GET /clients/:id/meetings`, newest
 * first — so a coach opens the record and sees when they next meet and where to
 * join, without leaving for the calendar.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 12 Sep — a day a person reads, from an ISO one; the year only when it differs. */
function niceDate(iso: string | null): string {
  if (!iso) return 'Unscheduled';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 'Unscheduled';
  const now = new Date();
  const yy = y === now.getFullYear() ? '' : ` ${y}`;
  return `${d} ${MONTHS[m - 1]}${yy}`;
}

/** Minutes-since-midnight → "2:30 PM", the clock the Schedule writes. */
function clock(min: number | null): string {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const mm = min % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

function MeetingCard({ m }: { m: MeetingRow }) {
  const when = [niceDate(m.date), clock(m.startMin), m.durMin ? `· ${m.durMin} min` : '']
    .filter(Boolean)
    .join(' ');
  const who = m.coaches.length ? ` · with ${m.coaches.join(', ')}` : '';

  return (
    <div className="trow">
      <IconTile name="video" className="sm" />
      <div className="grow">
        <b>{m.title}</b>
        <small>
          {when}
          {who}
        </small>
      </div>
      {m.link ? (
        <a className="btn sm" href={m.link} target="_blank" rel="noopener noreferrer">
          Join
        </a>
      ) : null}
    </div>
  );
}

export function MeetingsTab({ c }: { c: ClientDetail }) {
  const { data, isLoading, isError } = useClientMeetings(c.id);

  if (isLoading) {
    return (
      <div className="ccscroll">
        <Empty icon="clock" sentence="Reading the schedule…" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ccscroll">
        <Empty icon="leaf" sentence="We could not read the meetings just now." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="ccscroll">
        <Empty
          icon="cal"
          sentence="No meetings scheduled yet."
          sub="Meetings you add for this client in Schedule — with a time and a join link — appear here."
        />
      </div>
    );
  }

  return (
    <div className="ccscroll">
      <div className="card">
        <SecTitle>Meetings</SecTitle>
        <div className="list">
          {data.map((m) => (
            <MeetingCard key={m.id} m={m} />
          ))}
        </div>
        <Audit>
          Every meeting on this client&rsquo;s schedule, newest first — with its time and the room to
          join. Added in Schedule; shown here.
        </Audit>
      </div>
    </div>
  );
}
