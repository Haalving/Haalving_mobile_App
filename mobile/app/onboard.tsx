import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, setAccessToken, setRefreshToken } from '@/api/client';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * Onboarding — the standalone first-run flow (`client-onboard.js`,
 * `standalone: true`, #/onboard). No shell, no session; it builds an Arrival.
 *
 * Chapters (its header comment): welcome → you (name · mobile + OTP) → the story →
 * focus (conditions · goals · fitness) → measures (height · weight · body comp) →
 * guide (Svayam / Poorna) → begin. Always the dark night scene.
 *
 * DEFERRED this breadth pass (documented in docs/pixel/TODO.md): the swipe story
 * deck is a static card, and the measure "tapes" are a readout with ±steppers
 * rather than the drag instrument. The load-bearing behaviour — the segmented
 * progress, the guide step, and Svayam's "Opening soon" refusing the tap — is here.
 * POST /client/onboard (create the Arrival) is C4 backend; "Begin" routes to login.
 */

const GOALS = ['Lose weight', 'Build strength', 'More energy daily', 'Sleep better', 'Reduce stress', 'Eat healthier', 'Improve flexibility', 'Build healthy habits'];
const CONDS = ['Manage diabetes', 'Blood pressure', 'Thyroid condition', 'PCOS / PCOD', 'Back or joint pain', 'High cholesterol'];
const FITS = [
  { key: 'beginner', name: 'Just starting', tag: 'New to it', line: 'Little or no regular exercise right now.' },
  { key: 'intermediate', name: 'Somewhat active', tag: 'On and off', line: 'Move a few days a week, not always to plan.' },
  { key: 'advanced', name: 'Consistently active', tag: 'Steady', line: 'Train most weeks and want to go further.' },
  { key: 'elite', name: 'Very fit', tag: 'Athletic', line: 'Structured training is already part of life.' },
];
/* the two guide doors — poorna launched, svayam "Opening soon" (HV.PLANS launch flags) */
const GUIDES = [
  { key: 'svayam', name: 'Svayam', title: 'Your AI coach, end to end', price: '₹5,000', per: '/month', launch: false },
  { key: 'poorna', name: 'Poorna', title: 'A dedicated team of experts', price: null, per: '', launch: true },
];

/* five chapters, as the demo groups the steps */
const STEPS = ['welcome', 'you', 'goals', 'conditions', 'fitness', 'measures', 'guide', 'begin'] as const;
type Step = (typeof STEPS)[number];
const SEGMENTS = 5;
const KICKER: Partial<Record<Step, string>> = {
  you: 'Chapter one · You',
  goals: 'Chapter three · Your focus',
  conditions: 'Chapter three · Your focus',
  fitness: 'Chapter three · Your focus',
  measures: 'Chapter four · Your measures',
  guide: 'Chapter five · Your guide',
  begin: 'Your beginning',
};

export default function OnboardScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [conds, setConds] = useState<string[]>([]);
  const [fit, setFit] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /*
   * THE LAST CARD SUBMITS. `POST /client/onboard` is token-less — it MINTS the
   * first session — so on success we store the pair exactly as the login screen
   * does and drop the prospect straight into the app. The plan is Poorna: Svayam
   * is not on sale this launch, and the server refuses it anyway.
   */
  const onboard = useMutation({
    mutationFn: () =>
      api.post<{ accessToken: string; refreshToken: string; user: { id: string; role: string; name: string } }>(
        '/client/onboard',
        {
          name: name.trim(),
          phone: phone.trim(),
          plan: 'poorna',
          ...(goals.length ? { goal: goals.join(', ').slice(0, 280) } : {}),
        },
      ),
    onSuccess: async (data) => {
      setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);
      router.replace('/(tabs)/today');
    },
    onError: (e) =>
      setToast(e instanceof ApiError ? e.message : 'We couldn’t start your account. Try again.'),
  });

  const begin = () => {
    /* the two answers Chapter one asks for are the two the server requires */
    if (name.trim().length < 2 || phone.trim().length < 10) {
      setToast('Add your name and mobile number to begin.');
      setI(STEPS.indexOf('you'));
      return;
    }
    onboard.mutate();
  };

  const back = () => setI((n) => Math.max(0, n - 1));
  const next = () => setI((n) => Math.min(STEPS.length - 1, n + 1));
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  /* segment fill fraction (0..1) per chapter — welcome is pre-chapter */
  const segFill = (seg: number) => {
    const idxOfSeg = [1, 2, 4, 5, 6]; // representative step index per chapter start
    if (i > (idxOfSeg[seg] ?? 99)) return 1;
    if (i === (idxOfSeg[seg] ?? -1)) return 0.5;
    return 0;
  };

  return (
    <ClientGround>
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + spacing.s4, paddingBottom: insets.bottom + spacing.s7 },
        ]}
      >
        {/* header — back, segmented progress, skip (hidden on welcome) */}
        {step !== 'welcome' ? (
          <View style={styles.head}>
            <Pressable onPress={back} style={[styles.backBtn, { backgroundColor: c.surface }]} accessibilityLabel="Back">
              <Icon name="chevL" size={17} color={c.ink2} strokeWidth={1.8} />
            </Pressable>
            <View style={styles.seg}>
              {Array.from({ length: SEGMENTS }, (_, s) => (
                <View key={s} style={[styles.segTrack, { backgroundColor: c.surface3 }]}>
                  <View style={{ height: '100%', backgroundColor: c.brand, width: `${segFill(s) * 100}%` }} />
                </View>
              ))}
            </View>
            {step !== 'begin' ? (
              <Pressable onPress={next}>
                <Text style={[styles.skip, { color: c.ink3 }]}>Skip</Text>
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        ) : null}

        <View style={styles.body}>
          {KICKER[step] ? <Text style={[styles.kicker, { color: c.brand }]}>{KICKER[step]}</Text> : null}

          {step === 'welcome' ? (
            <>
              <Text style={[styles.wm, { color: '#fff' }]}>HAALVING</Text>
              <View style={{ height: spacing.s9 }} />
              <Text style={[styles.kicker, { color: c.brand }]}>Welcome</Text>
              <Q>A way of living, measured beautifully.</Q>
              <Qs>HAALVING studies how you already live, then builds your practice around it — four pillars, one calendar, a circle of care.</Qs>
            </>
          ) : null}

          {step === 'you' ? (
            <>
              <Q>Let’s begin with you.</Q>
              <Qs>Only your care team ever sees what you share here.</Qs>
              <Text style={[styles.fieldLabel, { color: c.ink2 }]}>Name</Text>
              <Field value={name} onChangeText={setName} placeholder="Your first name" />
              <Text style={[styles.fieldLabel, { color: c.ink2 }]}>Mobile number</Text>
              <Field value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" />
              <Text style={[styles.audit, { color: c.ink3, textAlign: 'center' }]}>
                Two answers are enough to begin — everything else is asked in your assessment, as a conversation.
              </Text>
            </>
          ) : null}

          {step === 'goals' ? (
            <>
              <Q>What changes do you want?</Q>
              <Qs>Choose the ones that matter. Your circle builds the first cycle around them.</Qs>
              <ChipGrid items={GOALS} sel={goals} onToggle={(v) => toggle(goals, setGoals, v)} />
            </>
          ) : null}

          {step === 'conditions' ? (
            <>
              <Q>Anything your circle should hold?</Q>
              <Qs>Conditions shape the plan — they never exclude you from it.</Qs>
              <ChipGrid items={CONDS} sel={conds} onToggle={(v) => toggle(conds, setConds, v)} />
            </>
          ) : null}

          {step === 'fitness' ? (
            <>
              <Q>How fit are you right now?</Q>
              <Qs>Be honest — this sets your starting intensity, never your worth.</Qs>
              <View style={{ gap: spacing.s2 }}>
                {FITS.map((f) => {
                  const on = fit === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFit(f.key)}
                      style={[styles.choice, { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : 'transparent' }]}
                    >
                      <View style={styles.choiceTop}>
                        <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.body }}>{f.name}</Text>
                        <View style={[styles.pillN, { backgroundColor: c.surface2 }]}>
                          <Text style={{ fontSize: t.micro, fontWeight: '600', color: c.ink2 }}>{f.tag}</Text>
                        </View>
                      </View>
                      <Text style={{ color: c.ink2, fontSize: t.xs, marginTop: 2 }}>{f.line}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {step === 'measures' ? (
            <>
              <Q>Your measures.</Q>
              <Qs>A starting point, not a verdict — we watch the trend, never one day.</Qs>
              <Stepper label="Height" unit="cm" start={170} min={120} max={210} />
              <Stepper label="Weight" unit="kg" start={70} min={35} max={180} />
              <Text style={[styles.audit, { color: c.ink3 }]}>
                A closer body-composition reading, from any smart scale, is optional — your coach adds it later.
              </Text>
            </>
          ) : null}

          {step === 'guide' ? (
            <>
              <Q>How would you like to be guided?</Q>
              <Qs>We are opening with Poorna — a coach on every pillar. Svayam, the AI-guided door, follows.</Qs>
              <View style={{ gap: spacing.s3 }}>
                {GUIDES.map((g) => {
                  const on = guide === g.key;
                  const open = g.launch;
                  return (
                    <Pressable
                      key={g.key}
                      onPress={() =>
                        open
                          ? setGuide(g.key)
                          : setToast('Svayam opens after our first launch — Poorna is the door in today.')
                      }
                      style={[
                        styles.plan,
                        { backgroundColor: c.surface, borderColor: on ? c.brand : 'transparent', opacity: open ? 1 : 0.55 },
                      ]}
                    >
                      <Text style={[styles.pname, { color: c.brand2 }]}>{g.name.toUpperCase()}</Text>
                      <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.h3, marginTop: 4 }}>{g.title}</Text>
                      <View style={styles.planFoot}>
                        {open ? (
                          g.price ? (
                            <Text style={{ fontFamily: 'System', color: c.ink, fontSize: 22, fontWeight: '600' }}>
                              {g.price}
                              <Text style={{ fontSize: t.xs, color: c.ink3, fontWeight: '400' }}>{g.per}</Text>
                            </Text>
                          ) : (
                            <Text style={{ fontSize: t.micro, fontWeight: '600', color: c.ink3 }}>
                              By invitation · contact us to know the details
                            </Text>
                          )
                        ) : (
                          <Text style={{ fontSize: t.micro, fontWeight: '600', color: c.ink3 }}>Opening soon</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {toast ? <Text style={[styles.toast, { color: c.amber }]}>{toast}</Text> : null}
            </>
          ) : null}

          {step === 'begin' ? (
            <>
              <Q>Five quiet days come first.</Q>
              <Qs>We watch how you already live before we change a single thing — your plan is built from your normal, not a template.</Qs>
              <View style={[styles.card, { backgroundColor: c.surface }]}>
                <Text style={[styles.k, { color: c.ink3 }]}>WHAT YOU TOLD US</Text>
                <Srow label="Name" value={name || 'Guest'} />
                <Srow label="Goals" value={goals.length ? `${goals.length} chosen` : 'To be chosen with your circle'} />
                <Srow label="Health notes" value={conds.length ? `${conds.length} flagged` : 'Nothing flagged'} />
                <Srow label="Fitness" value={fit ? (FITS.find((f) => f.key === fit)?.name ?? '—') : '—'} />
                <Srow label="Your guide" value={guide ? (GUIDES.find((g) => g.key === guide)?.name ?? '—') : 'To choose'} />
              </View>
              <Text style={[styles.audit, { color: c.ink3 }]}>
                Your first message is waiting in My Circle — your assessment begins there.
              </Text>
            </>
          ) : null}
        </View>

        {/* foot CTA */}
        <View style={styles.foot}>
          {step === 'welcome' ? (
            <>
              <Button label="Begin" onPress={begin} loading={onboard.isPending} />
              <Button label="I already have an account" variant="ghost" onPress={() => router.replace('/(auth)/login')} />
            </>
          ) : step === 'begin' ? (
            <Button label="Enter your observation window" onPress={() => router.replace('/(auth)/login')} />
          ) : (
            <Button label="Continue" onPress={next} />
          )}
        </View>
      </ScrollView>
    </ClientGround>
  );
}

function ChipGrid({ items, sel, onToggle }: { items: string[]; sel: string[]; onToggle: (v: string) => void }) {
  const c = useTheme();
  return (
    <View style={styles.chipGrid}>
      {items.map((v) => {
        const on = sel.includes(v);
        return (
          <Pressable
            key={v}
            onPress={() => onToggle(v)}
            style={[styles.gchip, { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : 'transparent' }]}
          >
            <Text style={{ fontSize: t.xs, fontWeight: '600', color: on ? c.ink : c.ink2 }}>{v}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A measure readout with ± steppers (the demo's drag tape, simplified). */
function Stepper({ label, unit, start, min, max }: { label: string; unit: string; start: number; min: number; max: number }) {
  const c = useTheme();
  const [v, setV] = useState(start);
  return (
    <View style={{ alignItems: 'center', gap: spacing.s3, marginTop: spacing.s3 }}>
      <Text style={[styles.fieldLabel, { color: c.ink2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s4 }}>
        <Round onPress={() => setV((n) => Math.max(min, n - 1))}>−</Round>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontFamily: 'System', fontSize: 56, fontWeight: '500', color: c.ink }}>{v}</Text>
          <Text style={{ fontSize: t.h3, color: c.ink3 }}>{unit}</Text>
        </View>
        <Round onPress={() => setV((n) => Math.min(max, n + 1))}>＋</Round>
      </View>
    </View>
  );
}

function Round({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.round, { backgroundColor: c.surface2 }]}>
      <Text style={{ fontSize: 20, color: c.ink }}>{children}</Text>
    </Pressable>
  );
}

function Srow({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={styles.srow}>
      <Text style={{ fontSize: t.sm, color: c.ink2 }}>{label}</Text>
      <Text style={{ fontSize: t.sm, color: c.ink, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  const c = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={c.ink3}
      style={[styles.input, { backgroundColor: c.surface, borderColor: c.line, color: c.ink }]}
    />
  );
}
function Q({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.q, { color: c.ink }]}>{children}</Text>;
}
function Qs({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.qs, { color: c.ink2 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: spacing.s5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, marginBottom: spacing.s4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, flexDirection: 'row', gap: spacing.s1, maxWidth: 180, alignSelf: 'center' },
  segTrack: { flex: 1, height: 3, borderRadius: radius.full, overflow: 'hidden' },
  skip: { fontSize: t.xs, fontWeight: '600' },
  body: { flex: 1, gap: spacing.s4, paddingVertical: spacing.s4 },
  kicker: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.16, textTransform: 'uppercase', textAlign: 'center' },
  wm: { fontSize: t.h3, fontWeight: '600', letterSpacing: 5, textAlign: 'center' },
  q: { fontSize: t.display, fontWeight: '600', letterSpacing: -1, lineHeight: t.display * 1.12, textAlign: 'center', color: '#fff' },
  qs: { fontSize: t.sm, textAlign: 'center', alignSelf: 'center', maxWidth: 320, lineHeight: t.sm * 1.4 },
  fieldLabel: { fontSize: t.sm, fontWeight: '600' },
  input: { borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.s3, paddingHorizontal: spacing.s4, fontSize: t.body },
  audit: { fontSize: t.micro, fontStyle: 'italic', lineHeight: t.micro * 1.5 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  gchip: { minHeight: 52, justifyContent: 'center', borderWidth: 2, borderRadius: radius.md, paddingVertical: spacing.s2, paddingHorizontal: spacing.s3, width: '48.5%' },

  choice: { borderWidth: 2, borderRadius: radius.md, padding: spacing.s4 },
  choiceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, flexWrap: 'wrap' },
  pillN: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10 },

  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  plan: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.s5, paddingHorizontal: spacing.s4, gap: spacing.s2 },
  pname: { fontSize: 22, fontWeight: '600', letterSpacing: 3.5 },
  planFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, flexWrap: 'wrap', marginTop: 4 },
  toast: { fontSize: t.xs, textAlign: 'center' },

  card: { borderRadius: radius.lg, padding: spacing.s5 },
  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14, marginBottom: spacing.s2 },
  srow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.s3 },

  foot: { gap: spacing.s3, paddingTop: spacing.s4 },
});
