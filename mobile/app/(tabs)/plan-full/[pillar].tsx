import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe, usePlanFull, type PlanFullDay, type PlanItem, type PlanSlot } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Card, Empty, Pill } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * FULL PLAN — one pillar, the whole cycle (the Plan hub's "Full plan" tiles).
 *
 * The calendar on My Plan answers "what is on Thursday"; this answers "what is
 * this pillar asking of me for the next fortnight", which is the question a
 * client actually has when they tap Diet. Every day of the cycle is listed with
 * what that pillar prescribes on it, and days it asks nothing of say so rather
 * than being dropped — a fortnight with gaps in the numbering reads as a bug.
 *
 * EVERY WORD HERE IS THE SERVER'S. The dishes, the readings and the session
 * labels come from `/client/plan-full`, described by the same function Today's
 * plate uses, so the day view and the cycle view can never name one meal two
 * ways. Nothing on this screen is computed locally.
 */

const PILLARS = ['culture', 'fitness', 'yoga', 'wellness'] as const;
type PillarKey = (typeof PILLARS)[number];

/** The word the Plan hub's tile uses — `culture` reads "Diet" here, as the demo does. */
const TITLE: Record<PillarKey, string> = {
  culture: 'Diet',
  fitness: 'Fitness',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};

const SUB: Record<PillarKey, string> = {
  culture: 'Every plate your cycle asks for, day by day.',
  fitness: 'Every session your cycle asks for, day by day.',
  yoga: 'Every practice your cycle asks for, day by day.',
  wellness: 'Every wind-down your cycle asks for, day by day.',
};

export default function FullPlanScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pillar: string }>();
  const me = useMe();
  const full = usePlanFull();

  const pillar: PillarKey = PILLARS.includes(params.pillar as PillarKey)
    ? (params.pillar as PillarKey)
    : 'culture';
  const tint: Record<PillarKey, string> = {
    culture: c.culture,
    fitness: c.fitness,
    yoga: c.yoga,
    wellness: c.wellness,
  };

  const days = full.data?.days ?? [];
  /* a cycle where this pillar prescribes nothing at all is a real answer, and a
     different one from "still loading" — the empty state below says which */
  const anything = days.some((d) => rowsFor(d, pillar).length > 0);

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
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="chevL" size={14} color={c.brand} strokeWidth={2} />
          <Text style={[styles.backText, { color: c.brand }]}>Back to My Plan</Text>
        </Pressable>

        <SceneBand
          kicker={`YOUR ${days.length || 14} DAYS`}
          title={TITLE[pillar]}
          sub={SUB[pillar]}
        />

        {full.isPending ? <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} /> : null}

        {full.isError ? (
          <Empty icon="calendar" sentence="We could not reach your plan. Pull down to try again." />
        ) : null}

        {full.data && !anything ? (
          <Empty icon="calendar" sentence={`No ${TITLE[pillar]} is prescribed this cycle yet.`} />
        ) : null}

        {full.data && anything
          ? days.map((d) => <DayCard key={d.day} d={d} pillar={pillar} tint={tint[pillar]} />)
          : null}
      </ScrollView>
    </ClientGround>
  );
}

/**
 * The rows one pillar owns on one day.
 *
 * Nutrition is the plate; every other pillar is its session items. They are two
 * different shapes on purpose — a meal has a dish and a reading, a session has a
 * label and a clock — so the card below renders whichever it was handed.
 */
function rowsFor(d: PlanFullDay, pillar: PillarKey): Array<PlanSlot | PlanItem> {
  return pillar === 'culture' ? d.meals : d.items.filter((it) => it.pillar === pillar);
}

const isMeal = (r: PlanSlot | PlanItem): r is PlanSlot => 'dish' in r;

function DayCard({ d, pillar, tint }: { d: PlanFullDay; pillar: PillarKey; tint: string }) {
  const c = useTheme();
  const rows = rowsFor(d, pillar);
  const flag = d.rest ? 'Rest' : d.review ? 'Review' : d.meeting ? 'Meeting' : null;

  return (
    <Card>
      <View style={styles.dayHead}>
        <Text style={[styles.dayNum, { color: d.today ? c.brand : c.ink }]}>Day {d.day}</Text>
        <Text style={[styles.dayDate, { color: c.ink3 }]}>{d.date}</Text>
        <View style={{ flex: 1 }} />
        {d.today ? <Pill tone="info">Today</Pill> : null}
        {flag ? <Pill tone="neutral">{flag}</Pill> : null}
      </View>

      {rows.length === 0 ? (
        <Text style={[styles.none, { color: c.ink3 }]}>
          {d.rest ? 'Active rest — recovery is the session.' : 'Nothing prescribed here.'}
        </Text>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={[styles.row, { borderTopColor: c.line }, i === 0 ? styles.rowFirst : null]}>
            <View style={[styles.tick, { backgroundColor: tint }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowLabel, { color: c.ink }]}>
                {isMeal(r) ? r.dish || r.slot : r.label}
              </Text>
              <Text style={[styles.rowSub, { color: c.ink2 }]}>{detailOf(r)}</Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

/** "8:00 · Breakfast · 225 kcal · 5.5 g protein", or a session's clock. */
function detailOf(r: PlanSlot | PlanItem): string {
  if (!isMeal(r)) return [r.time, r.booked ? 'booked' : null].filter(Boolean).join(' · ');
  const bits = [r.time, r.dish ? r.slot : null].filter(Boolean) as string[];
  if (r.kcal != null) bits.push(`${r.kcal} kcal`);
  if (r.protein != null) bits.push(`${r1(r.protein)} g protein`);
  return bits.join(' · ');
}

/** 5.5 → "5.5", 210 → "210" — one decimal only when it earns it. */
const r1 = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.s2 },
  backText: { fontSize: t.sm, fontWeight: '600' },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.s2, marginBottom: spacing.s2 },
  dayNum: { fontSize: t.h3, fontWeight: '600' },
  dayDate: { fontSize: t.micro },
  none: { fontSize: t.sm, paddingVertical: spacing.s1 },
  row: { flexDirection: 'row', gap: spacing.s3, paddingVertical: spacing.s2, borderTopWidth: 1 },
  rowFirst: { borderTopWidth: 0 },
  /* the pillar's colour as a rail rather than a dot — it groups the rows without
     asking the reader to learn a key */
  tick: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
  rowLabel: { fontSize: t.sm, fontWeight: '600', lineHeight: t.sm * 1.35 },
  rowSub: { fontSize: t.micro, marginTop: 1 },
});
