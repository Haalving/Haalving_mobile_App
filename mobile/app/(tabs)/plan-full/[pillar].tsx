import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useMarkSessionDone,
  useMe,
  usePlan,
  type Meal,
  type PlanDay,
  type PlanDayItem,
} from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { DishSheet } from '@/components/client/DishSheet';
import { NutritionDay } from '@/components/client/plan/NutritionDay';
import { MoveRow, ProgressTiles } from '@/components/client/plan/SheetParts';
import { Icon } from '@/components/ui/Icon';
import { Card, Empty, Pill } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * FULL PLAN — one pillar, the whole cycle (`client-plan.js` `plan-full`).
 *
 * THE DEMO DRAWS TWO DIFFERENT PAGES HERE, and this file used to draw one. Diet
 * is a plate that runs every day of the cycle, so the demo shows TODAY'S plate,
 * illustrated, and a line saying the same plate runs all cycle — a fortnight of
 * identical rows would be fourteen copies of one fact. The session pillars are
 * different on different days, so they get today's moves illustrated and then
 * the cycle day by day, each session with its status.
 *
 * EVERY WORD HERE IS THE SERVER'S. This reads the same `/client/plan` the hub
 * and the day sheet read, so the three cannot name one session two ways, and it
 * gets the moves, the status, the coach, the level and the cycle figures from
 * that one payload rather than a second endpoint that could drift.
 */

const PILLARS = ['culture', 'fitness', 'yoga', 'wellness'] as const;
type PillarKey = (typeof PILLARS)[number];

/** `FULL_LABELS` in the demo — the page's own name. */
const FULL: Record<PillarKey, string> = {
  culture: 'Fuel: Nutrition Biohack — full plan',
  fitness: 'Power: Fitness Biohack — full plan',
  yoga: 'Flow: Yoga Biohack — full plan',
  wellness: 'Peace: Mind Biohack — full plan',
};

/** `HV.PILLARS[key].name` — the noun on the block's head row. */
const NAME: Record<PillarKey, string> = {
  culture: 'Fuel: Nutrition Biohack',
  fitness: 'Power: Fitness Biohack',
  yoga: 'Flow: Yoga Biohack',
  wellness: 'Peace: Mind Biohack',
};

/** the demo's `statusPill`: its five words, its five tones, nothing invented */
function StatusPill({ status }: { status: string }) {
  if (status === 'done') return <Pill tone="ok">done</Pill>;
  if (status === 'today') return <Pill tone="info">today</Pill>;
  if (status === 'missed') return <Pill tone="warn">missed</Pill>;
  if (status === 'cancelled') return <Pill tone="bad">cancelled</Pill>;
  return <Pill tone="neutral">planned</Pill>;
}

export default function FullPlanScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pillar: string }>();
  const me = useMe();
  const plan = usePlan();
  const markDone = useMarkSessionDone();
  const [move, setMove] = useState<Meal | null>(null);

  const pillar: PillarKey = PILLARS.includes(params.pillar as PillarKey)
    ? (params.pillar as PillarKey)
    : 'culture';
  const tint: Record<PillarKey, string> = {
    culture: c.culture,
    fitness: c.fitness,
    yoga: c.yoga,
    wellness: c.wellness,
  };

  const p = plan.data;
  const cal: PlanDay[] = p?.calendar ?? [];
  const today = cal.find((d) => d.today) ?? cal.find((d) => d.day === p?.day) ?? null;
  const level = p?.levels?.[pillar] ?? null;
  const todayItem: PlanDayItem | null = today?.items.find((it) => it.pillar === pillar) ?? null;
  /* a cycle where this pillar prescribes nothing at all is a real answer, and a
     different one from "still loading" — the empty state below says which */
  const anything = pillar === 'culture' ? !!today?.iso : cal.some((d) => d.items.some((it) => it.pillar === pillar));

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="chevL" size={14} color={c.brand} strokeWidth={2} />
          <Text style={[styles.backText, { color: c.brand }]}>Back to My Plan</Text>
        </Pressable>

        {/* `.h1-row` — the page's name and the level it is written for */}
        <View style={styles.h1Row}>
          <Text style={[styles.h1, { color: c.ink }]}>{FULL[pillar]}</Text>
          {level != null ? <Pill tone="info">{`Level ${level}`}</Pill> : null}
        </View>
        {p ? (
          <Text style={[styles.sub, { color: c.ink2 }]}>
            Cycle {p.cycle} · day {p.day} of {cal.length || 14}
          </Text>
        ) : null}

        {plan.isPending ? <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} /> : null}
        {plan.isError ? <Empty icon="calendar" sentence="We could not reach your plan. Pull down to try again." /> : null}
        {p && !anything ? <Empty icon="calendar" sentence={`No ${NAME[pillar]} is prescribed this cycle yet.`} /> : null}

        {/* ---------------------------------------------- blockCard: today */}
        {p && anything ? (
          <Card>
            <View style={styles.blockHead}>
              <View style={[styles.pdot, { backgroundColor: tint[pillar] }]} />
              <Text style={[styles.blockName, { color: c.ink }]}>{NAME[pillar]}</Text>
              {level != null ? <Text style={[styles.lvl, { color: c.ink3 }]}>Level {level}</Text> : null}
            </View>

            {pillar === 'culture' && today?.iso ? (
              /* the SAME illustrated plate the day sheet draws — one description of a plate */
              <NutritionDay iso={today.iso} />
            ) : null}

            {pillar !== 'culture' ? (
              todayItem ? (
                <>
                  <View style={styles.sessionRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.sessionLabel, { color: c.ink }]}>{todayItem.label}</Text>
                      <Text style={[styles.sessionSub, { color: c.ink2 }]}>
                        {[todayItem.time, todayItem.staff ? `with ${todayItem.staff}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <StatusPill status={todayItem.done ? 'done' : todayItem.status} />
                  </View>
                  {(todayItem.moves ?? []).map((mv, n) => (
                    <MoveRow
                      key={`${mv.slot}-${n}`}
                      move={mv}
                      canTick={!!today && today.day <= (p.day ?? 0)}
                      pending={markDone.isPending}
                      onOpen={() => setMove(mv)}
                      onDone={() => markDone.mutate({ day: today!.day, pillar, moveIdx: mv.idx ?? n })}
                    />
                  ))}
                  {(todayItem.moves ?? []).length ? (
                    <Text style={[styles.note, { color: c.ink3 }]}>Tap a move for how it’s done.</Text>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.note, { color: c.ink3 }]}>
                  {today?.rest ? 'Active rest — recovery is the session.' : `Nothing on the ${NAME[pillar]} plan today.`}
                </Text>
              )
            ) : null}
          </Card>
        ) : null}

        {/* ------------------------------------ daysCard, or the diet notice */}
        {p && anything && pillar === 'culture' ? (
          <View style={[styles.notice, { backgroundColor: c.surface2, borderColor: c.line }]}>
            <Text style={[styles.noticeText, { color: c.ink2 }]}>
              A new diet plan lands every cycle — this one runs all of cycle {p.cycle}.
            </Text>
          </View>
        ) : null}

        {p && anything && pillar !== 'culture' ? (
          <>
            <Text style={[styles.cardTitle, { color: c.ink }]}>Cycle {p.cycle} · day by day</Text>
            {cal.map((d) => (
              <DayCard key={d.day} d={d} pillar={pillar} tint={tint[pillar]} />
            ))}
          </>
        ) : null}

        {/* ------------------------------------------ your progress this cycle */}
        {p && anything ? <ProgressTiles rows={p.progress?.[pillar] ?? []} /> : null}
      </ScrollView>

      {/* the SAME dish/move sheet the day sheet opens */}
      <DishSheet meal={move} onClose={() => setMove(null)} />
    </ClientGround>
  );
}

/**
 * One day of a session pillar — the demo's `tg` card: pillar mark, "Day N",
 * the date, then each session as a `tgItem` with its status pill.
 *
 * DAYS THIS PILLAR ASKS NOTHING OF SAY SO rather than being dropped — a fortnight
 * with gaps in the numbering reads as a bug, and the demo prints the same line.
 */
function DayCard({ d, pillar, tint }: { d: PlanDay; pillar: PillarKey; tint: string }) {
  const c = useTheme();
  const mine = d.items.filter((it) => it.pillar === pillar);

  return (
    <Card>
      <View style={styles.dayHead}>
        <View style={[styles.pdot, { backgroundColor: tint }]} />
        <Text style={[styles.dayNum, { color: d.today ? c.brand : c.ink }]}>Day {d.day}</Text>
        <Text style={[styles.dayDate, { color: c.ink3 }]}>{d.date}</Text>
        <View style={{ flex: 1 }} />
        {d.today ? <Pill tone="info">Today</Pill> : null}
      </View>

      {d.rest ? (
        <Text style={[styles.none, { color: c.ink3 }]}>Active rest — recovery is the session.</Text>
      ) : mine.length === 0 ? (
        <Text style={[styles.none, { color: c.ink3 }]}>
          {pillar === 'yoga' ? 'Your own practice — the sequence above.' : 'Nothing scheduled.'}
        </Text>
      ) : (
        mine.map((it, i) => (
          <View key={i} style={[styles.row, { borderTopColor: c.line }, i === 0 ? styles.rowFirst : null]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowLabel, { color: c.ink }]}>{it.label}</Text>
              <Text style={[styles.rowSub, { color: c.ink2 }]}>
                {[it.time, it.staff ? `with ${it.staff}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <StatusPill status={it.done ? 'done' : it.status} />
          </View>
        ))
      )}
      {d.review ? <Text style={[styles.meta, { color: c.ink3 }]}>Level review day</Text> : null}
      {d.meeting ? <Text style={[styles.meta, { color: c.ink3 }]}>Progress meeting · new plan</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.s2 },
  backText: { fontSize: t.sm, fontWeight: '600' },

  h1Row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s3 },
  h1: { fontSize: t.h1, fontWeight: '700', flexShrink: 1 },
  sub: { fontSize: t.sm, marginTop: -spacing.s2 },

  /* the block's head row: `.pdot` + name + `.lvl` */
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginBottom: spacing.s3 },
  pdot: { width: 10, height: 10, borderRadius: 5 },
  blockName: { fontSize: t.h3, fontWeight: '700' },
  lvl: { fontSize: t.micro, marginLeft: 'auto' },

  /* `tgItem` — the session line: label, clock · coach, status at the right */
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s2 },
  sessionLabel: { fontSize: t.h3, fontWeight: '600', lineHeight: t.h3 * 1.3 },
  sessionSub: { fontSize: t.xs, marginTop: 2 },
  note: { fontSize: t.micro, marginTop: spacing.s2 },

  notice: { borderWidth: 1, borderRadius: 12, padding: spacing.s4 },
  noticeText: { fontSize: t.sm, lineHeight: t.sm * 1.5 },
  cardTitle: { fontSize: t.sm, fontWeight: '700', marginTop: spacing.s2 },

  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginBottom: spacing.s2 },
  dayNum: { fontSize: t.h3, fontWeight: '600' },
  dayDate: { fontSize: t.micro },
  none: { fontSize: t.sm, paddingVertical: spacing.s1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s2, borderTopWidth: 1 },
  rowFirst: { borderTopWidth: 0 },
  rowLabel: { fontSize: t.sm, fontWeight: '600', lineHeight: t.sm * 1.35 },
  rowSub: { fontSize: t.micro, marginTop: 1 },
  meta: { fontSize: t.micro, marginTop: spacing.s2 },
});
