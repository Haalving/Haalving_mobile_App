import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlan, useMe, type PlanDay } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { OnboardingGate } from '@/components/client/OnboardingGate';
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

function CalendarTab({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  const router = useRouter();
  const c = useTheme();
  const pc = PILLAR_COLOR(c);
  return (
    <>
      <Card>
        <Text style={[styles.cardTitle, { color: c.ink2 }]}>Sep · your 14-day cycle</Text>
        <View style={styles.calc}>
          {plan.calendar.map((d) => (
            <Cell key={d.day} d={d} pc={pc} />
          ))}
        </View>
        <View style={styles.legend}>
          <LegendDot color={c.ok} label="Done" />
          <LegendDot color={c.danger} label="Missed" dashed />
          <LegendDot color={c.ink3} label="Upcoming" outline />
        </View>
        <Text style={[styles.hint, { color: c.ink2 }]}>Tap a day for its sessions and your progress in them.</Text>
      </Card>

      <View style={styles.tiles}>
        {plan.tiles.map((tile) => (
          /* the chevron promised a destination the tile never had — it opens the
             pillar's whole cycle now, which is what the demo's tile does */
          <Pressable
            key={tile.key}
            onPress={() => router.push({ pathname: '/plan-full/[pillar]', params: { pillar: tile.key } })}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.tilePlate, { backgroundColor: pc[tile.key] }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.xs }}>{tile.word}</Text>
              <Text style={{ color: c.ink2, fontSize: t.micro }}>Full plan</Text>
            </View>
            <Icon name="chevR" size={14} color={c.ink3} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

function Cell({ d, pc }: { d: PlanDay; pc: Record<string, string> }) {
  const c = useTheme();
  const bg = d.rest ? c.surface3 : d.review || d.meeting ? c.brandWash : c.surface2;
  return (
    <View
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
          <DayMark key={i} pillar={m.pillar} status={m.status} color={pc[m.pillar] ?? c.ink3} />
        ))}
      </View>
      {d.flag ? <Text style={[styles.cellFlag, { color: d.rest ? c.ink3 : c.brand }]}>{d.flag}</Text> : null}
    </View>
  );
}

/** Nutrition · Fitness · Yoga · Mind Wellness — the product's own words. */
const PILLAR_NAME: Record<string, string> = {
  culture: 'Nutrition',
  fitness: 'Fitness',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
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
function DayMark({ pillar, status, color }: { pillar: string; status: string; color: string }) {
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
        style={[styles.markText, { color: done ? c.surface : missed ? c.danger : color }]}
      >
        {PILLAR_NAME[pillar] ?? pillar}
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
    paddingHorizontal: 5,
  },
  markText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },
  cellFlag: { fontSize: t.micro, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3, marginTop: spacing.s3 },
  hint: { fontSize: t.sm, lineHeight: t.sm * 1.5 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  tile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 56,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  tilePlate: { width: 44, height: 44, borderRadius: radius.md },

  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  lrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s2 },
  lmark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  trow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  iconTile: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
