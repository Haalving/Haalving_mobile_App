import { cycleDays } from '@haalving/shared';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';

import { useMe, useToday, type Meal, type Session } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { DayNav } from '@/components/client/DayNav';
import { ArriveBand, FilmMark, StreakBand } from '@/components/client/TodayBands';
import {
  PILLAR_ORDER,
  PillarBand,
  PillarEmpty,
  PillarGroup,
  PillarItem,
  type PillarKey,
} from '@/components/client/PillarGroup';
import { SceneBand } from '@/components/client/SceneBand';
import { Card, Chip, Notice, Pill } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * TODAY — the daily front door (`views/client-today.js`, TD-01).
 *
 * Today's sessions from the four pillars, and the plate. No scores: the HAALVING
 * Index lives on Journey, and logging lives on Trackers. The demo is emphatic
 * about that boundary, and its comment says why — Today is the to-do list, so
 * cycle progress belongs on Plan and standing targets belong on Trackers.
 *
 * OBSERVATION IS A DIFFERENT SCREEN, not a filtered one. Days 1 to 5 have no
 * sessions because none exist yet, and the server answers a different shape
 * (`client-app/index.ts:185`) rather than an empty list. An empty list would read
 * as a coach who forgot; the banner says what is actually happening.
 *
 * A DAY YOU BROWSED TO IS A GLANCE, not a place you should be returned to. The
 * browsed day therefore lives in screen state and is never persisted — re-opening
 * the tab always lands on today, exactly as the demo's route-carried day does.
 *
 * WHAT IS NOT HERE YET, and why it is absent rather than faked:
 *   - the streak, the arrival check-in, the daily read and the morning film. Each
 *     needs a fact the client API does not serve yet (kept days, a mood per cycle
 *     day, the content calendar). Drawing them from something else would put a
 *     number on screen that no server could ever confirm.
 *   - the level book's prescription under each session — reps, poses, the plate's
 *     dishes. `/client/today` serves the SESSIONS; the prescription arrives with
 *     the task catalogue in a later sprint.
 * Both are listed in docs/pixel/TODO.md against their measured deltas.
 */

/** 7:15 pm, from 1155. The demo prints times this way throughout. */
function clock(startMin: number | null): string {
  if (startMin == null) return '';
  const h24 = Math.floor(startMin / 60);
  const m = startMin % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** Good morning / afternoon / evening — the greeting the band opens with. */
function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const firstName = (name: string): string => String(name || '').split(' ')[0] ?? '';

/** ISO day, shifted. The stepper walks in whole days and nothing else. */
function shiftDay(iso: string, by: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/* the observation window that runs before day 1 of level 1 — five days, a fact
   about the programme, not the cycle (client-today.js:18). */
const OBS_DAYS = 5;

/**
 * The plan's display name — the demo's `c.tier`, "HAALVING Poorna" /
 * "HAALVING Svayam". The client API serves the plan enum (POORNA | SVAYAM); the
 * badge the band wears is that enum in the demo's own words.
 */
function planTier(plan: string): string {
  const one = String(plan || '');
  return 'HAALVING ' + one.charAt(0).toUpperCase() + one.slice(1).toLowerCase();
}

/* Sep 1, from an ISO date — HV.fmtMonthDay (core.js:310). Parsed off the string's
   own parts so a UTC-midnight Date can never roll the day back a timezone. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MON[(m ?? 1) - 1]} ${d ?? ''}`.trim();
}

export default function TodayScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const [day, setDay] = useState<string | undefined>(undefined);
  const today = useToday(day);

  const byPillar = useMemo(() => {
    const map = new Map<PillarKey, Session[]>();
    for (const key of PILLAR_ORDER) map.set(key, []);
    for (const s of today.data?.sessions ?? []) {
      const key = s.pillar as PillarKey | null;
      if (key && map.has(key)) map.get(key)!.push(s);
    }
    return map;
  }, [today.data]);

  const meals = today.data?.meals ?? [];

  /* the drawer that starts open is the next thing that actually needs doing — the
     first pillar carrying an undone SESSION. The plate is not a session, so a
     client with meals but no class does not force Nutrition open, exactly as the
     demo decides it (client-today.js:574). */
  const firstLive = PILLAR_ORDER.find((k) => (byPillar.get(k) ?? []).some((s) => !s.done));

  const isToday = day === undefined;
  const levels = me.data?.levels ?? {};
  const obs = today.data?.observation ?? me.data?.observation ?? false;

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 },
        ]}
      >
        {me.isPending || today.isPending ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} />
        ) : null}

        {me.data && today.data ? (
          <>
            <SceneBand
              kicker="THIS MORNING"
              title={`${greeting()}, ${firstName(me.data.name)}`}
              sub={
                obs
                  ? `Observation · Day ${today.data.day} of ${OBS_DAYS} · ${planTier(me.data.plan)}`
                  : `Cycle ${today.data.cycle} · Day ${today.data.day} of ${cycleDays()} · ${planTier(me.data.plan)}`
              }
              /* the morning-film mark rides the band's right seat on today —
                 present but inert until the content calendar is served (stub) */
              seat={isToday ? <FilmMark /> : undefined}
            />

            {/* the streak and the arrival, in the demo's order (client-today.js:867):
                both drawn at their real boxes today, their values stubbed until the
                client API serves them — see docs/pixel/TODO.md "needs API field" */}
            {isToday && !obs ? (
              <StreakBand days={me.data.streak?.days} kept={me.data.streak?.kept} />
            ) : null}

            {isToday ? <ArriveBand mood={today.data.arrival?.mood ?? null} /> : null}

            {obs ? (
              <Notice>
                Your observation window. We learn how you already eat, move and rest before we
                change a single thing. Ratings and levels switch on afterwards — until then, photos
                and taps are all we ask.
              </Notice>
            ) : (
              <DayNav
                day={today.data.day}
                date={fmtMonthDay(today.data.date)}
                tag={isToday ? 'Today' : 'Planned'}
                tagTone={isToday ? 'ok' : 'neutral'}
                onPrev={() => setDay(shiftDay(today.data.date, -1))}
                onNext={() => setDay(shiftDay(today.data.date, 1))}
              />
            )}

            {isToday ? null : (
              <Notice>
                Looking at another day. Sessions show what your team has planned — logging and calls
                stay on today.
              </Notice>
            )}

            <Card style={{ paddingVertical: 0 }}>
              {PILLAR_ORDER.map((key, i) => {
                const sessions = byPillar.get(key) ?? [];
                const summary =
                  key === 'culture'
                    ? mealSummary(meals)
                    : sessions.length
                      ? `${sessions[0]!.title} · ${clock(sessions[0]!.startMin)}`
                      : obs
                        ? 'Begins after your observation window'
                        : /* Fitness names its own absence — "No session today" —
                             where the other pillars fall back to the generic line
                             (client-today.js:601, 705). */
                          key === 'fitness'
                          ? 'No session today'
                          : 'Nothing scheduled today';

                return (
                  <PillarGroup
                    key={key}
                    pillar={key}
                    first={i === 0}
                    summary={summary}
                    level={obs ? 'Obs' : `L${levels[key] ?? 1}`}
                    defaultOpen={key === firstLive}
                  >
                    {key === 'culture' ? <Plate meals={meals} /> : null}

                    {sessions.map((s) => (
                      <PillarItem
                        key={s.id}
                        label={s.title}
                        detail={[clock(s.startMin), s.coach ? `with ${firstName(s.coach)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                        action={
                          s.done ? (
                            <Pill tone="ok">Done</Pill>
                          ) : !isToday ? (
                            <Pill tone="neutral">Planned</Pill>
                          ) : s.joinable ? (
                            <Chip icon="video" tone="live">
                              Join
                            </Chip>
                          ) : null
                        }
                      />
                    ))}

                    {sessions.length === 0 && key !== 'culture' ? (
                      <PillarEmpty>
                        {obs
                          ? 'Begins after your observation window.'
                          : 'Nothing on the plan here today.'}
                      </PillarEmpty>
                    ) : null}
                  </PillarGroup>
                );
              })}
            </Card>
          </>
        ) : null}

        {today.isError ? (
          <Notice tone="bad">
            We could not reach your day. Pull down to try again — nothing has been lost.
          </Notice>
        ) : null}
      </ScrollView>
    </ClientGround>
  );
}

/** The closed line for Nutrition: what the plate asks of you, in one glance. */
function mealSummary(meals: Meal[]): string {
  if (!meals.length) return 'Plate not set for this cycle';
  const logged = meals.filter((m) => m.photo).length;
  return `${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} · ${logged} of ${meals.length} photos logged`;
}

/**
 * The plate, slot by slot.
 *
 * A slot reads as LOGGED the moment its photo lands — the meal queue is the record
 * of truth, so nothing is stored twice and nothing can disagree with it.
 */
function Plate({ meals }: { meals: Meal[] }) {
  const c = useTheme();
  if (!meals.length) {
    return <PillarEmpty>No plate set for this cycle yet.</PillarEmpty>;
  }
  return (
    <>
      <PillarBand icon="bowl" label="Today’s plate" />
      {meals.map((m) => (
        <PillarItem
          key={m.id}
          label={m.slot}
          detail={
            m.stars != null
              ? `Rated ${m.stars} of 5`
              : /* through observation nobody has rated anything, and rule 3 sends
                   null rather than a zero that would read as a bad meal */
                undefined
          }
          action={m.photo ? <Pill tone="ok">Logged</Pill> : <Pill tone="neutral">Photo</Pill>}
        />
      ))}
      <Text style={[styles.plateNote, { color: c.ink3 }]}>Every plate teaches us.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  /* `.c-body` — s2 top, s5 sides, and a section gap deliberately wider than the
     gap inside a list, so grouping is legible: tight within, generous between. */
  body: {
    paddingTop: spacing.s2,
    paddingHorizontal: spacing.s5,
    gap: spacing.s5,
  },
  plateNote: { fontSize: t.micro, paddingLeft: spacing.s4 },
});
