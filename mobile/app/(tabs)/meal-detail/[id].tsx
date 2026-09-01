import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe, useMeal } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Notice, Pill } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * TR-04/05 · Meal detail — the star reveal and its pending states
 * (`client-meal.js` `meal-detail`, route #/meal-detail/:id).
 *
 * Three branches, exactly as the demo: A a rated meal (lg stars, voice note,
 * the coach's note, the rubric, the plate); B an observation meal (capture-only
 * notice, no stars); C a meal pending with the dietitian. The meal comes from a
 * fixture until `GET /client/meals/:id` ships.
 */
export default function MealDetailScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const meal = useMeal(String(id));

  const m = meal.data;

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
        {meal.isPending ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} />
        ) : null}

        {m ? (
          <>
            <Text style={[styles.h1c, { color: c.ink }]}>Your {m.slot.toLowerCase()}</Text>

            {m.final ? (
              /* -------- Branch A · rated -------- */
              <>
                <View style={{ alignItems: 'center' }}>
                  <Stars n={m.final.stars} size={26} />
                </View>
                <Text style={[styles.centerSub, { color: c.ink2 }]}>
                  Rated by <Text style={{ fontWeight: '600', color: c.ink }}>{m.final.byName}</Text>
                  {' · '}
                  {m.final.isAI ? 'instantly' : 'human-confirmed'}
                  {m.final.stars === 5 ? '  ' : ''}
                </Text>
                {m.final.stars === 5 ? (
                  <View style={{ alignItems: 'center' }}>
                    <Pill tone="ok">Perfect plate</Pill>
                  </View>
                ) : null}

                {m.final.voiceSec > 0 ? (
                  <Card>
                    <Text style={[styles.k, { color: c.ink3 }]}>VOICE NOTE FROM {m.final.byName.toUpperCase()}</Text>
                    <Voice sec={m.final.voiceSec} />
                  </Card>
                ) : null}

                <Notice>“{m.final.note}” — {m.final.byName}</Notice>

                <Card>
                  <Text style={[styles.k, { color: c.ink3 }]}>WHY {m.final.stars} {m.final.stars === 1 ? 'STAR' : 'STARS'}</Text>
                  {m.final.rubric.map((r) => (
                    <View key={r.label} style={styles.rubricRow}>
                      <Text style={{ color: c.ink, fontSize: t.sm }}>{r.label}</Text>
                      <Text style={{ fontFamily: numFamily(600), color: c.ink, fontSize: t.sm }}>
                        {r.value}
                      </Text>
                    </View>
                  ))}
                </Card>

                <Plate m={m} />
              </>
            ) : m.observation ? (
              /* -------- Branch B · observation, capture-only -------- */
              <>
                <MealArt />
                <Notice>
                  Saved to your observation log · captured {m.ago}. Days 1–5 are capture-only — we
                  learn your normal before we change anything, so no rating is expected here.
                </Notice>
                <Plate m={m} note={`Felt “${m.fullness}”`} />
              </>
            ) : (
              /* -------- Branch C · pending with the dietitian -------- */
              <>
                <Card style={{ alignItems: 'center' }}>
                  <MealArt />
                  <Text style={[styles.kicker, { color: c.brand }]}>WITH YOUR DIETITIAN</Text>
                  <Text style={[styles.centerSub, { color: c.ink2 }]}>{m.pendingLine}</Text>
                </Card>
                <Plate m={m} note={`Felt “${m.fullness}”`} />
              </>
            )}

            <Button label="See today’s food log" variant="ghost" onPress={() => {}} />
            <Button label="Back to Home" variant="ghost" onPress={() => router.replace('/(tabs)/today')} />
          </>
        ) : null}

        {meal.isError ? <Notice tone="bad">We couldn’t find that meal.</Notice> : null}
      </ScrollView>
    </ClientGround>
  );
}

/** lg star row — filled to n, the rest outlined; gold like the demo's `--culture`. */
function Stars({ n, size }: { n: number; size: number }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          color={i <= n ? c.culture : c.lineStrong}
          filled={i <= n}
        />
      ))}
    </View>
  );
}

/** The voice note — a play disc, a waveform stand-in, and the duration. */
function Voice({ sec }: { sec: number }) {
  const c = useTheme();
  return (
    <View style={[styles.voice, { backgroundColor: c.surface2 }]}>
      <View style={[styles.voicePlay, { backgroundColor: c.brandFill }]}>
        <Icon name="play" size={11} color="#fff" filled strokeWidth={2} />
      </View>
      <View style={[styles.voiceWave, { backgroundColor: c.ink3 }]} />
      <Text style={{ fontFamily: numFamily(400), color: c.ink2, fontSize: t.xs }}>
        0:{String(sec).padStart(2, '0')}
      </Text>
    </View>
  );
}

/** The 200px meal art — the bowl mark on a gradient (no photo bundled yet). */
function MealArt() {
  const c = useTheme();
  return (
    <View style={[styles.mealArt, { backgroundColor: c.surface2 }]}>
      <Icon name="bowl" size={52} color={c.ink3} strokeWidth={1.5} />
    </View>
  );
}

/** "On the plate" — dish chips + the macro line. */
function Plate({ m, note }: { m: { dishes: string[]; protein: number; kcal: number; fullness: string }; note?: string }) {
  const c = useTheme();
  return (
    <Card>
      <Text style={[styles.k, { color: c.ink3 }]}>ON THE PLATE</Text>
      <View style={styles.chipWrap}>
        {m.dishes.map((d) => (
          <View key={d} style={[styles.chip, { backgroundColor: c.brandWash, borderColor: c.brand }]}>
            <Text style={{ fontSize: t.xs, fontWeight: '600', color: c.brand }}>{d}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.plateMeta, { color: c.ink2 }]}>
        {note ?? `${m.protein} g protein · ${m.kcal} kcal · felt “${m.fullness}”`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  h1c: { fontSize: t.h1, fontWeight: '600', letterSpacing: -0.5, textAlign: 'center', marginTop: 10 },
  centerSub: { fontSize: t.sm, lineHeight: t.sm * 1.55, textAlign: 'center' },
  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  kicker: {
    fontSize: t.micro,
    fontWeight: '600',
    letterSpacing: t.micro * 0.16,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: spacing.s3,
  },
  rubricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: radius.full,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    marginTop: 6,
  },
  voicePlay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceWave: { flex: 1, height: 16, borderRadius: 2, opacity: 0.42 },
  mealArt: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s1 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  plateMeta: { fontFamily: numFamily(400), fontSize: t.sm, marginTop: spacing.s2 },
});
