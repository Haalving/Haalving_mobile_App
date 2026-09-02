import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCaptureMeal, useMe } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * TR-01..03 · Log a meal — the three-step capture wizard (`client-meal.js`,
 * `HV.registerView('meal')`, route #/meal).
 *
 * Photo → Fullness → Confirm. The "AI detection" is the demo's own hardcoded
 * three dishes (`DETECTED`, client-meal.js:9) — not a catalogue read. "Log this
 * meal" POSTs the slot, fullness and confirmed dishes to `/client/meals` and lands
 * back on Today, where the plate now shows on the board.
 *
 * WHAT IS STILL A PLACEHOLDER: the camera is a viewfinder graphic (no expo-camera
 * yet), so the plate is logged without a photo; the fullness slider is a three-stop
 * control (no native Slider dependency). Both are visual, not the write path.
 */

const FULLNESS = ['Light', 'Just right', 'Stuffed'] as const;
/* the demo's stubbed "AI detection" (client-meal.js:9) */
const DETECTED = ['Vegetable pulao', 'Raita', 'Salad'] as const;

const firstName = (name: string): string => String(name || '').split(' ')[0] ?? '';

/** Breakfast / Lunch / Dinner by the hour, as the demo slots it (client-meal.js:11). */
function slotByTime(now = new Date()): string {
  const h = now.getHours();
  return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : 'Dinner';
}

export default function MealScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullness, setFullness] = useState(1);
  const [selected, setSelected] = useState<string[]>([...DETECTED]);
  const capture = useCaptureMeal();

  /* POST the plate the client confirmed, then land back on Today where it now
     shows on the board. dishes must be 1-6, so the button guards on emptiness. */
  const logMeal = () =>
    capture.mutate(
      { slot: slotByTime(), fullness: FULLNESS[fullness] ?? 'Just right', dishes: selected },
      { onSuccess: () => router.replace('/(tabs)/today') },
    );

  const obs = me.data?.observation ?? false;
  const diet =
    firstName(me.data?.pod?.find((s) => s.seat === 'dietitian')?.name ?? '') || 'your dietitian';

  const toggleDish = (d: string) =>
    setSelected((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

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
        <Stepper step={step} />

        {step === 1 ? (
          <>
            <H1>Log a meal</H1>
            <Sub>
              {obs
                ? 'Observation days 1–5: we capture and learn your normal — no ratings yet, no judgement.'
                : `Point, shoot, done — ${diet} takes it from there.`}
            </Sub>
            <View style={[styles.viewfinder, { backgroundColor: c.surface2 }]}>
              <Icon name="camera" size={52} color={c.ink3} strokeWidth={1.5} />
            </View>
            <Text style={[styles.centerSub, { color: c.ink2 }]}>
              Camera viewfinder · works offline — your photo keeps its original capture time.
            </Text>
            <Button label="Capture" onPress={() => setStep(2)} />
            <Button label="Not now" variant="ghost" onPress={() => router.replace('/(tabs)/today')} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <H1>How full are you?</H1>
            <Card>
              <View style={styles.row}>
                <View style={[styles.bowlSm, { backgroundColor: c.surface3 }]}>
                  <Icon name="bowl" size={22} color={c.ink3} strokeWidth={1.5} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.b, { color: c.ink }]}>Photo saved.</Text>
                  <Text style={[styles.smSub, { color: c.ink2 }]}>
                    One honest answer helps {diet} read the plate — there is no wrong one.
                  </Text>
                </View>
              </View>
              <Fullness value={fullness} onChange={setFullness} />
            </Card>
            <Button label="Next" onPress={() => setStep(3)} />
            <Button label="‹ Retake photo" variant="ghost" onPress={() => setStep(1)} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <H1>Confirm your dishes</H1>
            <View style={styles.row}>
              <View style={[styles.bowlSm, { backgroundColor: c.surface3 }]}>
                <Icon name="bowl" size={22} color={c.ink3} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.b, { color: c.ink }]}>{slotByTime()}</Text>
                <Text style={[styles.smSub, { color: c.ink2 }]}>
                  Felt “{FULLNESS[fullness]}” · just now
                </Text>
              </View>
            </View>

            {/* the AI-draft wrapper (.aidraft) — brand-wash card with the sparkle label */}
            <View style={[styles.aidraft, { backgroundColor: c.brandWash }]}>
              <View style={styles.aidraftLbl}>
                <Icon name="sparkle" size={13} color={c.brand} strokeWidth={1.6} />
                <Text style={[styles.aidraftLblText, { color: c.brand }]}>
                  AI DRAFT — REVIEW BEFORE USE
                </Text>
              </View>
              <Text style={[styles.b, { color: c.ink }]}>We think this is…</Text>
              <View style={styles.chipWrap}>
                {DETECTED.map((d) => {
                  const on = selected.includes(d);
                  return (
                    <DishChip key={d} label={d} on={on} onPress={() => toggleDish(d)} />
                  );
                })}
                <DishChip label="＋ Correct a dish" on={false} onPress={() => {}} />
              </View>
            </View>

            <Sub>
              {obs
                ? 'Tap a dish to keep or remove it — during observation we simply save the plate; no rating will be sent.'
                : `Tap a dish to keep or remove it — your corrections go straight to ${diet}.`}
            </Sub>

            <Button
              label="Log this meal"
              onPress={logMeal}
              loading={capture.isPending}
              disabled={selected.length === 0}
            />
            <Button label="‹ Back" variant="ghost" onPress={() => setStep(2)} />
          </>
        ) : null}
      </ScrollView>
    </ClientGround>
  );
}

/* ---- the stepper — .stepper (app.css:1221) ---- */
function Stepper({ step }: { step: number }) {
  const c = useTheme();
  const labels = ['1 · Photo', '2 · Fullness', '3 · Confirm'];
  return (
    <View style={styles.stepper}>
      {labels.map((l, i) => {
        const done = i + 1 < step;
        const cur = i + 1 === step;
        return (
          <View key={l} style={styles.stepperItem}>
            <View
              style={[
                styles.stepPill,
                {
                  backgroundColor: cur ? c.brandFill : done ? c.brandWash : c.surface,
                  borderColor: done || cur ? 'transparent' : c.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.stepPillText,
                  { color: cur ? '#fff' : done ? c.brand : c.ink3 },
                ]}
              >
                {l}
              </Text>
            </View>
            {i < labels.length - 1 ? <Text style={{ color: c.ink3 }}>—</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The 3-stop fullness control. The demo is an `<input type=range>`; without a
 * native slider dependency this is the demo's three labels over a track with a
 * thumb at the chosen stop — the active label bolds to brand ink (client-meal.js
 * paint(), lines 156-160).
 */
function Fullness({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const c = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <View style={[styles.track, { backgroundColor: c.surface3 }]}>
        <View
          style={[
            styles.thumb,
            { backgroundColor: c.brand, left: `${(value / 2) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.fLabels}>
        {FULLNESS.map((l, i) => (
          <Pressable key={l} onPress={() => onChange(i)} style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: t.micro,
                textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                fontWeight: i === value ? '700' : '400',
                color: i === value ? c.brand : c.ink2,
              }}
            >
              {l}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DishChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: on ? c.brandWash : c.surface,
          borderColor: on ? c.brand : c.line,
        },
      ]}
    >
      <Text style={{ fontSize: t.xs, fontWeight: on ? '600' : '400', color: on ? c.brand : c.ink2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.h1, { color: c.ink }]}>{children}</Text>;
}
function Sub({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.sub, { color: c.ink2 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  h1: { fontSize: t.h1, fontWeight: '600', letterSpacing: -0.5, lineHeight: t.h1 * 1.2 },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.55 },
  centerSub: { fontSize: t.sm, lineHeight: t.sm * 1.55, textAlign: 'center' },
  b: { fontSize: t.body, fontWeight: '600' },
  smSub: { fontSize: t.xs, lineHeight: t.xs * 1.5, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1, flexWrap: 'wrap' },
  stepperItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1 },
  stepPill: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1 },
  stepPillText: { fontSize: t.micro, fontWeight: '600' },

  /* .mealph.lg — 200px gradient viewfinder */
  viewfinder: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowlSm: {
    width: 56,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  track: { height: 4, borderRadius: radius.full, position: 'relative' },
  thumb: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
  },
  fLabels: { flexDirection: 'row', marginTop: spacing.s2 },

  aidraft: { borderRadius: radius.md, padding: spacing.s4, gap: spacing.s1 },
  aidraftLbl: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginBottom: spacing.s1 },
  aidraftLblText: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s1 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    alignSelf: 'flex-start',
  },
});
