'use client';

import { useState } from 'react';
import { MIN_TYPED_NOTE, MIN_VOICE_SEC, ratingNoteSatisfied } from '@haalving/shared';

import { AiDraft, Audit, Avatar, Gate, Num, Pill, SkeletonRows, Stars, useToast } from '@/components/ui';
import { assetUrl } from '@/lib/api';
import { useCan } from '@/lib/can';
import { Icon } from '@/components/icons/Icon';
import { useMeals, useRateMeal, type MealRow, type MealsData } from '@/features/queues/queries';

/**
 * Meals — the dietitian's signature surface.
 *
 * Ported from console-meals.js.
 *
 * NO AUTO-PUBLISH, EVER. The copilot reads the plate and offers a number; a
 * human confirms it or overrides it, and only the confirmed one is ever shown to
 * the client. The pre-score is drawn as GHOST STARS BEHIND the choice rather
 * than as a value in the same control, because one number could not hold both at
 * once and a screen that merged them would let the AI's guess be published by
 * accident.
 *
 * A CLIENT IN THEIR OBSERVATION WINDOW is capture-only: the rating is recorded
 * for the team, the client is shown nothing, and the button says so.
 *
 * BELOW FIVE STARS NEEDS A NOTE — voice, or 120 typed characters. The button
 * disables until then, and the server asks the same question before it writes:
 * "three stars" with nothing said about why is the outcome this screen exists to
 * prevent.
 */

/** Live against the ladder in Configuration, so a Service-tab edit lands here. */
function SlaPill({ m }: { m: MealRow }) {
  if (!m.sla) return <Pill kind="neutral">No SLA</Pill>;
  if (m.sla.leftMin < 0) {
    return <Pill kind="bad">Overdue{m.sla.escalated ? ' · escalated' : ''}</Pill>;
  }
  return (
    <span className={`pill ${m.sla.leftMin < 5 ? 'warn' : 'ok'}`}>
      Reply due · <Num>{m.sla.leftMin}</Num>&nbsp;min
    </span>
  );
}

function MealArt({ m, size }: { m: MealRow; size: 'sm' | 'lg' }) {
  const box =
    size === 'sm'
      ? { width: 44, height: 44, borderRadius: 'var(--r2)' }
      : { width: '100%', height: 200, borderRadius: 'var(--r3)' };

  if (!m.photo) {
    return (
      <span className="icon-tile" aria-hidden="true" style={box}>
        <Icon name="camera" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      /* the API hands back one of two things — a signed R2 URL for a photo a
         phone took, or a seeded `img/...` path served off the API's own origin.
         `assetUrl` is the single place that knows the difference; this used to
         prefix "/" and pointed the seeded half at the console instead. */
      src={assetUrl(m.photo) ?? undefined}
      alt={`${m.slot} — ${m.dishes.join(', ')}`}
      style={{ ...box, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/* ghost stars = the AI's pre-score, shown only while nothing has been chosen */
function StarInput({
  ghost,
  chosen,
  onPick,
}: {
  /** Null when nothing has pre-scored the plate — then there are no ghosts to draw. */
  ghost: number | null;
  chosen: number | null;
  onPick: (n: number) => void;
}) {
  return (
    <span className="stars rate" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((i) => {
        const cls = chosen ? (i <= chosen ? '' : 'off') : ghost != null && i <= ghost ? 'ghost-star' : 'off';
        return (
          <button
            type="button"
            key={i}
            className={cls}
            aria-label={`${i} stars`}
            onClick={() => onPick(i)}
          >
            <Icon name="star" />
          </button>
        );
      })}
    </span>
  );
}

/* -------------------------------------------------------------- the composer */

function ReviewPane({ m }: { m: MealRow }) {
  /*
   * WHO HOLDS THE PEN. The coach on that client's pod rates the plate; the
   * Super Admin and the oversight seats read the same pane and cannot write to
   * it. That is not decoration — the meal SLA escalates TO admin, and an
   * escalation that lands on the seat already able to rate escalates nothing.
   *
   * The server refuses them too, twice. This only decides what a monitor is
   * shown, and the honest rendering of a control you may not use is its
   * absence rather than a disabled copy of it.
   */
  const canRate = useCan('rateMeals');

  const rate = useRateMeal();
  const toast = useToast();

  const [chosen, setChosen] = useState<number | null>(null);
  const [voiceRec, setVoiceRec] = useState(false);
  const [typed, setTyped] = useState('');

  const voiceSec = voiceRec ? 14 : 0;
  const ready = chosen != null && ratingNoteSatisfied(chosen, voiceSec, typed);
  const first = m.client.name.split(' ')[0];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {m.client.observation ? (
        <div className="notice warn">
          Observation — rating recorded for the team; the client sees capture-only
        </div>
      ) : null}

      <div className="row">
        <Avatar name={m.client.name} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{m.client.name}</b>
          <small className="sub" style={{ display: 'block' }}>
            {m.slot} · captured {minutesAgo(m.capturedAt)}
          </small>
        </span>
        <SlaPill m={m} />
      </div>

      <MealArt m={m} size="lg" />

      <div className="notice">
        <b>On the plate:</b> {m.dishes.join(' · ')}
        <br />
        <b>Client felt:</b> {m.fullness}
      </div>

      {/*
        NO PRE-SCORE IS A STATE, NOT A BLANK.

        `Meal.aiStars` is null until something scores the plate, and nothing does
        yet — a meal captured on a phone arrives unscored. Rendering the same
        sentence with the numbers missing produced "AI suggests  stars ( %
        confidence). Detected: . Note:", which reads as a broken panel and quietly
        invites the dietitian to wonder what the AI saw. Saying there is no
        pre-score is both true and shorter.
      */}
      <AiDraft>
        {m.ai.stars == null ? (
          <>
            <b>No AI pre-score for this plate.</b> Nothing has scored it — rate it on what you can
            see. Your stars are the only rating this client will ever receive.
          </>
        ) : (
          <>
            <b>AI pre-score, never client-visible.</b> AI suggests <Num>{m.ai.stars}</Num> stars
            {m.ai.conf == null ? null : (
              <>
                {' '}
                (<Num>{m.ai.conf}</Num>% confidence)
              </>
            )}
            .{m.ai.detected.length ? <> Detected: {m.ai.detected.join(', ')}.</> : null}
            {m.ai.note ? <> Note: {m.ai.note}</> : null}
          </>
        )}
      </AiDraft>

      {canRate ? (
        <div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <StarInput ghost={m.ai.stars} chosen={chosen} onPick={setChosen} />
            {/* the legend explains the ghosts; with no pre-score there are none
                to explain, and the line would point at something not drawn */}
            {m.ai.stars != null ? <span className="sub">ghost stars = AI pre-score</span> : null}
          </div>
          <Audit>
            {m.ai.stars == null
              ? 'Tap a star. Nothing pre-scored this plate, so this is the rating.'
              : chosen == null
                ? 'Tap a star — one tap confirms the pre-score, a different star overrides.'
                : chosen === m.ai.stars
                  ? 'Confirms the AI pre-score — logged as one-tap confirm.'
                  : 'Override vs AI pre-score will be logged.'}
          </Audit>
        </div>
      ) : (
        <div className="notice">
          <b>Monitoring</b> — the assigned coach rates this plate. You are seeing it
          because the meal clock escalates to you.
        </div>
      )}

      {/*
       * THE MACROS EDITOR IS NOT HERE, and its absence is deliberate rather than
       * missed. The demo lets a dietitian correct protein and kcal on this pane;
       * `POST /queues/meals/:id/rate` accepts stars, note and voiceSec and
       * nothing else, so the two inputs would take a correction and silently drop
       * it. The numbers are shown as read for now.
       */}
      {/*
       * ZERO AND ZERO MEANS NOBODY COUNTED, and it must not be printed as a
       * reading.
       *
       * `Meal.protein` and `Meal.kcal` are `Int @default(0)`, so a plate nothing
       * has estimated is stored as 0/0 and is indistinguishable in the column
       * from a plate genuinely worth nothing. Rendering "Auto-estimated at
       * capture — 0 g protein · 0 kcal" over a photograph of dal and rice states
       * a measurement that was never taken, which is exactly what the schema's
       * own note on `aiStars` refuses to do: a fabricated assessment in front of
       * the dietitian who has to rate it.
       *
       * The honest reading of 0/0 is "not estimated". A real all-zero plate does
       * not exist, so nothing true is lost by saying so. (The lasting fix is to
       * make these columns nullable, as `aiStars` is — that is a migration and a
       * decision about stored data, not a rendering choice.)
       */}
      <Audit>
        {m.protein === 0 && m.kcal === 0 ? (
          <>Not estimated — nothing has counted this plate yet.</>
        ) : (
          <>
            Auto-estimated at capture — <Num>{m.protein}</Num> g protein · <Num>{m.kcal}</Num> kcal
          </>
        )}
      </Audit>

      {chosen != null && chosen < 5 ? (
        <div>
          <div className="card-title" style={{ marginBottom: 'var(--s2)' }}>
            Coaching note · required below 5 stars
          </div>
          {voiceRec ? (
            <>
              <div className="row">
                <div style={{ flex: 1, minWidth: 0 }} className="sub">
                  Voice note recorded
                </div>
                <button type="button" className="btn ghost sm" onClick={() => setVoiceRec(false)}>
                  Re-record
                </button>
              </div>
              <Audit>
                Recorded 0:14 · <Num>{MIN_VOICE_SEC}</Num> s min · <Num>30</Num> s cap
              </Audit>
            </>
          ) : (
            <div className="row">
              <button type="button" className="btn quiet sm" onClick={() => setVoiceRec(true)}>
                <Icon name="mic" />
                Record voice note
              </button>
              <span className="audit">
                <Num>{MIN_VOICE_SEC}</Num> s min · <Num>30</Num> s cap
              </span>
            </div>
          )}
          <details style={{ marginTop: 'var(--s2)' }}>
            <summary
              className="sub"
              style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 600 }}
            >
              typed fallback (logged accessibility exception)
            </summary>
            <textarea
              className="input"
              rows={3}
              style={{ marginTop: 'var(--s2)' }}
              aria-label="Typed coaching note"
              placeholder="A warm, specific note — minimum 120 characters, so it lands the way a voice note would."
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <Audit>
              <Num>{typed.length}</Num> / <Num>{MIN_TYPED_NOTE}</Num> characters minimum · logged as
              accessibility exception
            </Audit>
          </details>
        </div>
      ) : chosen === 5 ? (
        <Audit>A perfect plate needs no correction note. One tap publishes the celebration.</Audit>
      ) : null}

      {canRate ? (
        <>
          <button
            type="button"
            className="btn block"
            disabled={!ready || rate.isPending}
            onClick={() =>
              chosen != null &&
              rate.mutate(
                {
                  id: m.id,
                  stars: chosen,
                  note: typed.trim() || undefined,
                  voiceSec: voiceRec ? voiceSec : undefined,
                },
                {
                  onSuccess: () =>
                    toast(
                      m.client.observation
                        ? 'Recorded for the team — the client sees capture-only.'
                        : `Published to ${first}.`,
                    ),
                  onError: (e) => toast((e as Error).message),
                },
              )
            }
          >
            {m.client.observation ? 'Record rating (team only)' : `Publish rating to ${first}`}
          </button>
          <Audit>No auto-publish, ever — the client only sees your human-confirmed rating.</Audit>
        </>
      ) : null}
    </div>
  );
}

/* status-by-exception: a met line stays silent, only a miss carries the flag */
function RatedCard({ m }: { m: MealRow }) {
  const rubric = (m.final?.rubric ?? {}) as Record<string, string>;
  const tiles = Object.entries(rubric).filter(
    ([, v]) => typeof v === 'string' && /^\d+\s*\/\s*\d+/.test(v),
  );

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div className="row">
        <MealArt m={m} size="sm" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{m.client.name}</b> — {m.slot}
          <small style={{ display: 'block' }}>
            captured {minutesAgo(m.capturedAt)}
            {m.final?.byAi ? ' · rated by your AI coach' : m.final?.by ? ` · ${m.final.by.name}` : ''}
          </small>
        </span>
        {m.final ? <Stars n={m.final.stars} /> : null}
      </div>
      {tiles.length ? (
        <div className="gate-grid">
          {tiles.map(([k, v]) => (
            <Gate
              key={k}
              icon="check"
              name={k}
              meta={v}
              {...(v.startsWith('0 /') ? { missLabel: v } : {})}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MealsBoard() {
  const { data, isLoading } = useMeals();
  const [selId, setSelId] = useState<string | null>(null);

  if (isLoading) return <SkeletonRows rows={4} height={96} />;
  if (!data) return null;

  const d: MealsData = data;
  const queue = d.awaiting;
  const current = queue.find((m) => m.id === selId) ?? queue[0] ?? null;

  const header = (
    <>
      <div className="grid3">
        <div className="stat">
          <div className="k">Waiting</div>
          <div className="v num">{queue.length}</div>
          <div className="sub">photos in the queue</div>
        </div>
        <div className="stat">
          <div className="k">Past reply target</div>
          <div className={`v num${d.breached ? ' bad' : ''}`}>{d.breached}</div>
          <div className="sub">{d.breached ? 'escalation notices sent' : 'none right now'}</div>
        </div>
        <div className="stat">
          <div className="k">Escalated</div>
          <div className={`v num${d.escalated ? ' bad' : ''}`}>{d.escalated}</div>
          <div className="sub">past the ladder's last step</div>
        </div>
      </div>
      {/* the ladder as configured — read live, so this line moves when Ops moves it */}
      <Audit>
        <Num>{d.ladder.replyTargetMin}</Num> min reply target · nudge at{' '}
        <Num>{d.ladder.notifyAfterMin}</Num> · escalate at <Num>{d.ladder.escalateAtMin}</Num> · to{' '}
        {d.ladder.escalateToRole}
      </Audit>
    </>
  );

  const ratedSection = d.rated.length ? (
    <>
      <div className="sec-title" style={{ marginTop: 'var(--s5)' }}>
        Rated recently
      </div>
      <div className="list">
        {d.rated.map((m) => (
          <RatedCard key={m.id} m={m} />
        ))}
      </div>
    </>
  ) : null;

  if (!queue.length) {
    return (
      <>
        {header}
        <div className="empty">
          <span className="big">
            <Icon name="check" />
          </span>
          Every photo has been rated.
        </div>
        {ratedSection}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="split">
        <div>
          <div className="sec-title">Waiting for review</div>
          <div className="list">
            {queue.map((m) => {
              const sel = m.id === current?.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  className="trow click"
                  {...(sel ? { 'aria-current': 'true' as const } : {})}
                  style={
                    sel
                      ? {
                          boxShadow: 'inset 0 0 0 1.5px var(--brand)',
                          background: 'var(--brand-wash)',
                        }
                      : undefined
                  }
                  onClick={() => setSelId(m.id)}
                >
                  <MealArt m={m} size="sm" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{m.client.name}</b> — {m.slot}
                    <small style={{ display: 'block' }}>captured {minutesAgo(m.capturedAt)}</small>
                  </span>
                  <SlaPill m={m} />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="sec-title">Review &amp; rating composer</div>
          {/* keyed on the meal so switching rows resets the stars and the note —
              a choice carried from one plate to the next is a rating nobody made */}
          {current ? <ReviewPane key={current.id} m={current} /> : null}
        </div>
      </div>
      {ratedSection}
    </>
  );
}
