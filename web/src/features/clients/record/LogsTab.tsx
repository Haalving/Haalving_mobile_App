'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { Empty, IconTile } from '@/components/ui';
import { useClientLogs, type ClientDetail, type LogBucket } from '@/features/clients/queries';
import { ago, first } from './ScratchPad';

/**
 * LOGS — the record's merged timeline.
 *
 * Ported from console-client-record.js `logsHtml` + `collect`: every source the
 * record touches — the room, meals, moods, ticked sessions, the plan chain and
 * medical, plus the record's own acts — read once on the server (`GET
 * /clients/:id/logs`), merged newest-first and tagged a bucket. The chips filter
 * client-side over the one payload; the counts come from the server so a chip
 * shows its total before it is pressed. "Derived from the log, not a second copy."
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
  const { data, isLoading, isError } = useClientLogs(c.id);
  const [filter, setFilter] = useState<'all' | LogBucket>('all');

  const visible = useMemo(
    () => (!data ? [] : filter === 'all' ? data.entries : data.entries.filter((e) => e.bucket === filter)),
    [data, filter],
  );

  const chips = (
    <div className="tfil" role="group" aria-label="Filter the log">
      {FILTERS.map((f) => (
        <button
          key={f.k}
          type="button"
          className={filter === f.k ? 'on' : ''}
          aria-pressed={filter === f.k}
          onClick={() => setFilter(f.k)}
        >
          {f.label} <span className="num">{data?.counts[f.k] ?? 0}</span>
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="ccscroll">
        {chips}
        <Empty icon="clock" sentence="Reading the record…" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ccscroll">
        <Empty icon="leaf" sentence="We could not read the log just now." />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="ccscroll">
        {chips}
        <Empty
          icon="leaf"
          sentence={`Nothing here yet — the log fills as ${first(c.name)} lives their days.`}
          sub="Everything the client does and everything the team does to their record lands here."
        />
      </div>
    );
  }

  /* one .list with day headings interleaved, exactly as the demo lays it out */
  const rows: ReactNode[] = [];
  let head: string | null = null;
  visible.forEach((e, i) => {
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
      <div className="list">{rows}</div>
      <p className="audit">
        Everything this client has done and everything the team has done to their record — newest first.
        Derived from the log, not a second copy of it.
      </p>
    </div>
  );
}
