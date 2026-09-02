'use client';

import { Empty, Notice, SkeletonRows } from '@/components/ui';
import { useClientEmotions, type MoodPoint } from '@/features/clients/queries';

/**
 * The Emotions tab — the client's own arrival check-ins.
 *
 * Ported from the demo's "Mood, day by day". Every morning the client answers
 * "How are you arriving?" and may add a line about why; this is the other end of
 * that, read by the people responsible for them.
 *
 * SCOPE IS THE GATE, not a permission. A coach sees the check-ins of the clients
 * on their pod, a Super Admin sees everyone's — the same rule as the rest of the
 * record. Nothing on this screen writes: a mood belongs to the person who felt it,
 * and the console has no business editing one.
 *
 * FOUR MOODS, ON A DELIBERATE ORDER. `happy` at the top and `angry` at the bottom
 * is not a ranking of how a person should feel — it is what makes a fall legible
 * as a fall when you glance at the line. The demo's own axis reads the same way.
 */

/** Top to bottom, as the axis prints them. */
const SCALE = [
  { key: 'happy', label: 'Happy' },
  { key: 'drained', label: 'Drained' },
  { key: 'sad', label: 'Sad' },
  { key: 'angry', label: 'Angry' },
] as const;

/* keyed by plain string: `mood` arrives from the server, and a mood key this
   console does not know must fall through as "unplottable" rather than fail to
   compile against a literal union that is really the SERVER's vocabulary */
const ROW_OF = new Map<string, number>(SCALE.map((m, i) => [m.key, i]));
const LABEL_OF = new Map<string, string>(SCALE.map((m) => [m.key, m.label]));

/** 8:15 pm — the demo's own clock format. */
function clock(iso: string): string {
  const d = new Date(iso);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

const dayLabel = (m: MoodPoint) => `C${m.cycle} · D${m.day}`;

export function EmotionsTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, error, refetch } = useClientEmotions(clientId);

  if (isLoading) return <SkeletonRows rows={3} height={96} />;

  if (isError || !data) {
    return (
      <Notice kind="bad">
        {(error as Error | undefined)?.message ?? 'Could not read these check-ins.'}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Notice>
    );
  }

  if (!data.series.length) {
    return (
      <div className="ccscroll">
        <Empty
          icon="smile"
          sentence="No arrival check-ins yet."
          sub="They appear here the morning after the client first answers “How are you arriving?” in the app."
        />
      </div>
    );
  }

  return (
    <div className="ccscroll">
      <div className="card">
        <b>Mood, day by day</b>
        <p className="sub" style={{ marginTop: 'var(--s1)' }}>
          Every arrival check-in, one per day, oldest first. Hover a point for the note behind it.
        </p>
        <MoodChart series={data.series} />
        <div className="audit">Self-reported at arrival · times are the client’s own clock</div>
      </div>

      <div className="sec-title">Notes behind the check-ins</div>
      {data.notes.length ? (
        <div className="list">
          {data.notes.map((m) => (
            <div className="trow" key={m.id}>
              <div className="grow">
                <b>
                  {LABEL_OF.get(m.mood) ?? m.mood} · {clock(m.at)}
                </b>
                <small>
                  {dayLabel(m)} — {m.note}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* moods without notes are not an empty state — the check-ins exist, the
           client simply chose not to write, which the sheet explicitly allows */
        <Empty
          icon="smile"
          sentence="No notes yet."
          sub="The line is optional — these check-ins are moods without one."
        />
      )}
    </div>
  );
}

/**
 * The line, drawn as SVG.
 *
 * NO CHART LIBRARY. Four rows and at most a few dozen points is a polyline and
 * some circles; pulling in a charting package for it would add a bundle and a
 * second styling language to keep in step with the rest of the console.
 *
 * The viewBox scales to the container so it stays readable at any panel width,
 * and every point carries a `<title>` so the note is reachable by hover and by a
 * screen reader without a tooltip layer.
 */
function MoodChart({ series }: { series: MoodPoint[] }) {
  const W = 720;
  const H = 200;
  const padL = 66;
  const padR = 16;
  const padT = 16;
  const padB = 34;

  const rows = SCALE.length;
  const rowY = (i: number) => padT + ((H - padT - padB) * i) / (rows - 1);
  /* a single check-in has no span to divide, so it sits at the left rather than
     dividing by zero and vanishing */
  const stepX = series.length > 1 ? (W - padL - padR) / (series.length - 1) : 0;
  const pointX = (i: number) => padL + stepX * i;

  const pts = series
    .map((m, i) => {
      const row = ROW_OF.get(m.mood);
      return row === undefined ? null : `${pointX(i)},${rowY(row)}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <div style={{ overflowX: 'auto', marginTop: 'var(--s3)' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 480, height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Mood across ${series.length} check-ins`}
      >
        {SCALE.map((m, i) => (
          <g key={m.key}>
            <text
              x={padL - 12}
              y={rowY(i) + 4}
              textAnchor="end"
              fontSize="12"
              fill="var(--ink-3)"
            >
              {m.label}
            </text>
            <line
              x1={padL}
              y1={rowY(i)}
              x2={W - padR}
              y2={rowY(i)}
              stroke="var(--line-soft)"
              strokeWidth="1"
            />
          </g>
        ))}

        <polyline
          points={pts}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {series.map((m, i) => {
          const row = ROW_OF.get(m.mood);
          if (row === undefined) return null;
          return (
            <g key={m.id}>
              <circle
                cx={pointX(i)}
                cy={rowY(row)}
                r="5"
                fill="var(--surface)"
                stroke="var(--brand)"
                strokeWidth="2"
              />
              <title>
                {`${dayLabel(m)} · ${LABEL_OF.get(m.mood) ?? m.mood} · ${clock(m.at)}`}
                {m.note ? ` — ${m.note}` : ''}
              </title>
            </g>
          );
        })}

        {/* the day under each point, thinned so the axis never collides with
            itself once a client has a couple of cycles behind them */}
        {series.map((m, i) => {
          const every = Math.ceil(series.length / 8);
          if (i % every !== 0 && i !== series.length - 1) return null;
          return (
            <text
              key={m.id}
              x={pointX(i)}
              y={H - 12}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-3)"
            >
              {dayLabel(m)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
