import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlan, useMe, useAskForNextPlan, type PlanDay, type PlanNext } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { SceneBand } from '@/components/client/SceneBand';
import { DaySheet } from '@/components/client/plan/DaySheet';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { OnboardingGate, OnboardingMeasured, OnboardingPlan } from '@/components/client/OnboardingGate';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * My Plan — the 14-day cycle hub (`client-plan.js`, the #/plan tab).
 *
 * The scene band, the tab strip (Calendar · Weight goals · Daily activities ·
 * Level-up targets) and each tab's content, at the demo's boxes. Calendar leads.
 * Data from a fixture until `GET /client/plan` ships. Cycle-strip chips, the day
 * sheet, past cycles and the journey gallery are deferred for this breadth pass.
 */

const PILLAR_COLOR = (c: ReturnType<typeof useTheme>): Record<string, string> => ({
  fitness: c.fitness,
  culture: c.culture,
  yoga: c.yoga,
  wellness: c.wellness,
});

type Tab = 'calendar' | 'weight' | 'daily' | 'levelup';
const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'weight', label: 'Weight goals' },
  { id: 'daily', label: 'Daily activities' },
  { id: 'levelup', label: 'Level-up targets' },
];

export default function PlanScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const plan = usePlan();
  /* landing on this tab is the moment to ask again — a queued or removed
     template must be visible the instant the client looks, not 30 s later */
  const refetchPlan = plan.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchPlan();
    }, [refetchPlan]),
  );
  const [tab, setTab] = useState<Tab>('calendar');
  const p = plan.data;

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
          <OnboardingGate ob={me.data.onboarding} what={'Your plan is on its way.'} />
          <OnboardingPlan plan={me.data.plan} ob={me.data.onboarding} />
          <OnboardingMeasured ob={me.data.onboarding} />
        </ScrollView>
      </ClientGround>
    );
  }

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 }]}
      >
        <SceneBand kicker="YOUR 14 DAYS" title="My Plan" sub={p?.sub} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((tb) => {
            const on = tb.id === tab;
            return (
              <Pressable key={tb.id} onPress={() => setTab(tb.id)} style={styles.tabBtn}>
                <Text style={{ fontSize: t.sm, fontWeight: '600', color: on ? c.ink : c.ink3 }}>
                  {tb.label}
                </Text>
                {on ? <View style={[styles.tabUnderline, { backgroundColor: c.brand }]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {p && tab === 'calendar' ? <CalendarTab plan={p} /> : null}
        {p && tab === 'weight' ? <WeightTab plan={p} /> : null}
        {p && tab === 'daily' ? <DailyTab plan={p} /> : null}
        {p && tab === 'levelup' ? <LevelupTab plan={p} /> : null}
      </ScrollView>
    </ClientGround>
  );
}

/** The four illustrations, the same ones Today uses — one vocabulary of art. */
const PILLAR_ART: Record<string, number> = {
  culture: require('../../assets/pillars/culture.webp'),
  fitness: require('../../assets/pillars/fitness.webp'),
  yoga: require('../../assets/pillars/yoga.webp'),
  wellness: require('../../assets/pillars/wellness.webp'),
};

function CalendarTab({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  /* the row's real width, measured once — the tiles are sized from it rather than
     from a percentage, which is what silently failed before */
  const [rowW, setRowW] = useState(0);
  /*
   * THE DAY NUMBER, not the day object.
   *
   * Holding the object froze it: marking a session done wrote to the server and
   * refreshed the plan, but the open sheet went on showing the snapshot it was
   * given, so the row still read "today" and the button still offered to mark a
   * session that was already done. A number is a pointer into whatever the query
   * currently holds, so the sheet follows the refresh.
   */
  const [openDayNo, setOpenDayNo] = useState<number | null>(null);
  /*
   * THIS CYCLE, OR THE NEXT. The grid pages between the plan the client is on
   * and the one signed and waiting — the same ‹ › the console has — so "what is
   * my next plan" is answered by looking at it, not by reading a name.
   */
  const [view, setView] = useState<'now' | 'next'>('now');
  const nextCal = plan.nextCalendar ?? [];
  /* the pillars nobody has queued yet — named under the grid, and per day */
  const unallocated = plan.nextCycle?.unallocated ?? [];
  const nextCycleNo = plan.nextCycle?.cycle ?? plan.cycle + 1;
  const onNext = view === 'next' && nextCal.length > 0;
  const days = onNext ? nextCal : plan.calendar;
  const openDay = openDayNo == null ? null : (days.find((d) => d.day === openDayNo) ?? null);
  /* FLOORED, and a pixel short of half.
     `(rowW - gap) / 2` is exactly half, and two of those plus the gap comes to
     rowW — which sub-pixel rounding turns into "one pixel too wide", so the
     second card wrapped onto its own row and the 2×2 grid became a column. */
  const tileW = rowW ? Math.floor((rowW - spacing.s2) / 2) - 1 : undefined;

  const router = useRouter();
  const c = useTheme();
  const pc = PILLAR_COLOR(c);
  return (
    <>
      <Card>
        <View style={styles.calHead}>
          {nextCal.length ? (
            <Pressable
              onPress={() => { setView('now'); setOpenDayNo(null); }}
              disabled={!onNext}
              hitSlop={8}
              accessibilityLabel="Show this cycle"
              style={[styles.calArrow, { borderColor: c.line, opacity: onNext ? 1 : 0.35 }]}
            >
              <Icon name="chevL" size={14} color={c.ink} />
            </Pressable>
          ) : null}
          <Text style={[styles.cardTitle, { color: c.ink2, flex: 1, marginBottom: 0 }]}>
            {onNext
              ? `Cycle ${plan.nextCycle?.cycle ?? plan.cycle + 1} · from ${days[0]?.date ?? ''} · queued`
              : `Cycle ${plan.cycle} · your ${days.length || 14}-day cycle`}
          </Text>
          {nextCal.length ? (
            <Pressable
              onPress={() => { setView('next'); setOpenDayNo(null); }}
              disabled={onNext}
              hitSlop={8}
              accessibilityLabel="Show next cycle"
              style={[styles.calArrow, { borderColor: c.line, opacity: onNext ? 0.35 : 1 }]}
            >
              <Icon name="chevR" size={14} color={c.ink} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.calc}>
          {days.map((d) => (
            <Cell key={d.day} d={d} pc={pc} onOpen={() => setOpenDayNo(d.day)} />
          ))}
        </View>
        {onNext ? (
          <Text style={[styles.hint, { color: c.ink3 }]}>
            Signed and waiting — takes over on day 1. Nothing changes until then.
          </Text>
        ) : null}
        {onNext && unallocated.length ? (
          <Text style={[styles.hint, { color: c.ink3 }]}>
            {`Not allocated yet: ${unallocated.map((p) => PILLAR_NAME[p] ?? p).join(', ')} — your coach hasn’t set these for cycle ${nextCycleNo}.`}
          </Text>
        ) : null}
        <View style={styles.legend}>
          <LegendDot color={c.ok} label="Done" />
          <LegendDot color={c.danger} label="Missed" dashed />
          <LegendDot color={c.ink3} label="Upcoming" outline />
        </View>
        <Text style={[styles.hint, { color: c.ink2 }]}>Tap a day for its sessions and your progress in them.</Text>

        {/*
          * THE LAST TWO DAYS OF A CYCLE — when the next plan is being written.
          *
          * The pod is told on these days whether or not anybody taps this, so the
          * card says so plainly: this is for having a say in the next plan, not
          * for making it happen. Promising a client that their plan depends on
          * remembering to press a button would be a lie.
          */}
        {/* "the last two days" is the server's rule; the length comes from the
            programme's configuration, never from a number typed here */}
        {plan.day >= (plan.cycleDays ?? plan.calendar.length) - 1 || (plan.next ?? []).length ? <NextPlanCard cycle={plan.cycle} next={plan.next ?? []} unallocated={unallocated} onSeeNext={nextCal.length ? () => setView('next') : null} /> : null}
      </Card>

      <View style={styles.tiles} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
        {plan.tiles.map((tile) => (
          /* the chevron promised a destination the tile never had — it opens the
             pillar's whole cycle now, which is what the demo's tile does */
          <Pressable
            key={tile.key}
            onPress={() => router.push({ pathname: '/plan-full/[pillar]', params: { pillar: tile.key } })}
            /*
             * A PLAIN ARRAY, NOT A STYLE FUNCTION, and a number rather than a
             * percentage width.
             *
             * As a `({pressed}) => [...]` function these tiles rendered as four
             * bare colour plates: the row direction and width were dropped, so the
             * `flex: 1` text column collapsed to nothing and the pillar names and
             * chevrons vanished. The honeycomb failed the same way on the same
             * day. Measured, not guessed — see the note in Honeycomb.tsx.
             */
            style={[styles.tile, { width: tileW, backgroundColor: c.surface }]}
          >
            {/* the pillar's own illustration, on its colour — the plain plate said
                nothing the word beside it did not already say */}
            <View style={[styles.tilePlate, { backgroundColor: pc[tile.key] }]}>
              {PILLAR_ART[tile.key] ? (
                <Image source={PILLAR_ART[tile.key]} style={styles.tileArt} contentFit="contain" />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.xs }}>{tile.word}</Text>
              <Text style={{ color: c.ink2, fontSize: t.micro }}>Full plan</Text>
            </View>
            <Icon name="chevR" size={14} color={c.ink3} strokeWidth={2} />
          </Pressable>
        ))}
      </View>

      <DaySheet
        day={openDay}
        colors={pc}
        todayDay={onNext ? 0 : plan.day}
        /* next cycle's own levels and its gaps — the sheet must not print this
           cycle's Level 2 over a queued Level 1 plate */
        levels={onNext ? (plan.nextCycle?.levels ?? {}) : (plan.levels ?? {})}
        unallocated={onNext ? unallocated : []}
        progress={plan.progress ?? {}}
        onClose={() => setOpenDayNo(null)}
        onFullPlan={(pillar) => router.push({ pathname: '/plan-full/[pillar]', params: { pillar } })}
      />
    </>
  );
}

function Cell({ d, pc, onOpen }: { d: PlanDay; pc: Record<string, string>; onOpen: () => void }) {
  const c = useTheme();
  const bg = d.rest ? c.surface3 : d.review || d.meeting ? c.brandWash : c.surface2;
  return (
    /* a day OPENS. The grid can only say a day has a fitness session; which one,
       when and whether it happened lives in the sheet — and tapping did nothing
       at all before, so that was the whole of what a client could learn. */
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Day ${d.day}, ${d.date}`}
      onPress={onOpen}
      style={[
        styles.cell,
        { backgroundColor: bg },
        d.today ? { borderWidth: 2, borderColor: c.brand } : null,
      ]}
    >
      <Text style={[styles.cellDay, { color: d.today ? c.brand : d.past ? c.ink3 : c.ink }]}>{d.day}</Text>
      <Text style={[styles.cellDate, { color: c.ink3 }]}>{d.date}</Text>
      <View style={styles.marks}>
        {d.marks.map((m, i) => (
          <DayMark key={i} pillar={m.pillar} status={m.status} label={m.label} color={pc[m.pillar] ?? c.ink3} />
        ))}
      </View>
      {d.flag ? <Text style={[styles.cellFlag, { color: d.rest ? c.ink3 : c.brand }]}>{d.flag}</Text> : null}
    </Pressable>
  );
}

/** Nutrition · Fitness · Yoga · Mind Wellness — the product's own words. */
const PILLAR_NAME: Record<string, string> = {
  culture: 'Fuel: Nutrition Biohack',
  fitness: 'Power: Fitness Biohack',
  yoga: 'Flow: Yoga Biohack',
  wellness: 'Peace: Mind Biohack',
};

/**
 * ONE PILLAR ON ONE DAY, NAMED.
 *
 * The calendar used to draw these as coloured squares, which asks the reader to
 * learn a colour key before they can read their own fortnight — and four dots in
 * a 23%-wide cell are indistinguishable at arm's length anyway. The demo prints
 * the pillar's name, so a client can see that Tuesday is Yoga and Nutrition
 * without decoding anything.
 *
 * The three states keep the legend honest and are drawn as the legend describes
 * them: a kept day is filled, a missed one is dashed, one still to come is a
 * plain outline.
 */
function DayMark({ pillar, status, label, color }: { pillar: string; status: string; label?: string; color: string }) {
  const c = useTheme();
  const done = status === 'ok';
  const missed = status === 'miss';
  return (
    <View
      style={[
        styles.mark,
        done
          ? { backgroundColor: color, borderColor: color, borderWidth: 1 }
          : missed
            ? { borderWidth: 1, borderColor: c.danger, borderStyle: 'dashed' }
            : { borderWidth: 1, borderColor: color },
      ]}
    >
      <Text
        numberOfLines={1}
        /* "Mind Wellness" is the longest name and it was clipped to "Mind Welln…".
           Shrinking to fit keeps every pill one line and the same height, which is
           what makes a column of them scannable. */
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[styles.markText, { color: done ? c.surface : missed ? c.danger : color }]}
      >
        {label ?? PILLAR_NAME[pillar] ?? pillar}
      </Text>
    </View>
  );
}

function WeightTab({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  const c = useTheme();
  const mark = { ok: 'check', miss: 'x', cur: 'flag', todo: '' } as const;
  const markColor = { ok: c.ok, miss: c.danger, cur: c.brand, todo: c.ink3 } as const;
  return (
    <Card>
      <Text style={[styles.k, { color: c.ink3 }]}>GOAL LEDGER</Text>
      <Text style={[styles.hint, { color: c.ink2, marginTop: spacing.s1, marginBottom: spacing.s2 }]}>
        {plan.goal} — each level carries its share.
      </Text>
      {plan.ledger.map((row, i) => (
        <View key={row.level} style={[styles.lrow, i > 0 ? { borderTopWidth: 1, borderTopColor: c.lineSoft } : null]}>
          <View style={[styles.lmark, { backgroundColor: c.surface2 }]}>
            {mark[row.state] ? <Icon name={mark[row.state]} size={13} color={markColor[row.state]} strokeWidth={2} /> : null}
          </View>
          <Text style={{ color: row.state === 'todo' ? c.ink2 : c.ink, fontSize: t.sm }}>
            <Text style={{ fontFamily: numFamily(600) }}>{row.level}</Text> · {row.target}
          </Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.s2 }}>
            {row.result ? (
              <Text style={{ fontFamily: numFamily(400), fontSize: t.xs, color: c.ink2 }}>{row.result}</Text>
            ) : row.state === 'cur' ? (
              <Text style={{ fontSize: t.xs, color: c.ink2 }}>in progress</Text>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function DailyTab({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  const c = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.s2 }}>
        {plan.daily.map((row) => (
          <View key={row.label} style={styles.trow}>
            <View style={[styles.iconTile, { backgroundColor: c.surface2 }]}>
              <Icon name={row.icon} size={18} color={c.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.sm }}>
                {row.label} · <Text style={{ fontFamily: numFamily(400) }}>{row.value}</Text>
              </Text>
              <Text style={{ color: c.ink2, fontSize: t.xs }}>{row.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ marginTop: spacing.s4 }}>
        <Button label="Open Trackers" variant="ghost" onPress={() => {}} />
      </View>
    </Card>
  );
}

function LevelupTab({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  const c = useTheme();
  const pc = PILLAR_COLOR(c);
  return (
    <Card>
      <View style={{ gap: spacing.s2 }}>
        {plan.levelup.map((row) => (
          <View key={row.key} style={styles.trow}>
            <View style={[styles.tilePlate, { backgroundColor: pc[row.key], width: 36, height: 36 }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.sm }}>{row.title}</Text>
              <Text style={{ fontFamily: numFamily(400), color: c.ink2, fontSize: t.xs }}>{row.bar}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: numFamily(500), color: c.ink, fontSize: t.sm }}>
                {row.ticked}/{row.total}
              </Text>
              <Text style={{ fontSize: t.micro, color: c.ink3 }}>criteria met</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function LegendDot({ color, label, dashed, outline }: { color: string; label: string; dashed?: boolean; outline?: boolean }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s1 }}>
      <View
        style={[
          styles.mark,
          outline || dashed ? { borderWidth: 1.5, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' } : { backgroundColor: color },
        ]}
      />
      <Text style={{ fontSize: t.micro, color: c.ink3 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  calHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginBottom: spacing.s3 },
  calArrow: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seeNext: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.s1 },
  seeNextText: { fontSize: t.sm, fontWeight: '600' },
  nextCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.s4, gap: spacing.s2, marginTop: spacing.s4 },
  nextTitle: { fontSize: t.h3, fontWeight: '700' },
  nextSub: { fontSize: t.sm, lineHeight: t.sm * 1.5 },
  nextInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.s3,
    minHeight: 64,
    fontSize: t.sm,
    textAlignVertical: 'top',
  },
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  tabs: { gap: spacing.s1 },
  tabBtn: { paddingVertical: spacing.s3, paddingHorizontal: spacing.s4 },
  tabUnderline: { height: 2, borderRadius: radius.full, marginTop: spacing.s2 },

  cardTitle: { fontSize: t.sm, fontWeight: '600', marginBottom: spacing.s3 },
  calc: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s1 },
  cell: {
    width: '23.5%',
    minHeight: 92,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s1,
    paddingTop: spacing.s1,
    paddingBottom: spacing.s2,
    gap: spacing.s1,
  },
  cellDay: { fontFamily: 'System', fontSize: 18, fontWeight: '600' },
  cellDate: { fontSize: t.micro, marginTop: -2 },
  marks: { alignSelf: 'stretch', gap: 3, marginTop: 2 },
  /* a named pill, sized to the cell rather than to its text — four of these stack
     inside one day, so they must all be the same width or the column ragged */
  mark: {
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  markText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },
  cellFlag: { fontSize: t.micro, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3, marginTop: spacing.s3 },
  hint: { fontSize: t.sm, lineHeight: t.sm * 1.5 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 56,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  tilePlate: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileArt: { width: '86%', height: '86%' },

  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  lrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s2 },
  lmark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  trow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  iconTile: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});

/**
 * "Your next plan" — offered on days 13 and 14 only.
 *
 * The team already has the work on their list from day 13; this is the client's
 * voice on it. Once asked, the card says so rather than offering a second ask.
 */
function NextPlanCard({
  cycle,
  next,
  unallocated,
  onSeeNext,
}: {
  cycle: number;
  next: PlanNext[];
  /** pillars with nothing queued — listed as such, not left out */
  unallocated: string[];
  onSeeNext: (() => void) | null;
}) {
  const c = useTheme();
  const ask = useAskForNextPlan();
  const [note, setNote] = useState('');
  const WORD: Record<string, string> = { culture: 'Fuel: Nutrition Biohack', fitness: 'Power: Fitness Biohack', yoga: 'Flow: Yoga Biohack', wellness: 'Peace: Mind Biohack' };

  /*
   * ALREADY SIGNED AND WAITING — say so, and name it.
   *
   * The whole point of the queue is that on day 13 the client is not told to
   * wait and see; they are shown the plan that takes over on day 1. The ask
   * stays available underneath for a change of mind, worded as a change.
   */
  if (next.length && !ask.isSuccess) {
    return (
      <View style={[styles.nextCard, { backgroundColor: c.surface2, borderColor: c.line }]}>
        <Text style={[styles.nextTitle, { color: c.ink }]}>
          {unallocated.length ? `Your cycle ${cycle + 1} plan so far` : `Your cycle ${cycle + 1} plan is ready`}
        </Text>
        {next.map((n) => (
          <Text key={n.pillar} style={[styles.nextSub, { color: c.ink2 }]}>
            {WORD[n.pillar] ?? n.pillar}: <Text style={{ color: c.ink, fontWeight: '600' }}>{n.name}</Text> · L{n.level}
          </Text>
        ))}
        {unallocated.map((p) => (
          <Text key={p} style={[styles.nextSub, { color: c.ink3 }]}>
            {WORD[p] ?? p}: Not allocated yet
          </Text>
        ))}
        <Text style={[styles.nextSub, { color: c.ink3 }]}>Takes over on day 1 — nothing changes until then.</Text>
        {onSeeNext ? (
          <Pressable onPress={onSeeNext} accessibilityRole="button" style={styles.seeNext}>
            <Text style={[styles.seeNextText, { color: c.brand }]}>See next cycle’s days</Text>
            <Icon name="chevR" size={14} color={c.brand} />
          </Pressable>
        ) : null}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Want something different? — optional"
          placeholderTextColor={c.ink3}
          multiline
          style={[styles.nextInput, { color: c.ink, backgroundColor: c.surface, borderColor: c.line }]}
        />
        <Button
          label={ask.isPending ? 'Sending…' : 'Ask for a change'}
          variant="ghost"
          onPress={() => ask.mutate({ note: note.trim() || undefined })}
          disabled={ask.isPending}
        />
      </View>
    );
  }

  if (ask.isSuccess) {
    return (
      <View style={[styles.nextCard, { backgroundColor: c.surface2, borderColor: c.line }]}>
        <Text style={[styles.nextTitle, { color: c.ink }]}>Your team knows.</Text>
        <Text style={[styles.nextSub, { color: c.ink2 }]}>
          They are writing your cycle {cycle + 1} plan and will come back to you in your circle.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.nextCard, { backgroundColor: c.surface2, borderColor: c.line }]}>
      <Text style={[styles.nextTitle, { color: c.ink }]}>Your cycle {cycle + 1} plan</Text>
      <Text style={[styles.nextSub, { color: c.ink2 }]}>
        Your pod is preparing it now — this is your chance to say what you want changed.
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Anything you would like different? — optional"
        placeholderTextColor={c.ink3}
        multiline
        style={[styles.nextInput, { color: c.ink, backgroundColor: c.surface, borderColor: c.line }]}
      />
      <Button
        label={ask.isPending ? 'Sending…' : 'Ask about my next plan'}
        onPress={() => ask.mutate({ note: note.trim() || undefined })}
        disabled={ask.isPending}
      />
    </View>
  );
}
