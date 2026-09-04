import { cycleDays } from '@haalving/shared';
import { Fragment, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text } from 'react-native';

import {
  useJoinSession,
  useMe,
  useSetArrival,
  useToday,
  type Meal,
  type PlateHead,
  type Session,
} from '@/api/client-app';
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
import { OnboardingGate } from '@/components/client/OnboardingGate';
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
  const join = useJoinSession();
  const arrival = useSetArrival();

  /* opening the door records attendance and returns the room link, which we then
     hand to the OS to open. A failed open is silent — the session card stays. */
  const onJoin = (id: string) =>
    join.mutate(id, {
      onSuccess: (d) => {
        if (d.link) void Linking.openURL(d.link);
      },
    });

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

  /*
   * THE GATE. Somebody signed up but not yet promoted has an account and no
   * client record, so there is nothing on this page to draw — and every
   * query behind it would refuse. The tab stays reachable and says where
   * their onboarding actually is instead.
   */
  if (me.data && !me.data.onboarded && me.data.onboarding) {
    return (
      <ClientGround>
        <ClientHeader name={me.data.name} plan={me.data.plan} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: spacing.s2,
            paddingHorizontal: spacing.s5,
            paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8,
          }}
        >
          <OnboardingGate ob={me.data.onboarding} what={'Five quiet days come first.'} />
        </ScrollView>
      </ClientGround>
    );
  }

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
              /* the morning-film mark rides the band's right seat on today — it
                 opens the film the live Motivation plan prescribes for this day,
                 and stays inert when the day has none (`today.film` null) */
              seat={
                isToday ? (
                  <FilmMark url={today.data.film?.url ?? null} name={today.data.film?.name} />
                ) : undefined
              }
            />

            {/* the streak and the arrival, in the demo's order (client-today.js:867):
                both drawn at their real boxes today, their values stubbed until the
                client API serves them — see docs/pixel/TODO.md "needs API field" */}
            {isToday && !obs ? (
              <StreakBand days={me.data.streak?.days} kept={me.data.streak?.kept} />
            ) : null}

            {isToday ? (
              <ArriveBand
                mood={today.data.arrival?.mood ?? null}
                onPick={(m) => arrival.mutate({ mood: m })}
                pending={arrival.isPending}
              />
            ) : null}

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
                    {key === 'culture' ? <Plate meals={meals} head={today.data?.plate} /> : null}

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
                            <Chip icon="video" tone="live" onPress={() => onJoin(s.id)}>
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

/**
 * The closed line for Nutrition: what the plate asks of you, in one glance.
 *
 * IT COUNTS WHAT IS PRESCRIBED, not what has been eaten — the demo is explicit
 * that the assigned template decides the day, and "a header saying 6 meals
 * planned over three cards is simply wrong" (client-today.js:652). So the count
 * and the rows below it come from one list, and the header can never describe a
 * group it is not standing over.
 */
function mealSummary(meals: Meal[]): string {
  if (!meals.length) return 'Plate not set for this cycle';
  const planned = meals.filter((m) => m.planned).length;
  const logged = meals.filter((m) => m.photo).length;
  /* a day with nothing prescribed still has plates on it if the client logged
     some, and then the honest headline is the count of those */
  if (!planned) return `${logged} ${logged === 1 ? 'plate' : 'plates'} logged`;
  return `${planned} ${planned === 1 ? 'meal' : 'meals'} planned · ${logged} of ${planned} photos logged`;
}

/**
 * The plate, slot by slot.
 *
 * A slot reads as LOGGED the moment its photo lands — the meal queue is the record
 * of truth, so nothing is stored twice and nothing can disagree with it.
 */
function Plate({ meals, head }: { meals: Meal[]; head?: PlateHead | null }) {
  const c = useTheme();
  if (!meals.length) {
    return <PillarEmpty>No plate set for this cycle yet.</PillarEmpty>;
  }

  /* the day-part band prints only where the part CHANGES, so the plate reads as
     a schedule — Morning, then Afternoon, then Evening — rather than repeating a
     heading over every row */
  let part: string | null = null;

  return (
    <>
      {head ? (
        <Text style={[styles.plateHead, { color: c.ink3 }]}>
          {`${head.title} · ${head.kcal} kcal · ${head.protein} g protein a day`}
        </Text>
      ) : null}
      {meals.map((m, i) => {
        const band = m.planned && m.part !== part ? m.part : null;
        if (m.planned) part = m.part;
        return (
          <Fragment key={m.id ?? `slot-${m.slot}-${i}`}>
            {band ? <PillarBand icon="bowl" label={band} /> : null}
            <PillarItem
              /* THE DISH IS THE ROW'S NAME. A slot label alone ("Breakfast") says
                 when to eat and never what — the whole point of publishing a plan
                 is that the client can read what is on the plate. The slot moves
                 into the line beneath, where the clock and the reading are. */
              label={m.dish || m.slot}
              detail={plateDetail(m)}
              action={m.photo ? <Pill tone="ok">Logged</Pill> : <Pill tone="neutral">Photo</Pill>}
            />
          </Fragment>
        );
      })}
      <Text style={[styles.plateNote, { color: c.ink3 }]}>Every plate teaches us.</Text>
    </>
  );
}

/**
 * The line under a dish: its hour, its slot, and what it comes to.
 *
 * "8:00 · Breakfast · 225 kcal · 5.5 g protein" — the same four facts the console
 * prints against this slot on the client's Plan tab. A rating replaces the
 * reading once one exists, because a rating is the answer to the meal and the
 * reading was only the prescription. Through observation `stars` is null by rule
 * 3 rather than a zero, so an unrated plate keeps its numbers instead of reading
 * as a bad meal.
 */
function plateDetail(m: Meal): string | undefined {
  const bits = [m.time, m.dish ? m.slot : null].filter(Boolean) as string[];
  if (m.stars != null) bits.push(`rated ${m.stars} of 5`);
  else {
    if (m.kcal != null) bits.push(`${m.kcal} kcal`);
    if (m.protein != null) bits.push(`${r1(m.protein)} g protein`);
  }
  return bits.length ? bits.join(' · ') : undefined;
}

/** 5.5 → "5.5", 210 → "210" — one decimal only when it earns it. */
const r1 = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);

const styles = StyleSheet.create({
  /* `.c-body` — s2 top, s5 sides, and a section gap deliberately wider than the
     gap inside a list, so grouping is legible: tight within, generous between. */
  body: {
    paddingTop: spacing.s2,
    paddingHorizontal: spacing.s5,
    gap: spacing.s5,
  },
  plateNote: { fontSize: t.micro, paddingLeft: spacing.s4 },
  /* the targets line, set as a quiet header above the plate — the console prints
     the same sentence in the same place on the client's Plan tab */
  plateHead: {
    fontSize: t.micro,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingLeft: spacing.s4,
    paddingBottom: spacing.s2,
  },
});
