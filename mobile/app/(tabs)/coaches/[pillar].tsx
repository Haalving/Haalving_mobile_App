import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoaches, useMe, useSendCircle, type Coach } from '@/api/client-app';
import { Avatar, ClientHeader } from '@/components/client/ClientHeader';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Empty, Pill } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * CH-04 · Get a coach — the per-pillar marketplace (`client-coaches.js`, route
 * #/coaches/:pillar), reached from a pillar's "Get a coach" row on Today.
 *
 * The pillar filter, the coach cards (stats, spec chips, price, Connect), and the
 * "Your coach" marker for the client's current pod coach. Market comes from a
 * The market is real (`GET /client/coaches`), and Connect is real too: it posts
 * the request into the client's own circle, which is where the Super Admin reads
 * it and where the client can see they asked. It changes no pod seat — a coach is
 * ALLOCATED by the team, and a client asking for one is a request, not a
 * reassignment. The demo makes exactly that distinction, and the sentence the
 * request writes says so out loud rather than implying the swap has happened.
 */

const ORDER = ['fitness', 'culture', 'yoga', 'wellness'] as const;
const PILLAR_NAME: Record<string, string> = {
  fitness: 'Fitness',
  culture: 'Nutrition',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function CoachesScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pillar: string }>();
  const me = useMe();
  const market = useCoaches();
  const send = useSendCircle();
  const [asked, setAsked] = useState<string | null>(null);

  /*
   * THE ASK, in the client's own voice, in their own thread.
   *
   * It goes through the circle rather than a bespoke route because that is where
   * the conversation about their care already lives: the Super Admin reads it
   * beside everything else, and the client keeps a record of having asked. A
   * silent request neither of them can point at later is worse than none.
   */
  const request = (co: Coach) =>
    send.mutate(
      `I would like to request ${co.name} as my ${PILLAR_NAME[sel] ?? sel} coach.`,
      { onSuccess: () => setAsked(co.id) },
    );

  const sel = ORDER.includes(params.pillar as (typeof ORDER)[number])
    ? (params.pillar as string)
    : 'fitness';
  const pillarColor: Record<string, string> = {
    fitness: c.fitness,
    culture: c.culture,
    yoga: c.yoga,
    wellness: c.wellness,
  };

  const list = [...(market.data?.[sel] ?? [])].sort(
    (a, b) => Number(b.mine) - Number(a.mine) || (b.rating ?? 0) - (a.rating ?? 0),
  );

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
        <Pressable onPress={() => router.replace('/(tabs)/today')}>
          <Text style={[styles.back, { color: c.brand }]}>‹ Back to Today</Text>
        </Pressable>

        <View style={styles.h1row}>
          <View style={[styles.plate, { backgroundColor: pillarColor[sel] }]} />
          <Text style={[styles.h1, { color: c.ink }]}>Get a coach</Text>
        </View>
        <Text style={[styles.sub, { color: c.ink2 }]}>
          Handpicked {PILLAR_NAME[sel]} experts — a human voice over your AI’s working.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filter}>
          {ORDER.map((k) => {
            const on = k === sel;
            return (
              <Pressable
                key={k}
                onPress={() => router.setParams({ pillar: k })}
                style={[
                  styles.fchip,
                  { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : c.line },
                ]}
              >
                <Text style={{ fontSize: t.xs, fontWeight: on ? '600' : '400', color: on ? c.brand : c.ink2 }}>
                  {PILLAR_NAME[k]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {list.length ? (
          list.map((co) => (
            <CoachCard key={co.id} co={co} asked={asked === co.id} busy={send.isPending} onAsk={() => request(co)} />
          ))
        ) : (
          <Empty icon="users" sentence="Coaches for this pillar are joining soon." />
        )}

        <Text style={[styles.audit, { color: c.ink3 }]}>
          Every HAALVING coach keeps 100% of their coaching earnings.
        </Text>
      </ScrollView>
    </ClientGround>
  );
}

function CoachCard({
  co,
  asked,
  busy,
  onAsk,
}: {
  co: Coach;
  asked: boolean;
  busy: boolean;
  onAsk: () => void;
}) {
  const c = useTheme();
  return (
    <Card style={co.mine ? { borderWidth: 2, borderColor: c.brand } : undefined}>
      <View style={styles.trow}>
        <Avatar name={co.name} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.sm }}>{co.name}</Text>
          <Text style={{ color: c.ink2, fontSize: t.xs }}>{co.title}</Text>
        </View>
        {co.mine ? <Pill tone="ok">Your coach</Pill> : co.rating ? <Stars n={Math.round(co.rating)} /> : null}
      </View>

      <View style={styles.meta}>
        {/* an em dash where nobody has written a number — printing 0.0 would
            claim this coach is rated zero rather than not yet rated */}
        <Stat v={co.rating ? co.rating.toFixed(1) : '—'} label="rating" />
        <Stat v={co.years ? String(co.years) : '—'} label="yrs coaching" />
        {/* clients is COUNTED, so zero here is a true zero, not a blank */}
        <Stat v={String(co.clients)} label="clients" />
      </View>

      <View style={styles.tags}>
        {co.spec.map((s) => (
          <View key={s} style={[styles.tag, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={{ fontSize: t.micro, color: c.ink2 }}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.foot, { borderTopColor: c.lineSoft }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          {/* "Price on request", never "₹0" — a coach nobody has priced is not free */}
          <Text style={{ fontFamily: numFamily(500), fontSize: co.price ? 22 : 15, color: co.price ? c.ink : c.ink3 }}>
            {co.price ? inr(co.price) : 'Price on request'}
          </Text>
          {co.price ? <Text style={{ fontSize: t.xs, color: c.ink3 }}>/month</Text> : null}
        </View>
        {co.mine ? (
          <Text style={{ fontSize: t.sm, color: c.ink2 }}>In your circle</Text>
        ) : (
          <View style={{ minWidth: 110 }}>
            <Button
            label={asked ? 'Requested ✓' : 'Connect'}
            onPress={onAsk}
            disabled={asked || busy}
          />
          </View>
        )}
      </View>
    </Card>
  );
}

function Stat({ v, label }: { v: string; label: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: numFamily(500), fontSize: t.h2, color: c.ink }}>{v}</Text>
      <Text style={{ fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.1, textTransform: 'uppercase', color: c.ink3 }}>
        {label}
      </Text>
    </View>
  );
}

function Stars({ n }: { n: number }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={16} color={i <= n ? c.culture : c.lineStrong} filled={i <= n} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  back: { fontSize: t.xs, fontWeight: '600' },
  h1row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, marginTop: spacing.s2 },
  plate: { width: 44, height: 44, borderRadius: radius.md },
  h1: { fontSize: t.h1, fontWeight: '600', letterSpacing: -0.5 },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.55 },
  filter: { gap: spacing.s2, paddingBottom: spacing.s1 },
  fchip: { borderRadius: radius.full, borderWidth: 1.5, paddingVertical: spacing.s2, paddingHorizontal: spacing.s4, minHeight: 44, justifyContent: 'center' },
  trow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  meta: { flexDirection: 'row', gap: spacing.s6, marginTop: spacing.s3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s3 },
  tag: { borderRadius: radius.full, borderWidth: 1.5, paddingVertical: spacing.s1, paddingHorizontal: spacing.s3 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    borderTopWidth: 1,
    paddingTop: spacing.s3,
    marginTop: spacing.s3,
  },
  audit: { fontSize: t.micro, fontStyle: 'italic' },
});
