'use client';

import { useState, type ReactNode } from 'react';

import { Empty, IconTile } from '@/components/ui';
import { useClientLogs, type ClientDetail, type LogBucket } from '@/features/clients/queries';
import { ago, first } from './ScratchPad';

/**
 * LOGS — the record's merged timeline.
 *
 * Ported from console-client-record.js `logsHtml` + `collect`: every source the
 * record touches — the room, meals, moods, ticked sessions, the plan chain and
 * medical, plus the record's own acts — read once on the server (`GET
 * /clients/:id/logs`), merged newest-first and tagged a bucket.
 * "Derived from the log, not a second copy."
 *
 * THE CHIPS AND THE WINDOW ARE THE SERVER'S, NOT THE BROWSER'S, and that is a
 * change from the port's first pass. This tab used to read EVERY entry a record
 * had ever produced in one response and narrow it here — fine at fifty rows, and
 * a payload that grows without limit for the whole life of the client. Now the
 * filter travels as a query and the list arrives a page at a time.
 *
 * THE COUNTS STILL COME FROM THE SERVER, computed across the whole window before
 * paging, so a chip shows its true size before it is pressed and keeps showing
 * it on page three. Counting the rows in hand would make every chip shrink to
 * the size of the page — the failure the demo's own counts avoid.
 *
 * NOTHING IS SORTED HERE. The server answers newest-first; a second pass could
 * only disagree with the day headings it drives.
 */

const FILTERS: { k: 'all' | LogBucket; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'client', label: 'Client' },
  { k: 'team', label: 'Team' },
  { k: 'plan', label: 'Plan' },
  { k: 'medical', label: 'Medical' },
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Which day an entry belongs to, as a heading a person reads. */
function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(d);
  then.setHours(0, 0, 0, 0);
  const gap = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (gap <= 0) return 'Today';
  if (gap === 1) return 'Yesterday';
  const y = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MON[d.getMonth()]}${y}`;
}

export function LogsTab({ c }: { c: ClientDetail }) {
  const [bucket, setBucket] = useState<'all' | LogBucket>('all');
  /*
   * The window, held as the two strings the date inputs own.
   *
   * BOTH ENDS INCLUSIVE, which is the server's own reading — a `to` that
   * excluded its own day would drop everything the reader did on the day they
   * asked about, and that is the bug a naive `< to` produces every time.
   */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const q = useClientLogs(c.id, {
    bucket,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const pages = q.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.entries);
  /* the counts describe the WINDOW, so they come from any page — the first is
     the one that is always there */
  const counts = pages[0]?.counts;
  const total = pages[0]?.pagination.total ?? 0;

  const windowed = !!from || !!to;

  const chips = (
    <div className="tfil" role="group" aria-label="Filter the log">
      {FILTERS.map((f) => (
        <button
          key={f.k}
          type="button"
          className={bucket === f.k ? 'on' : ''}
          aria-pressed={bucket === f.k}
          onClick={() => setBucket(f.k)}
        >
          {f.label} <span className="num">{counts?.[f.k] ?? 0}</span>
        </button>
      ))}
    </div>
  );

  const dates = (
    <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', margin: 'var(--s2) 0' }}>
      <label className="row" style={{ gap: 'var(--s2)' }}>
        <small>From</small>
        <input
          type="date"
          className="input"
          value={from}
          /* a window cannot end before it starts, and the server 422s one that
             does — so the inputs bound each other rather than letting a reader
             build a request that is refused */
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="row" style={{ gap: 'var(--s2)' }}>
        <small>To</small>
        <input
          type="date"
          className="input"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      {windowed ? (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          Clear dates
        </button>
      ) : null}
    </div>
  );

  if (q.isLoading) {
    return (
      <div className="ccscroll">
        {chips}
        {dates}
        <Empty icon="clock" sentence="Reading the record…" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="ccscroll">
        {chips}
        {dates}
        <Empty icon="leaf" sentence="We could not read the log just now." />
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="ccscroll">
        {chips}
        {dates}
        {/*
          TWO DIFFERENT EMPTIES, because they are two different facts. A record
          with nothing in it is a new client; a record with nothing in THIS
          window is a filter the reader can widen. Printing "the log fills as
          they live their days" over a date range they chose would read as a
          broken tab.
        */}
        {bucket !== 'all' || windowed ? (
          <Empty
            icon="leaf"
            sentence="Nothing in the log matches these filters."
            sub="Widen the dates, or choose All above."
          />
        ) : (
          <Empty
            icon="leaf"
            sentence={`Nothing here yet — the log fills as ${first(c.name)} lives their days.`}
            sub="Everything the client does and everything the team does to their record lands here."
          />
        )}
      </div>
    );
  }

  /* one .list with day headings interleaved, exactly as the demo lays it out */
  const rows: ReactNode[] = [];
  let head: string | null = null;
  entries.forEach((e, i) => {
    const hd = dayHeading(e.at);
    if (hd !== head) {
      rows.push(
        <div className="sec-title" key={`h-${i}`}>
          {hd}
        </div>,
      );
      head = hd;
    }
    rows.push(
      <div className="trow" data-logkind={e.bucket} key={`${e.at}-${i}`}>
        <IconTile name={e.icon} className="sm" />
        <div className="grow">
          <b>{e.title}</b>
          {e.sub ? <small>{e.sub}</small> : null}
        </div>
        <small className="num" style={{ flex: 'none' }}>
          {ago(e.at)}
        </small>
      </div>,
    );
  });

  return (
    <div className="ccscroll">
      {chips}
      {dates}
      <div className="list">{rows}</div>

      {/* whether there is more is a fact about the database — the server hands
          back a cursor only when there genuinely is */}
      {q.hasNextPage ? (
        <div className="retry">
          <button
            type="button"
            className="btn ghost"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? 'Loading…' : `Show older (${total - entries.length} more)`}
          </button>
        </div>
      ) : null}

      <p className="audit">
        Everything this client has done and everything the team has done to their record — newest first.
        Derived from the log, not a second copy of it.
      </p>
    </div>
  );
}
