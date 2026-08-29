'use client';

import { useRouter } from 'next/navigation';
import { KINDS, RESP, dayName, fmtShortTime, type RespState } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Num, Pill, Sheet } from '@/components/ui';
import { LinkMark } from '@/features/schedule/marks';
import { dayOfMonth, firstName, nowMinutes } from '@/features/schedule/days';
import type { Occurrence, SchedStaff } from '@/features/schedule/queries';

/**
 * One occurrence, in full — ported from `openDetail` (console-schedule.js:869-1062).
 *
 * The order is the demo's: what it is, who it is with, my say, the door, the
 * notes, then the verbs. The verbs go LAST and to the right because reading a
 * task is the common act and changing one is the rare one.
 *
 * WHAT THE SERVER SENDS IS WHAT IS SHOWN. The acceptance count, whether the tile
 * is confirmed, whether I may edit it and whether it repeats are all decided in
 * `schedule.service.ts`; none of them is recomputed here.
 *
 * TWO OF THE DEMO'S BLOCKS ARE NOT HERE, and both because the thing they read
 * does not exist on this side yet:
 *
 *   · Proposed times, with Apply. The grid's read carries no proposals and there
 *     is no endpoint that lists them — `POST /schedule/proposals/:id/apply` has
 *     nothing to name. `useApplyProposal` is written and waiting for that read.
 *     My OWN proposal is still visible, because asking for a new time writes a
 *     `resched` response and `mine` carries it.
 *
 *   · The session report and the AI coach brief, which belong to subsystems
 *     (`HV.meetui`, `HV.brief`) this port has not reached.
 */

const RESP_ACTS: Array<[RespState, string]> = [
  ['accepted', 'Accept'],
  ['hold', 'Hold'],
  ['declined', 'Decline'],
];

export function DetailSheet({
  occ,
  today,
  meId,
  byId,
  groupNames,
  clientName,
  onClose,
  onRespond,
  onPropose,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  occ: Occurrence;
  today: string;
  meId: string | null;
  byId: Map<string, SchedStaff>;
  groupNames: Map<string, string>;
  clientName: string | null;
  onClose: () => void;
  onRespond: (state: RespState) => void;
  onPropose: () => void;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const nowMin = nowMinutes();

  const grp = occ.resp.needed;
  const amIn = !!meId && occ.people.includes(meId);
  const gnames = occ.groups.map((g) => groupNames.get(g)).filter((n): n is string => !!n);

  /* the room door: a session is joinable from ten minutes before it starts until
     it ends — the same promise the client's Today card has always made. Outside
     that window the sheet says when the door opens rather than showing a button
     that would refuse. */
  const isRoom = occ.kind === 'session' || occ.kind === 'meeting';
  const isToday = occ.date === today;
  const live = isRoom && isToday && nowMin >= occ.startMin - 10 && nowMin < occ.startMin + occ.durMin;
  const ended = isRoom && isToday && nowMin >= occ.startMin + occ.durMin;

  const chip = (id: string) => {
    const name = byId.get(id)?.name ?? '';
    const mine = id === meId && occ.mine ? RESP[occ.mine] : null;
    return (
      <span className="chip" key={id}>
        <Avatar name={name} className="sm" /> {firstName(name)}
        {mine ? <Pill kind={mine.cls}>{mine.label}</Pill> : null}
      </span>
    );
  };

  return (
    <Sheet open onClose={onClose} label={occ.title}>
      <div className="h1">{occ.title}</div>
      <p className="sub" style={{ margin: 0 }}>
        {KINDS[occ.kind].name} · {dayName(occ.date)} <Num>{dayOfMonth(occ.date)}</Num> ·{' '}
        <Num>{fmtShortTime(occ.startMin)}</Num>–<Num>{fmtShortTime(occ.startMin + occ.durMin)}</Num>
        {occ.recurring ? ' · repeats' : ''}
        {occ.edited ? ' · this occurrence was modified' : ''}
      </p>

      {occ.clientId ? (
        <button
          type="button"
          className="trow click"
          onClick={() => {
            onClose();
            router.push(`/clients/${occ.clientId}`);
          }}
        >
          <Avatar name={clientName ?? ''} />
          {/* no inline flex on `.grow`: `.row .grow` is scoped to `.row`, and a
              `.trow` is not one — the demo's own row sizes to its content here */}
          <span className="grow">
            <b>{clientName ?? 'This client'}</b>
            <small>open the client 360</small>
          </span>
          <Icon name="chevR" />
        </button>
      ) : null}

      {grp ? (
        <>
          <div className="sec-title">
            Participants · <Num>{occ.resp.accepted}</Num>/<Num>{occ.resp.total}</Num>
            {occ.resp.confirmed ? ' · confirmed' : ' in'}
          </div>
          <div className="sch3-parts">{occ.people.map(chip)}</div>
          {gnames.length ? (
            <p className="sub" style={{ margin: 0 }}>
              via {gnames.join(', ')}
            </p>
          ) : null}
          {/* said out loud, because a row of names with no pills reads as "nobody
              has answered" rather than "the grid was not told" */}
          <p className="audit">
            The count is everybody’s answer; the pill is your own. The grid’s read carries no
            one else’s.
          </p>
        </>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {occ.people.map(chip)}
          {gnames.length ? <span className="sub">via {gnames.join(', ')}</span> : null}
        </div>
      )}

      {grp && amIn ? (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {RESP_ACTS.map(([state, label]) => (
            <button
              key={state}
              type="button"
              className={`btn sm${occ.mine === state ? '' : ' ghost'}`}
              aria-pressed={occ.mine === state}
              onClick={() => onRespond(state)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="btn sm ghost" onClick={onPropose}>
            Propose new time
          </button>
        </div>
      ) : null}

      {live && occ.link ? (
        <a className="btn block" href={occ.link} target="_blank" rel="noopener noreferrer">
          <LinkMark />
          Join the session room
        </a>
      ) : null}

      {isRoom && isToday && !live && !ended ? (
        <p className="sub" style={{ margin: 0 }}>
          Room opens at <Num>{fmtShortTime(occ.startMin - 10)}</Num>.
        </p>
      ) : null}

      {/* the pasted external link stays available as a secondary door for anyone
          whose team really is meeting somewhere else */}
      {occ.link && !live ? (
        <a className="btn ghost block" href={occ.link} target="_blank" rel="noopener noreferrer">
          <LinkMark />
          Open the external link
        </a>
      ) : null}

      {occ.notes ? <div className="notice">{occ.notes}</div> : null}

      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm quiet" onClick={onToggleDone}>
          {occ.done ? 'Mark not done' : 'Mark done'}
        </button>
        {occ.editable ? (
          <>
            <button type="button" className="btn sm ghost" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="btn sm ghost"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={onDelete}
            >
              Delete
            </button>
          </>
        ) : null}
        <button type="button" className="btn sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
