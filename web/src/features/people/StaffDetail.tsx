'use client';

import { Fragment, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { availWindows, fmtTime, tagTone, type Weekday } from '@haalving/shared';

import {
  Audit,
  Avatar,
  Empty,
  IconTile,
  Notice,
  Num,
  Pill,
  SecTitle,
  Sheet,
  SkeletonRows,
  Trow,
} from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useCan } from '@/lib/can';
import { useStaffMember, type Availability } from '@/features/people/queries';

/**
 * The employee record — `openStaffDetail` (console-people.js:511).
 *
 * TAPPING A NAME OPENS THIS, NOT THE EDIT SHEET. Reading who somebody is and
 * rewriting them are two different intentions, and the demo separates them: the
 * name is the record, the pencil is the form. A board where the only way to look
 * at a person is to open their edit form teaches people to cancel out of forms.
 *
 * ONE SECTION IS OURS, not the demo's: ALLOCATED CLIENTS. The demo's record
 * printed a bare `Allocated 4` and left you to guess which four; this lists them,
 * with the seat each one was taken on, and each row opens that client.
 *
 * WHAT IS MISSING IS MISSING ON PURPOSE. `/people/staff/:id` DELETES `emergency`,
 * `memo` and `cvName` for a reader without `managePeople` — the absence is the
 * redaction. So those rows are drawn from the keys being THERE, never from a
 * permission test in the browser: a field the browser was sent is a field the
 * browser has, and a field it was not sent must not leave an empty row behind.
 */

/* the week as people say it, not as Date#getDay() numbers it */
const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** `14 Jun 2021`. Sliced to ten characters so a timestamp cannot shift the day. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Whole months since the joining date — `5 y 2 m`, or null under a month. */
function tenure(iso: string | null | undefined): { y: number; m: number } | null {
  if (!iso) return null;
  const a = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime())) return null;
  const b = new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 1) return null;
  return { y: Math.floor(months / 12), m: months % 12 };
}

/** `+5:30`. A MINUS SIGN, not a hyphen — the offset is arithmetic, not a dash. */
function fmtTzo(tzo: number | null | undefined): string {
  const n = tzo ?? 5.5;
  const abs = Math.abs(n);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${n < 0 ? '−' : '+'}${h}:${String(m).padStart(2, '0')}`;
}

/**
 * One cell a day, one time PAIR per shift inside it.
 *
 * A split shift stacks two pairs and reads as the two blocks of work it is.
 * Joining the raw array printed `06:00,10:00–17:00,21:00`, which is neither.
 */
function WeekStrip({ avail }: { avail: Availability | undefined }) {
  const user = { id: 'strip', name: 'strip', avail };
  return (
    <div className="pa2-week">
      {WEEK.map((d) => {
        const wins = availWindows(user, d);
        return (
          <div key={d} className={`pa2-day${wins.length ? '' : ' pa2-off'}`}>
            <small>
              <b>{DAY_NAMES[d]}</b>
            </small>
            {wins.length ? (
              wins.map(([a, b], i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <small className="pa2-split" aria-hidden="true">
                      ·
                    </small>
                  ) : null}
                  <small className="num">{fmtTime(a)}</small>
                  <small className="num">{fmtTime(b)}</small>
                </Fragment>
              ))
            ) : (
              <small>Off</small>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The demo's `drow`: an icon tile, the value in bold, its label beneath. */
function DRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return <Trow lead={<IconTile name={icon} className="sm" />} title={children} sub={label} />;
}

export function StaffDetail({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  /** Absent for a reader who cannot edit — the footer button goes with it. */
  onEdit?: () => void;
}) {
  const router = useRouter();
  const canManage = useCan('managePeople');
  const { data, isLoading, isError, error } = useStaffMember(id);

  const go = (clientId: string) => {
    onClose();
    router.push(`/clients/${clientId}`);
  };

  if (isLoading || (!data && !isError)) {
    return (
      <Sheet open onClose={onClose} variant="tall" label="Employee record">
        <div className="h1">Employee record</div>
        <SkeletonRows rows={5} height={64} />
      </Sheet>
    );
  }

  if (!data) {
    return (
      <Sheet open onClose={onClose} variant="tall" label="Employee record">
        <div className="h1">Employee record</div>
        <Notice kind="bad">{(error as Error | null)?.message ?? 'That record would not open.'}</Notice>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s4)' }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </Sheet>
    );
  }

  /* the redaction, read as the server wrote it — see the header comment */
  const full = 'emergency' in data;
  const ten = tenure(data.joinedAt);
  const em = data.emergency ?? null;
  const clients = data.clients ?? [];
  const hidden = data.clientsHidden ?? 0;
  /* the leave RECORD is Time & Cover's and does not travel on this row, so the
     notice says the fact the tag carries and does not invent the dates */
  const onLeave = data.tags.includes('On leave');

  return (
    <Sheet open onClose={onClose} variant="tall" label={`${data.name} — employee record`}>
      <div className="row" style={{ gap: 'var(--s3)', alignItems: 'center' }}>
        <Avatar name={data.name} className="lg" />
        <span className="grow">
          <div className="h1">{data.name}</div>
          <p className="sub" style={{ margin: 0 }}>
            {data.roleTitle || '—'}
            {data.subtitle ? ` · ${data.subtitle}` : ''}
          </p>
        </span>
      </div>

      <div
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--s2)', marginTop: 'var(--s2)' }}
      >
        <Pill kind="neutral">
          <Num>L{data.level ?? 2}</Num>
        </Pill>
        {data.deptLabel ? <span className="chip">{data.deptLabel}</span> : null}
        {data.tags.map((t) => (
          <Pill key={t} kind={tagTone(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {onLeave ? (
        <Notice kind="warn">On approved leave — Time &amp; Cover names the cover.</Notice>
      ) : null}

      <div className="list" style={{ marginTop: 'var(--s3)' }}>
        <DRow icon="cal" label="Joined">
          <Num>{fmtDate(data.joinedAt)}</Num>
          {ten ? (
            <>
              {' · '}
              {ten.y ? (
                <>
                  <Num>{ten.y}</Num> y{' '}
                </>
              ) : null}
              {ten.m ? (
                <>
                  <Num>{ten.m}</Num> m{' '}
                </>
              ) : null}
              with us
            </>
          ) : data.joinedAt ? (
            ' · joined this month'
          ) : null}
        </DRow>

        <DRow icon="clock" label="Timezone">
          {data.tzLabel || 'IST'} · UTC<Num>{fmtTzo(data.tzo)}</Num>
        </DRow>

        {full ? (
          <DRow icon="phone" label="Emergency contact">
            {em && (em.name || em.phone) ? (
              <>
                {em.name}
                {em.phone ? (
                  <>
                    {em.name ? ' · ' : ''}
                    <Num>{em.phone}</Num>
                  </>
                ) : null}
              </>
            ) : (
              'Not on record'
            )}
          </DRow>
        ) : null}

        {full ? (
          <DRow icon="doc" label="CV on file">
            {data.cvName ? data.cvName : 'None on file'}
          </DRow>
        ) : null}
      </div>

      {data.memo ? <Notice>{data.memo}</Notice> : null}

      <SecTitle>Allocated clients</SecTitle>
      {/* SEATED ON, NOT ABLE TO SEE — the two numbers differ and the difference
          confuses people. A Super Admin holds `seeAllClients` and can open every
          record in the building, while sitting in the pod of only a handful. This
          list, and the Allocated column it belongs to, count the SEAT. */}
      <Audit>
        The clients whose pod {data.name} sits on. Who they may open is a separate
        question — a Super Admin reads every record either way.
      </Audit>
      {clients.length ? (
        <div className="list">
          {clients.map((c) => (
            <Trow
              key={c.id}
              lead={<Avatar name={c.name} />}
              title={c.name}
              sub={c.seatLabel || c.seat}
              /* status is worth a word only when it is not the ordinary one —
                 a pill on every row would say "active" twelve times */
              trailing={c.status && c.status !== 'active' ? <Pill kind="warn">{c.status}</Pill> : null}
              onClick={() => go(c.id)}
            />
          ))}
        </div>
      ) : (
        <Empty icon="users" sentence="Nobody is allocated to them yet." />
      )}
      {hidden > 0 ? (
        <Audit>
          <Num>{hidden}</Num> more are outside what you can see.
        </Audit>
      ) : null}

      <SecTitle>Availability</SecTitle>
      <WeekStrip avail={data.avail} />
      <Audit>The coach paints this week themselves in Time &amp; Cover — read-only here.</Audit>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s4)' }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
        {canManage && onEdit ? (
          <button type="button" className="btn" onClick={onEdit}>
            <Icon name="pencil" /> Edit record
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
