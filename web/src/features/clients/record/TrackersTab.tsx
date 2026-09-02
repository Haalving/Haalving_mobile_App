'use client';

import { Audit, Empty, Num, Ring, SecTitle } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useClientTrackers, type ClientDetail } from '@/features/clients/queries';
import { first } from './ScratchPad';

/**
 * TRACKERS — what the client logs in the app, read back by the team.
 *
 * The four cards (water, steps, sleep, meals) come straight from the client's
 * Quick-add sheet in the mobile app — this tab is the console end of the same
 * store, so a coach sees the day as the client is living it. The session rings
 * are the level-review engine's own numbers (fitness/yoga/mind), NOT a second
 * copy — `GET /clients/:id/trackers` reads both from the one client row.
 *
 * The cards render even at zero: a blank "0 / 8" is a true reading of a day not
 * yet lived, and hiding it would make an untracked morning look like a bug.
 */

/** Each card's hairline mark — the app's own vocabulary for the four readings. */
const CARD_ICON: Record<string, string> = {
  water: 'drop',
  steps: 'walk',
  sleep: 'moon',
  meals: 'cutlery',
};

export function TrackersTab({ c }: { c: ClientDetail }) {
  const { data, isLoading, isError } = useClientTrackers(c.id);

  if (isLoading) {
    return (
      <div className="ccscroll">
        <Empty icon="clock" sentence="Reading the trackers…" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ccscroll">
        <Empty icon="leaf" sentence="We could not read the trackers just now." />
      </div>
    );
  }

  return (
    <div className="ccscroll">
      <div className="card">
        <SecTitle>Today</SecTitle>
        <div className="grid2">
          {data.cards.map((card) => (
            <div className="stat" key={card.key}>
              <div className="k">
                <Icon name={CARD_ICON[card.key] ?? 'gauge'} /> {card.label}
              </div>
              <div className="v num">{card.value}</div>
              <small className="sub">{card.sub}</small>
            </div>
          ))}
        </div>
        <Audit>
          What {first(c.name)} logged in the app today — water, steps, sleep and meals. It fills as the
          day is lived.
        </Audit>
      </div>

      {data.sessions.length ? (
        <div className="card">
          <SecTitle>Sessions this cycle</SecTitle>
          <div className="trrings">
            {data.sessions.map((s) => (
              <div className="trring" key={s.pillar}>
                <Ring
                  pct={s.target ? (s.done / s.target) * 100 : 0}
                  colorVar={s.pillar}
                  label={`${s.done}/${s.target}`}
                  size="lg"
                />
                <div className="k">{s.label}</div>
              </div>
            ))}
          </div>
          {data.compliance != null ? (
            <Audit>
              <Num>{data.compliance}</Num>% of the plan kept last cycle.
            </Audit>
          ) : (
            <Audit>Observation — nothing to comply with yet.</Audit>
          )}
        </div>
      ) : null}

      <style>{`
        .trrings { display: flex; gap: var(--s5); flex-wrap: wrap; padding: var(--s2) 0; }
        .trring { display: flex; flex-direction: column; align-items: center; gap: var(--s2); }
        .stat .sub { display: block; margin-top: 2px; }
      `}</style>
    </div>
  );
}
