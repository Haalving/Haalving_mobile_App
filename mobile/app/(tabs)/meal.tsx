import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { useCaptureMeal, useMe } from '@/api/client-app';
import { uploadFile, type PickedFile } from '@/api/uploads';
import { ClientHeader } from '@/components/client/ClientHeader';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * TR-01..03 · Log a meal — the three-step capture wizard (`client-meal.js`,
 * `HV.registerView('meal')`, route #/meal).
 *
 * Photo → Fullness → Confirm. Reached from My Circle's camera. The "AI detection"
 * is the demo's own hardcoded three dishes (`DETECTED`, client-meal.js:9) — not a
 * catalogue read. "Log this meal" POSTs the slot, fullness and confirmed dishes to
 * `/client/meals`, then returns to where it was opened (My Circle), where the plate
 * now shows as a card — and lands on the team's Meals queue to be rated.
 *
 * THE PHOTO IS REAL NOW. The camera opens, the shot goes straight to Cloudflare
 * R2 from the handset, and the KEY travels client → API → `Meal.photo`. It is
 * still OPTIONAL: a client who cannot get a photo (no light, no permission, a
 * hurry) can log the plate anyway, because a meal nobody recorded is worse than
 * one recorded without a picture. The
 * R2 bucket lands only the capture-and-upload step has to be filled in. The
 * fullness slider is likewise a three-stop control (no native Slider dependency).
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
  /* the shot, and the key it became once R2 had it. `shot` is what the client
     sees on the confirm step; `photoKey` is what the record stores. */
  const [shot, setShot] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* return to wherever the wizard was opened — My Circle, where the plate's card
     now appears — falling back to Today if there is no back stack (a deep link). */
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));

  /* POST the plate the client confirmed, then return to the room where it now
     shows as a card. dishes must be 1-6, so the button guards on emptiness. */
  const logMeal = () =>
    capture.mutate(
      {
        slot: slotByTime(),
        fullness: FULLNESS[fullness] ?? 'Just right',
        dishes: selected,
        /* null rather than undefined when there is no photo — the field is
           nullish on the API, and a plate logged without one is a real case */
        photo: photoKey,
      },
      { onSuccess: leave },
    );

  const obs = me.data?.observation ?? false;
  const diet =
    firstName(me.data?.pod?.find((s) => s.seat === 'dietitian')?.name ?? '') || 'your dietitian';

  /**
   * TAKE THE PHOTO, THEN SEND IT — and only then move on.
   *
   * The upload happens here rather than on Confirm so a client learns about a
   * failed upload while the plate is still in front of them, not after they have
   * answered two more questions.
   *
   * A REFUSED PERMISSION IS NOT AN ERROR. Somebody who will not give the camera
   * away can still log what they ate; the wizard moves to fullness with no photo
   * rather than stopping to argue about it.
   */
  const takePhoto = async () => {
    setErr(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErr('No camera access — you can still log the plate without a photo.');
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      /* 0.7 and a long edge of 1600: a dietitian is reading what is on the plate,
         not counting grains, and a 12 MP original is a slow upload on hotel wifi */
      quality: 0.7,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.length) return;

    const a = res.assets[0];
    if (!a) return;
    const file: PickedFile = {
      uri: a.uri,
      name: a.fileName ?? `plate-${Date.now()}.jpg`,
      mime: a.mimeType ?? 'image/jpeg',
      bytes: a.fileSize ?? 0,
    };

    setBusy(true);
    try {
      setShot(a.uri);
      setPhotoKey(await uploadFile('meals', file));
      setStep(2);
    } catch (e) {
      /* keep the shot on screen — they can go on without it, or try again */
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
              {shot ? (
                <Image source={{ uri: shot }} style={styles.shot} contentFit="cover" />
              ) : (
                <Icon name="camera" size={52} color={c.ink3} strokeWidth={1.5} />
              )}
            </View>
            <Text style={[styles.centerSub, { color: c.ink2 }]}>
              {busy
                ? 'Sending your photo…'
                : 'Your photo keeps its original capture time.'}
            </Text>
            {/* said plainly and kept on screen: a refused camera or a failed
                upload does not stop the plate being logged */}
            {err ? (
              <Text style={[styles.centerSub, { color: c.amber }]}>{err}</Text>
            ) : null}
            <Button
              label={busy ? 'Uploading…' : shot ? 'Retake' : 'Capture'}
              onPress={() => void takePhoto()}
              disabled={busy}
            />
            {/* the way past a camera that will not cooperate */}
            <Button
              label={shot ? 'Continue' : 'Continue without a photo'}
              variant="ghost"
              onPress={() => setStep(2)}
              disabled={busy}
            />
            <Button label="Not now" variant="ghost" onPress={leave} disabled={busy} />
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
  shot: { width: '100%', height: '100%', borderRadius: radius.md },
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
