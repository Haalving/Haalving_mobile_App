import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, setAccessToken, setRefreshToken } from '@/api/client';
import { registerForPush } from '@/api/push';
import { StoryDeck, type StoryCard } from '@/components/client/onboard/StoryDeck';
import { Tape, type TapeCfg } from '@/components/client/onboard/Tape';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/primitives';
import { useSession, type SessionRole, type SessionUser } from '@/store/session.store';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * Onboarding — the standalone first-run flow (`client-onboard.js`, #/onboard).
 *
 * A chaptered deck, step for step the demo's: welcome → you (name · mobile,
 * verified in place) → the HAALVING story deck → focus (conditions · goals ·
 * fitness) → measures (height · weight on a tape, then an optional body
 * composition) → your guide → begin. Internal step state; the draft lives in
 * this screen so answers survive back-and-forward.
 *
 * WHERE THE ACCOUNT IS MADE. "Send code" on Chapter one posts the two answers
 * the server needs (`POST /client/onboard` mints the login and the arrival),
 * then asks for the code; verifying it opens the session right here, the way
 * the demo verifies in place. The later chapters are saved under that session
 * (`PATCH /client/onboard`), and the last card lands the person in My Circle,
 * where the first message is already waiting — the promise the deck makes.
 *
 * THE TITLES CARRY THEIR OWN BREAK. The demo sets `text-wrap: balance` on the
 * question, so "Let’s begin with you." splits evenly; React Native wraps
 * greedily and would break after "with". The break is written in, at the
 * split the demo makes on a phone.
 */

const CHAPTERS: number[][] = [[1], [2], [3, 4, 5], [6, 7, 8], [9]];
const KICKERS: Record<number, string> = {
  1: 'Chapter one · You',
  2: 'Chapter two · The HAALVING way',
  3: 'Chapter three · Your focus',
  4: 'Chapter three · Your focus',
  5: 'Chapter three · Your focus',
  6: 'Chapter four · Your measures',
  7: 'Chapter four · Your measures',
  8: 'Chapter four · Your measures',
  9: 'Chapter five · Your guide',
  10: 'Your beginning',
};

const GOALS = [
  { k: 'Lose weight', icon: 'scale' },
  { k: 'Build strength', icon: 'dumbbell' },
  { k: 'More energy daily', icon: 'flame' },
  { k: 'Sleep better', icon: 'moon' },
  { k: 'Reduce stress', icon: 'leaf' },
  { k: 'Eat healthier', icon: 'bowl' },
  { k: 'Improve flexibility', icon: 'meditate' },
  { k: 'Improve stamina', icon: 'walk' },
  { k: 'Practice mindfulness', icon: 'sprout' },
  { k: 'Build healthy habits', icon: 'target' },
];
const GOALS_MAX = 5;

const CONDS = [
  { k: 'Manage diabetes', icon: 'sugar' },
  { k: 'Blood pressure', icon: 'heart' },
  { k: 'Thyroid condition', icon: 'thyroid' },
  { k: 'PCOS / PCOD', icon: 'flask' },
  { k: 'Back or joint pain', icon: 'walk' },
  { k: 'High cholesterol', icon: 'lipid' },
  { k: 'Digestive issues', icon: 'microbe' },
  { k: 'Asthma / breathing', icon: 'pulse' },
];

/* the fitness self-read: four honest doors, each showing what the first cycles
   will feel like. `k` is the server's level key. */
const FITS = [
  { k: 'beginner', name: 'Beginner', tag: 'New to working out', line: 'I’m new, or under six months in.',
    structure: 'Foundation, built steadily', freq: '3–4 sessions / cycle',
    note: 'Fundamentals first — form before load, intensity raised gently across your 14-day cycles.' },
  { k: 'intermediate', name: 'Intermediate', tag: '1–3 years of training', line: 'I’ve trained consistently for 1–3 years.',
    structure: 'Build · peak · deload', freq: '4–5 sessions / cycle',
    note: 'Progressive overload with compound movement, structured cycle by cycle.' },
  { k: 'advanced', name: 'Advanced', tag: '3–5 years of training', line: 'I’ve trained consistently for 3–5 years.',
    structure: 'Build · peak · deload', freq: '5–6 sessions / cycle',
    note: 'Higher intensity with accessory work and strength benchmarks.' },
  { k: 'expert', name: 'Expert / Elite', tag: '5+ years of training', line: 'I’ve trained for 5+ years and know my body well.',
    structure: 'Specialisation · peaking', freq: '6 sessions / cycle',
    note: 'Auto-regulated programming with performance metrics your coach reads with you.' },
] as const;

/* the two doors — Poorna is the door in today; Svayam renders as the next one */
const GUIDES = [
  { k: 'svayam', name: 'Svayam', title: 'Your AI coach, end to end', live: false,
    desc: 'A personal experience guided by the HAALVING AI coach — daily plans, meal readings and check-ins. Add a human coach to any pillar whenever you want more.' },
  { k: 'poorna', name: 'Poorna', title: 'A dedicated team of experts', live: true,
    desc: 'A coach on each of the four pillars, coordinated by your HAALVING Coach — with a doctor above them all.',
    tag: 'By invitation · contact us to know the details' },
] as const;

/* the story deck — Blue Zones into HAALVING Culture, told portrait-first */
const CARDS: StoryCard[] = [
  { img: require('../assets/onboard/bz-live.webp'), k: 'The Blue Zones', h: 'Where living past 100 is ordinary',
    s: 'Okinawa · Sardinia · Nicoya · Ikaria · Loma Linda — five corners of the world where long life is simply how people live.' },
  { img: require('../assets/onboard/bz-table.webp'), k: 'What they share', h: 'No gyms. No diets. A rhythm.',
    s: 'Plant-rich plates, natural movement, a reason to wake, and people to share it all with.' },
  { img: require('../assets/onboard/culture.webp'), k: 'HAALVING Culture', h: 'That way of living, brought home',
    s: 'HAALVING Culture rebuilds the Blue Zone rhythm around your own days — four practices, one balance.' },
  { img: require('../assets/onboard/nutrition.webp'), pillar: 'culture', k: 'HAALVING Nutrition', h: 'The daily plate',
    s: 'Real food, planned to your goal — photographed, read and refined every single day.' },
  { img: require('../assets/onboard/fitness.webp'), pillar: 'fitness', k: 'HAALVING Fitness', h: 'Move without injury',
    s: 'Strength built session by session, at your level, never past it.' },
  { img: require('../assets/onboard/yoga.webp'), pillar: 'yoga', k: 'HAALVING Yoga', h: 'Strength in stillness',
    s: 'Mobility, flexibility and breath — practised live, coached like a craft.' },
  { img: require('../assets/onboard/mindspace.webp'), pillar: 'wellness', k: 'HAALVING Mind Wellness', h: 'Mind & rest',
    s: 'Sleep, downshift and stillness — the pillar the other three stand on.' },
  { fin: true, k: 'One balance', h: 'Culture is balance.',
    s: 'Nutrition + Fitness + Yoga + Mind Wellness. Four pillars, each climbing at its own pace — balance is the shape they make together.' },
];

/* body composition — three optional readings; every value starts unset */
const COMPS = [
  { k: 'fat', label: 'Body fat', min: 5, max: 55, start: 24, hint: 'Most scales read this as fat %' },
  { k: 'muscle', label: 'Muscle', min: 20, max: 60, start: 33, hint: 'Skeletal muscle share of body weight' },
  { k: 'protein', label: 'Protein', min: 10, max: 25, start: 16, hint: 'Body protein share, from an InBody report' },
] as const;
type CompKey = (typeof COMPS)[number]['k'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const OTP_DIGITS = 6;
/* the demo's inherited `line-height: 1.55`, resolved per size */
const LH = (size: number) => Math.round(size * 1.55);

export default function OnboardScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const setSession = useSession((s) => s.setSession);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpOk, setOtpOk] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array.from({ length: OTP_DIGITS }, () => ''));
  const [carSeen, setCarSeen] = useState(0);
  const [conds, setConds] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [fitlevel, setFit] = useState<string | null>(null);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState(170);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [weightKg, setWeightKg] = useState(70);
  const [weightLb, setWeightLb] = useState<number | null>(null);
  const [comp, setComp] = useState<Record<CompKey, number | null>>({ fat: null, muscle: null, protein: null });
  const [guide, setGuide] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 3200);
  };

  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  /* ---------------- derived readings ---------------- */
  const digits = phone.replace(/\D/g, '').slice(0, 10);
  const phoneOk = digits.length === 10;
  const phoneText = () => `+91 ${digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits}`;
  const e164 = `+91${digits}`;
  const bmi = weightKg / ((heightCm / 100) * (heightCm / 100));
  const bmiBand = bmi < 18.5 ? 'light' : bmi < 25 ? 'steady' : bmi < 30 ? 'elevated' : 'high';
  const bmiTone: 'ok' | 'warn' | 'bad' = bmi < 18.5 ? 'warn' : bmi < 25 ? 'ok' : bmi < 30 ? 'warn' : 'bad';
  const lbShown = weightLb != null ? weightLb : Math.round(weightKg * 2.20462);
  const totalIn = Math.round(heightCm / 2.54);
  const heightText = heightUnit === 'cm' ? `${heightCm} cm` : `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
  const weightText = weightUnit === 'kg' ? `${weightKg.toFixed(1)} kg` : `${lbShown} lb`;
  const compAny = COMPS.some((r) => comp[r.k] != null);
  const fit = FITS.find((f) => f.k === fitlevel) ?? null;
  const guideDef = GUIDES.find((g) => g.k === guide) ?? null;
  const canSend = phoneOk && name.trim().length >= 2;

  /* ---------------- the account, made on Chapter one ---------------- */
  const sendCode = useMutation({
    mutationFn: async () => {
      try {
        /* the two answers the server needs; a number that already has a door is
           not an error — it is somebody signing back in */
        await api.post('/client/onboard', { name: name.trim(), phone: e164, plan: 'poorna' });
      } catch (e) {
        if (!(e instanceof ApiError && (e.status === 409 || e.code === 'already_registered'))) throw e;
      }
      await api.post('/auth/client/otp/request', { phone: e164 });
    },
    onSuccess: () => {
      setOtpSent(true);
      setOtp(Array.from({ length: OTP_DIGITS }, () => ''));
      say(`Code sent to ${phoneText()}`);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    },
    onError: (e: Error) => say(e.message),
  });

  const verify = useMutation({
    mutationFn: async (code: string) => {
      const data = await api.post<{ accessToken: string; refreshToken: string }>('/auth/client/otp/verify', {
        phone: e164,
        code,
      });
      setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);
      const me = await api.get<{ user: SessionUser; role: SessionRole }>('/me');
      setSession(me.user, me.role);
      void registerForPush();
    },
    onSuccess: () => {
      setOtpOk(true);
      say('Number verified');
    },
    onError: (e: Error) => {
      setOtp(Array.from({ length: OTP_DIGITS }, () => ''));
      say(e.message);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    },
  });

  const otpRefs = useRef<Array<TextInput | null>>([]);
  const onOtpDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    if (d && i < OTP_DIGITS - 1) otpRefs.current[i + 1]?.focus();
    const code = next.join('');
    if (code.length === OTP_DIGITS && !verify.isPending) verify.mutate(code);
  };

  /* ---------------- the rest of the deck, under the session ---------------- */
  const finish = useMutation({
    mutationFn: async () => {
      if (!otpOk) throw new ApiError(400, 'not_verified', 'Verify your mobile number to begin.');
      try {
        await api.patch('/client/onboard', {
          ...(goals.length ? { goals } : {}),
          ...(conds.length ? { conditions: conds } : {}),
          ...(fitlevel ? { fitness: fitlevel } : {}),
          heightCm,
          weightKg,
          ...(compAny
            ? {
                body: {
                  ...(comp.fat != null ? { fat: comp.fat } : {}),
                  ...(comp.muscle != null ? { muscle: comp.muscle } : {}),
                  ...(comp.protein != null ? { protein: comp.protein } : {}),
                },
              }
            : {}),
        });
      } catch (e) {
        /* somebody already past the rail has nothing to fill in — the door still opens */
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    },
    onSuccess: () => router.replace('/(tabs)/coach'),
    onError: (e: Error) => {
      say(e.message);
      if (!otpOk) setStep(1);
    },
  });

  /* ---------------- navigation ---------------- */
  const next = () => {
    if (step === 10) {
      finish.mutate();
      return;
    }
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const skip = () => setStep(10);

  const segFill = (chapter: number[]) => {
    const first = chapter[0]!;
    const last = chapter[chapter.length - 1]!;
    if (step > last) return 1;
    if (step < first) return 0;
    if (chapter.length === 1) return 0.5;
    return (chapter.indexOf(step) + 1) / (chapter.length + 1);
  };

  const toggleIn = (list: string[], set: (v: string[]) => void, key: string, max?: number, maxMsg?: string) => {
    if (list.includes(key)) {
      set(list.filter((x) => x !== key));
      return;
    }
    if (max && list.length >= max) {
      say(maxMsg ?? '');
      return;
    }
    set([...list, key]);
  };

  const commitGoal = () => {
    if (!addingGoal) return;
    const v = newGoal.trim();
    setAddingGoal(false);
    setNewGoal('');
    if (v && !goals.includes(v)) {
      if (goals.length >= GOALS_MAX) say('Five goals lead a beginning. Remove one first.');
      else setGoals([...goals, v]);
    }
  };

  /* ---------------- the tapes ---------------- */
  const heightCfg: TapeCfg =
    heightUnit === 'cm'
      ? { min: 120, max: 210, step: 1, pxStep: 7, vertical: true, maj: (v) => v % 10 === 0, mid: (v) => v % 5 === 0, label: (v) => String(v) }
      : { min: 48, max: 82, step: 1, pxStep: 16, vertical: true, maj: (v) => v % 12 === 0, mid: (v) => v % 6 === 0, label: (v) => `${v / 12}′` };
  const heightVal = heightUnit === 'cm' ? heightCm : clamp(Math.round(heightCm / 2.54), 48, 82);
  const onHeight = (v: number) => setHeightCm(heightUnit === 'cm' ? v : clamp(Math.round(v * 2.54), 120, 210));
  const setHeightUnitSynced = (u: 'cm' | 'ft') => {
    if (u === heightUnit) return;
    if (u === 'ft') {
      const inches = clamp(Math.round(heightCm / 2.54), 48, 82);
      setHeightCm(clamp(Math.round(inches * 2.54), 120, 210));
    }
    setHeightUnit(u);
  };

  const weightCfg: TapeCfg =
    weightUnit === 'kg'
      ? { min: 35, max: 180, step: 0.5, pxStep: 9, vertical: false, maj: (v) => v % 5 === 0, mid: (v) => v % 1 === 0, label: (v) => String(v) }
      : { min: 77, max: 397, step: 1, pxStep: 9, vertical: false, maj: (v) => v % 10 === 0, mid: (v) => v % 5 === 0, label: (v) => String(v) };
  const weightVal = weightUnit === 'kg' ? weightKg : clamp(lbShown, 77, 397);
  const onWeight = (v: number) => {
    if (weightUnit === 'kg') {
      setWeightKg(v);
      setWeightLb(null);
    } else {
      setWeightLb(v);
      setWeightKg(clamp(Math.round((v / 2.20462) * 2) / 2, 35, 180));
    }
  };
  const setWeightUnitSynced = (u: 'kg' | 'lb') => {
    if (u === weightUnit) return;
    if (u === 'lb') {
      const lb = clamp(Math.round(weightKg * 2.20462), 77, 397);
      setWeightLb(lb);
      setWeightKg(clamp(Math.round((lb / 2.20462) * 2) / 2, 35, 180));
    } else setWeightLb(null);
    setWeightUnit(u);
  };

  const bump = (k: CompKey, dir: 1 | -1) => {
    const def = COMPS.find((r) => r.k === k)!;
    const v = comp[k];
    setComp({ ...comp, [k]: v == null ? def.start : clamp(Math.round((v + dir * 0.5) * 2) / 2, def.min, def.max) });
  };

  /* ---------------- the footer ---------------- */
  const cta = (): { label: string; disabled?: boolean } => {
    if (step === 0) return { label: 'Begin' };
    if (step === 1) return { label: otpSent && !otpOk ? 'Verify to continue' : 'Continue', disabled: !name.trim() || !otpOk };
    if (step === 2) return carSeen >= CARDS.length - 1 ? { label: 'Continue' } : { label: `See all ${CARDS.length} cards to continue`, disabled: true };
    if (step === 3) return { label: conds.length ? 'Continue' : 'Nothing to flag — continue' };
    if (step === 4) return { label: goals.length ? 'Continue' : 'Choose at least one goal', disabled: !goals.length };
    if (step === 5) return { label: fit ? `Continue as ${fit.name}` : 'Select your level', disabled: !fit };
    if (step === 8) return { label: compAny ? 'Continue' : 'Skip for now' };
    if (step === 9) return { label: guideDef ? `Continue with ${guideDef.name}` : 'Choose how you begin', disabled: !guideDef };
    if (step === 10) return { label: 'Enter your observation window' };
    return { label: 'Continue' };
  };
  const foot = cta();

  const deckH = clamp(Math.round(winH * 0.62), 380, 640);
  const kicker = KICKERS[step];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ObGround />
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* ------------------------------------------------ head */}
        {step > 0 ? (
          <View style={[styles.head, { paddingTop: spacing.s4 + insets.top }]}>
            <Pressable onPress={back} style={[styles.back, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel="Back">
              <Icon name="chevL" size={17} color={c.ink2} strokeWidth={1.8} />
            </Pressable>
            <View style={styles.seg} accessibilityElementsHidden>
              {CHAPTERS.map((ch, i) => (
                <View key={i} style={[styles.segTrack, { backgroundColor: c.surface3 }]}>
                  <View style={{ height: '100%', width: `${segFill(ch) * 100}%`, backgroundColor: c.brand }} />
                </View>
              ))}
            </View>
            {step < 10 ? (
              <Pressable onPress={skip} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.skip, { color: c.ink3 }]}>Skip</Text>
              </Pressable>
            ) : (
              <View style={{ width: 28 }} />
            )}
          </View>
        ) : null}

        {/* ------------------------------------------------ body */}
        <View style={[styles.body, step === 2 ? styles.bodyMedia : null]}>
          {step === 0 ? (
            <>
              <Text style={[styles.wm, { paddingTop: spacing.s6 + insets.top }]}>HAALVING</Text>
              <View style={{ flex: 1 }} />
              <Kicker>Welcome</Kicker>
              <Q>{'A way of living,\nmeasured beautifully.'}</Q>
              <Qs>HAALVING studies how you already live, then builds your practice around it — four pillars, one calendar, a circle of care.</Qs>
            </>
          ) : null}

          {kicker ? <Kicker>{kicker}</Kicker> : null}

          {step === 1 ? (
            <>
              <Q>{'Let’s begin\nwith you.'}</Q>
              <Qs>Only your care team ever sees what you share here.</Qs>
              <FieldLabel>Name</FieldLabel>
              <Input value={name} onChangeText={setName} placeholder="Your first name" autoComplete="given-name" autoFocus={!name} />
              <FieldLabel>Mobile number</FieldLabel>
              <View style={styles.phoneRow}>
                <View style={[styles.ccode, { backgroundColor: c.surface, borderColor: c.line }]}>
                  <Text style={{ fontFamily: numFamily(500), fontSize: t.body, color: c.ink2 }}>+91</Text>
                </View>
                <Input
                  style={{ flex: 1, minWidth: 0 }}
                  value={digits}
                  onChangeText={(v) => {
                    setPhone(v.replace(/\D/g, '').slice(0, 10));
                    if (otpSent) {
                      setOtpSent(false);
                      setOtpOk(false);
                    }
                  }}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  autoComplete="tel-national"
                  editable={!otpOk}
                  num
                />
                {!otpOk ? (
                  <Pressable
                    onPress={() => sendCode.mutate()}
                    disabled={!canSend || sendCode.isPending}
                    style={[styles.sendcode, { backgroundColor: canSend ? c.brandWash : c.surface3 }]}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: t.xs, fontWeight: '600', color: canSend ? c.brand : c.ink3 }}>
                      {sendCode.isPending ? 'Sending…' : otpSent ? 'Sent' : 'Send code'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {otpSent && !otpOk ? (
                <>
                  <FieldLabel>Enter the {OTP_DIGITS}-digit code</FieldLabel>
                  <View style={styles.otpRow}>
                    {otp.map((d, i) => (
                      <TextInput
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        value={d}
                        onChangeText={(v) => onOtpDigit(i, v)}
                        onKeyPress={(e) => {
                          if (e.nativeEvent.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        autoComplete="sms-otp"
                        textContentType="oneTimeCode"
                        accessibilityLabel={`OTP digit ${i + 1}`}
                        style={[styles.otp, { backgroundColor: c.surface, borderColor: c.line, color: c.ink, fontFamily: numFamily(500) }]}
                      />
                    ))}
                  </View>
                  <View style={styles.otpMeta}>
                    <Text style={{ fontSize: t.micro, color: c.ink3 }}>{verify.isPending ? 'Checking…' : 'Sent by SMS — it stays valid for a few minutes.'}</Text>
                    <Pressable onPress={() => sendCode.mutate()} disabled={sendCode.isPending} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Text style={{ fontSize: t.xs, fontWeight: '600', color: c.brand }}>Resend code</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
              {otpOk ? (
                <View style={styles.otpDone}>
                  <Icon name="check" size={16} color={c.ok} strokeWidth={1.8} />
                  <Text style={{ fontSize: t.sm, fontWeight: '600', color: c.ok }}>
                    Verified · <Text style={{ fontFamily: numFamily(600) }}>{phoneText()}</Text>
                  </Text>
                </View>
              ) : null}

              <View style={{ flex: 1 }} />
              <Audit center>Two answers are enough to begin — everything else is asked in your assessment, as a conversation.</Audit>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={[styles.qMedia, { color: c.ink }]}>One way of living.</Text>
              {/* the deck bleeds to the screen edges — `.obdeck{margin:0 -s5}` */}
              <View style={{ marginHorizontal: -spacing.s5 }}>
                <StoryDeck cards={CARDS} width={winW} height={deckH} initial={carSeen} onReach={(i) => setCarSeen((s) => Math.max(s, i))} />
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Q>{'Anything your\ncircle should hold?'}</Q>
              <Qs>Conditions shape the plan — they never exclude you from it.</Qs>
              <View style={styles.grid}>
                {CONDS.map((x) => (
                  <GChip key={x.k} icon={x.icon} label={x.k} on={conds.includes(x.k)} onPress={() => toggleIn(conds, setConds, x.k)} />
                ))}
              </View>
              <Audit>Your doctor reads these before your first calendar is built.</Audit>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Q>{'What changes\ndo you want?'}</Q>
              <Qs>Choose up to five. Your circle builds the first cycle around them.</Qs>
              <Text style={[styles.gcount, { color: c.ink3, fontFamily: numFamily(600) }]}>{goals.length} of {GOALS_MAX}</Text>
              <View style={styles.grid}>
                {GOALS.map((g) => (
                  <GChip
                    key={g.k}
                    icon={g.icon}
                    label={g.k}
                    on={goals.includes(g.k)}
                    onPress={() => toggleIn(goals, setGoals, g.k, GOALS_MAX, 'Five goals lead a beginning. Remove one first.')}
                  />
                ))}
                {goals
                  .filter((k) => !GOALS.some((g) => g.k === k))
                  .map((k) => (
                    <GChip key={k} icon="target" label={k} on onPress={() => toggleIn(goals, setGoals, k)} />
                  ))}
                {addingGoal ? (
                  <View style={[styles.gchip, { backgroundColor: c.surface, borderColor: c.brand }]}>
                    <TextInput
                      value={newGoal}
                      onChangeText={setNewGoal}
                      autoFocus
                      maxLength={40}
                      placeholder="Your own goal"
                      placeholderTextColor={c.ink3}
                      accessibilityLabel="Add your own goal"
                      onSubmitEditing={commitGoal}
                      onBlur={commitGoal}
                      style={{ flex: 1, color: c.ink, fontSize: t.xs, fontWeight: '600', padding: 0 }}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => setAddingGoal(true)} style={[styles.gchip, styles.gchipAdd, { borderColor: c.lineStrong }]} accessibilityRole="button">
                    <Icon name="plus" size={17} color={c.ink3} strokeWidth={1.6} />
                    <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), fontWeight: '600', color: c.ink3 }}>Add your own</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Q>{'How fit are\nyou right now?'}</Q>
              <Qs>Be honest — this sets your starting intensity, never your worth.</Qs>
              <View style={{ gap: spacing.s2 }}>
                {FITS.map((f) => {
                  const on = fitlevel === f.k;
                  return (
                    <Pressable
                      key={f.k}
                      onPress={() => setFit(f.k)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.choice, { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : 'transparent' }]}
                    >
                      <View style={styles.fitxTop}>
                        <Text style={{ fontSize: t.body, lineHeight: LH(t.body), fontWeight: '600', color: c.ink }}>{f.name}</Text>
                        <Pill tone="neutral">{f.tag}</Pill>
                      </View>
                      <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), color: c.ink2 }}>{f.line}</Text>
                      {on ? (
                        <View style={[styles.fitxDetail, { borderTopColor: c.lineSoft }]}>
                          <Text style={[styles.fitxK, { color: c.ink3 }]}>YOUR FIRST CYCLES</Text>
                          <View style={styles.grid2}>
                            <View style={[styles.fitxCell, { backgroundColor: c.surface2 }]}>
                              <Text style={[styles.fitxCellK, { color: c.ink3 }]}>STRUCTURE</Text>
                              <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), fontWeight: '600', color: c.ink }}>{f.structure}</Text>
                            </View>
                            <View style={[styles.fitxCell, { backgroundColor: c.surface2 }]}>
                              <Text style={[styles.fitxCellK, { color: c.ink3 }]}>RHYTHM</Text>
                              <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), fontWeight: '600', color: c.ink, fontFamily: numFamily(600) }}>{f.freq}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), color: c.ink2 }}>{f.note}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <Q>How tall are you?</Q>
              <Qs>Slide the tape — the needle reads it for you.</Qs>
              <UnitToggle units={['cm', 'ft']} cur={heightUnit} onPick={(u) => setHeightUnitSynced(u as 'cm' | 'ft')} />
              <View style={styles.tapeWrap}>
                <View style={styles.tapeRead}>
                  {heightUnit === 'cm' ? (
                    <>
                      <Text style={[styles.val, { color: c.ink, fontFamily: numFamily(500) }]}>{heightCm}</Text>
                      <Text style={[styles.valUnit, { color: c.ink3 }]}>cm</Text>
                    </>
                  ) : (
                    <Text style={[styles.val, { color: c.ink, fontFamily: numFamily(500) }]}>
                      {Math.floor(totalIn / 12)}′{totalIn % 12}″
                    </Text>
                  )}
                </View>
                <Tape cfg={heightCfg} value={heightVal} onChange={onHeight} />
              </View>
            </>
          ) : null}

          {step === 7 ? (
            <>
              <Q>{'And your weight\nthis morning?'}</Q>
              <Qs>A starting point, not a verdict — we watch the trend, never one day.</Qs>
              <UnitToggle units={['kg', 'lb']} cur={weightUnit} onPick={(u) => setWeightUnitSynced(u as 'kg' | 'lb')} />
              <View style={styles.tapeWrap}>
                <View style={styles.tapeRead}>
                  <Text style={[styles.val, { color: c.ink, fontFamily: numFamily(500) }]}>{weightUnit === 'kg' ? weightKg.toFixed(1) : lbShown}</Text>
                  <Text style={[styles.valUnit, { color: c.ink3 }]}>{weightUnit}</Text>
                </View>
                <Tape cfg={weightCfg} value={weightVal} onChange={onWeight} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <BmiPill tone={bmiTone} value={bmi} band={bmiBand} />
              </View>
            </>
          ) : null}

          {step === 8 ? (
            <>
              <Q>{'A closer reading,\nif you have one.'}</Q>
              <Qs>From any smart scale or a recent InBody report. No reading at hand? Skip — your coach adds these later.</Qs>
              <View style={{ gap: spacing.s2 }}>
                {COMPS.map((r) => {
                  const v = comp[r.k];
                  return (
                    <View key={r.k} style={[styles.bcrow, { backgroundColor: c.surface }]}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={{ fontSize: t.sm, lineHeight: LH(t.sm), fontWeight: '600', color: c.ink }}>{r.label}</Text>
                        <Text style={{ fontSize: t.micro, lineHeight: LH(t.micro), color: c.ink3 }}>{r.hint}</Text>
                      </View>
                      <Pressable onPress={() => bump(r.k, -1)} style={[styles.bcbtn, { backgroundColor: c.surface2 }]} accessibilityRole="button" accessibilityLabel={`Decrease ${r.label}`}>
                        <Text style={{ fontSize: t.h3, color: c.ink, lineHeight: t.h3 + 2 }}>−</Text>
                      </Pressable>
                      <Text style={[styles.bcval, { color: v == null ? c.ink3 : c.ink, fontFamily: numFamily(500) }]}>
                        {v == null ? (
                          '—'
                        ) : (
                          <>
                            {v % 1 ? v.toFixed(1) : v}
                            <Text style={{ fontSize: t.xs, color: c.ink2 }}>%</Text>
                          </>
                        )}
                      </Text>
                      <Pressable onPress={() => bump(r.k, 1)} style={[styles.bcbtn, { backgroundColor: c.surface2 }]} accessibilityRole="button" accessibilityLabel={`Increase ${r.label}`}>
                        <Text style={{ fontSize: t.h3, color: c.ink, lineHeight: t.h3 + 2 }}>+</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setComp({ ...comp, [r.k]: null })}
                        style={[styles.bcx, { opacity: v == null ? 0 : 1 }]}
                        disabled={v == null}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${r.label} — back to not given`}
                      >
                        <Icon name="x" size={13} color={c.ink3} strokeWidth={2} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <Audit>These sharpen your starting plan — they never gate it.</Audit>
            </>
          ) : null}

          {step === 9 ? (
            <>
              <Q>{'How would you\nlike to be guided?'}</Q>
              <Qs>We are opening with Poorna — a coach on every pillar. Svayam, the AI-guided door, follows.</Qs>
              <View style={{ gap: spacing.s3 }}>
                {GUIDES.map((g) => {
                  const on = g.live && guide === g.k;
                  const poorna = g.k === 'poorna';
                  return (
                    <Pressable
                      key={g.k}
                      onPress={() => {
                        if (!g.live) {
                          say(`${g.name} opens after our first launch — Poorna is the door in today.`);
                          return;
                        }
                        setGuide(g.k);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: !g.live }}
                      style={[
                        styles.plan,
                        poorna
                          ? { borderColor: on ? '#C9A86A' : 'rgba(201,168,106,0.38)', backgroundColor: '#0E100E' }
                          : { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : 'transparent', opacity: g.live ? 1 : 0.55 },
                      ]}
                    >
                      {poorna ? (
                        <>
                          <LinearGradient
                            pointerEvents="none"
                            colors={['#15110A', '#0A0D0C', '#0B1A19']}
                            locations={[0, 0.55, 1]}
                            start={{ x: 0.2, y: 0 }}
                            end={{ x: 0.8, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(201,168,106,0.16)', 'rgba(201,168,106,0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.7, y: 0.7 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={styles.pmark}>
                            <Icon name="sparkle" size={18} color="#C9A86A" strokeWidth={1.6} />
                          </View>
                        </>
                      ) : null}
                      <Text style={[styles.pname, { color: poorna ? '#D9BE83' : c.brand2 }]}>{g.name.toUpperCase()}</Text>
                      {poorna ? (
                        <LinearGradient colors={['#C9A86A', 'rgba(201,168,106,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.prule} />
                      ) : null}
                      <Text style={{ fontSize: t.h3, lineHeight: LH(t.h3), fontWeight: '600', letterSpacing: -0.16, marginTop: spacing.s1, color: poorna ? '#EFE9DA' : c.ink }}>
                        {g.title}
                      </Text>
                      <Text style={{ fontSize: t.xs, lineHeight: Math.round(t.xs * 1.5), color: poorna ? '#B8B2A2' : c.ink2 }}>
                        {poorna ? (
                          <>
                            A coach on each of the four pillars, coordinated by your{' '}
                            <Text style={{ color: c.brand2, fontWeight: '600' }}>HAALVING Coach</Text> — with a doctor above them all.
                          </>
                        ) : (
                          g.desc
                        )}
                      </Text>
                      <View style={styles.planFoot}>
                        <Text style={{ fontSize: t.micro, lineHeight: LH(t.micro), fontWeight: '600', color: poorna ? '#C9A86A' : c.ink3 }}>
                          {g.live ? ('tag' in g ? g.tag : '') : 'Opening soon'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => say('Our team will call you within a day — no form, just a conversation.')} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
                <Text style={[styles.alt, { color: c.ink2 }]}>Poorna begins with a conversation — request a call</Text>
              </Pressable>
            </>
          ) : null}

          {step === 10 ? (
            <>
              <Q>{'Five quiet days\ncome first.'}</Q>
              <Qs>We watch how you already live before we change a single thing — your plan is built from your normal, not a template.</Qs>
              <View style={[styles.card, { backgroundColor: c.surface }]}>
                <Text style={[styles.k, { color: c.ink3 }]}>WHAT YOU TOLD US</Text>
                <SRow label="Name"><B>{name.trim() || 'Guest'}</B></SRow>
                {otpOk ? <SRow label="Mobile"><NumT>{phoneText()}</NumT></SRow> : null}
                <SRow label="Goals">
                  {goals.length ? (
                    <BodyT>
                      {goals.slice(0, 2).join(' · ')}
                      {goals.length > 2 ? <Text style={{ fontFamily: numFamily(400) }}> +{goals.length - 2}</Text> : null}
                    </BodyT>
                  ) : (
                    <SubT>To be chosen with your circle</SubT>
                  )}
                </SRow>
                <SRow label="Health notes">
                  {conds.length ? (
                    <BodyT>
                      <Text style={{ fontFamily: numFamily(600) }}>{conds.length}</Text> flagged
                    </BodyT>
                  ) : (
                    <SubT>Nothing flagged</SubT>
                  )}
                </SRow>
                {fit ? <SRow label="Fitness"><B>{fit.name}</B></SRow> : null}
                <SRow label="Height"><NumT>{heightText}</NumT></SRow>
                <SRow label="Weight">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2, justifyContent: 'flex-end' }}>
                    <NumT>{weightText}</NumT>
                    <BmiPill tone={bmiTone} value={bmi} band={bmiBand} />
                  </View>
                </SRow>
                <SRow label="Body composition">
                  {compAny ? (
                    <BodyT right>
                      {COMPS.filter((r) => comp[r.k] != null).map((r, i) => (
                        <Text key={r.k}>
                          {i ? ' · ' : ''}
                          {r.label} <Text style={{ fontFamily: numFamily(400) }}>{comp[r.k]! % 1 ? comp[r.k]!.toFixed(1) : comp[r.k]}%</Text>
                        </Text>
                      ))}
                    </BodyT>
                  ) : (
                    <SubT>Skipped — add any time</SubT>
                  )}
                </SRow>
                <SRow label="Your guide">{guideDef ? <B>{guideDef.name}</B> : <SubT>Svayam to start</SubT>}</SRow>
              </View>
              <Audit>Your first message is waiting in My Circle — your assessment begins there.</Audit>
            </>
          ) : null}

          {toast ? <Text style={[styles.toast, { color: c.amber }]}>{toast}</Text> : null}
        </View>

        {/* ------------------------------------------------ foot */}
        <View style={[styles.foot, { paddingBottom: spacing.s6 + insets.bottom }]}>
          <Cta label={foot.label} disabled={!!foot.disabled} loading={finish.isPending} onPress={next} />
          {step === 0 ? (
            <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.alt, { color: c.ink2 }]}>I already have an account</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------------------------------------------------------------- parts */

/** The morning stays behind every step — `.ob::before/::after`. */
function ObGround() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../assets/welcome.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ left: '50%', top: '25%' }}
        transition={0}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(13,18,17,0.66)', 'rgba(13,18,17,0.88)', 'rgba(13,18,17,0.985)']}
        locations={[0, 0.42, 0.72]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.kicker, { color: c.brand }]}>{String(children).toUpperCase()}</Text>;
}
function Q({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.q, { color: c.ink }]}>{children}</Text>;
}
function Qs({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.qs, { color: c.ink2 }]}>{children}</Text>;
}
function FieldLabel({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.fieldLabel, { color: c.ink2 }]}>{children}</Text>;
}
function Audit({ children, center }: { children: ReactNode; center?: boolean }) {
  const c = useTheme();
  return <Text style={[styles.audit, { color: c.ink3 }, center ? { textAlign: 'center' } : null]}>{children}</Text>;
}
/** `<b>` inside the summary card — body size, inherited 1.55 leading */
function B({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontSize: t.body, lineHeight: LH(t.body), fontWeight: '600', color: c.ink }}>{children}</Text>;
}
function BodyT({ children, right }: { children: ReactNode; right?: boolean }) {
  const c = useTheme();
  return <Text style={{ fontSize: t.body, lineHeight: LH(t.body), color: c.ink, textAlign: right ? 'right' : undefined }}>{children}</Text>;
}
function NumT({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontFamily: numFamily(400), fontSize: t.body, lineHeight: LH(t.body), color: c.ink }}>{children}</Text>;
}
function SubT({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontSize: t.sm, lineHeight: LH(t.body), color: c.ink2, textAlign: 'right' }}>{children}</Text>;
}
function SRow({ label, children }: { label: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.srow}>
      <Text style={{ fontSize: t.sm, lineHeight: LH(t.body), color: c.ink2 }}>{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

function Input({ num, style, ...props }: React.ComponentProps<typeof TextInput> & { num?: boolean }) {
  const c = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={c.ink3}
      onFocus={(e) => {
        setFocus(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        { backgroundColor: c.surface, borderColor: focus ? c.brand : c.line, color: c.ink },
        num ? { fontFamily: numFamily(400) } : null,
        style,
      ]}
    />
  );
}

function GChip({ icon, label, on, onPress }: { icon: string; label: string; on: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.gchip, { backgroundColor: on ? c.brandWash : c.surface, borderColor: on ? c.brand : 'transparent' }]}
    >
      <Icon name={icon} size={17} color={on ? c.ink : c.ink2} strokeWidth={1.6} />
      <Text style={{ fontSize: t.xs, lineHeight: LH(t.xs), fontWeight: '600', color: on ? c.ink : c.ink2, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

function UnitToggle({ units, cur, onPick }: { units: string[]; cur: string; onPick: (u: string) => void }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.unitToggle, { backgroundColor: c.surface3 }]}>
        {units.map((u) => {
          const on = u === cur;
          return (
            <Pressable key={u} onPress={() => onPick(u)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.unitBtn, on ? { backgroundColor: c.surface } : null]}>
              <Text style={{ fontSize: t.micro, fontWeight: '600', color: on ? c.ink : c.ink2 }}>{u}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BmiPill({ tone, value, band }: { tone: 'ok' | 'warn' | 'bad'; value: number; band: string }) {
  const c = useTheme();
  const T = { ok: { bg: c.okWash, fg: c.ok }, warn: { bg: c.amberWash, fg: c.amber }, bad: { bg: c.dangerWash, fg: c.danger } }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: T.bg }]}>
      <Text style={{ fontSize: t.micro, fontWeight: '600', color: T.fg }}>
        BMI <Text style={{ fontFamily: numFamily(600) }}>{value.toFixed(1)}</Text> · {band}
      </Text>
    </View>
  );
}

/** `.btn.block` — the deck's own footer button, sized as the demo's. */
function Cta({ label, disabled, loading, onPress }: { label: string; disabled: boolean; loading?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [styles.cta, { backgroundColor: disabled ? c.surface3 : c.brandFill, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Text style={{ fontSize: t.sm, fontWeight: '600', letterSpacing: -0.07, color: disabled ? c.ink2 : '#fff' }}>{loading ? 'One moment…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingHorizontal: spacing.s5, paddingBottom: spacing.s3 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  seg: { flex: 1, flexDirection: 'row', gap: spacing.s1, maxWidth: 180, alignSelf: 'center', marginHorizontal: 'auto' },
  segTrack: { flex: 1, height: 3, borderRadius: radius.full, overflow: 'hidden' },
  skip: { fontSize: t.xs, fontWeight: '600', marginLeft: 'auto' },

  body: { flex: 1, gap: spacing.s4, paddingHorizontal: spacing.s5, paddingTop: spacing.s5, paddingBottom: spacing.s4 },
  bodyMedia: { gap: spacing.s2, paddingTop: spacing.s2 },
  wm: { textAlign: 'center', color: '#fff', fontSize: t.h3, fontWeight: '600', letterSpacing: t.h3 * 0.3, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 1 } },
  kicker: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.16, textAlign: 'center', marginBottom: -spacing.s2 },
  q: { fontSize: t.display, fontWeight: '600', letterSpacing: -1, lineHeight: Math.round(t.display * 1.12), textAlign: 'center' },
  qMedia: { fontSize: t.h3, fontWeight: '600', letterSpacing: -0.4, lineHeight: Math.round(t.h3 * 1.12), textAlign: 'center' },
  /* `max-width:36ch` at 14px — the demo's sub wraps at about 254px */
  qs: { fontSize: t.sm, lineHeight: LH(t.sm), textAlign: 'center', alignSelf: 'center', maxWidth: 254, marginTop: -spacing.s2 },
  fieldLabel: { fontSize: t.sm, fontWeight: '600', marginBottom: -spacing.s2 },
  /* `.input` inherits body/1.55 — 50px tall with its 1.5px border */
  input: { borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.s3, paddingHorizontal: spacing.s4, fontSize: t.body, lineHeight: LH(t.body), minHeight: 50 },
  audit: { fontSize: t.micro, fontStyle: 'italic', lineHeight: LH(t.micro) },
  toast: { fontSize: t.xs, textAlign: 'center' },

  phoneRow: { flexDirection: 'row', gap: spacing.s2, alignItems: 'stretch' },
  ccode: { minWidth: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: radius.md },
  sendcode: { paddingHorizontal: spacing.s4, alignSelf: 'stretch', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  otpRow: { flexDirection: 'row', gap: spacing.s2 },
  otp: { flex: 1, height: 60, textAlign: 'center', fontSize: 24, borderWidth: 1.5, borderRadius: radius.md, padding: 0 },
  otpMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s3 },
  otpDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  gchip: { width: '48.6%', flexDirection: 'row', alignItems: 'center', gap: spacing.s2, minHeight: 52, borderWidth: 2, borderRadius: radius.md, paddingVertical: spacing.s2, paddingHorizontal: spacing.s3, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  gchipAdd: { borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  gcount: { alignSelf: 'center', fontSize: t.micro, letterSpacing: t.micro * 0.1 },

  choice: { borderWidth: 2, borderRadius: radius.md, padding: spacing.s4, gap: spacing.s1, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  fitxTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, flexWrap: 'wrap' },
  fitxDetail: { gap: spacing.s2, marginTop: spacing.s2, borderTopWidth: 1, paddingTop: spacing.s3 },
  fitxK: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  grid2: { flexDirection: 'row', gap: spacing.s3 },
  fitxCell: { flex: 1, gap: 2, borderRadius: radius.md, paddingVertical: spacing.s2, paddingHorizontal: spacing.s3 },
  fitxCellK: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.1 },

  unitToggle: { flexDirection: 'row', borderRadius: radius.full, padding: 3, gap: 2 },
  unitBtn: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.full },
  tapeWrap: { alignItems: 'center', gap: spacing.s5, paddingVertical: spacing.s2 },
  tapeRead: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  val: { fontSize: 56, lineHeight: 56, letterSpacing: -1.1 },
  valUnit: { fontSize: t.h3 },
  pill: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'center' },

  bcrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, borderRadius: radius.md, paddingVertical: spacing.s3, paddingHorizontal: spacing.s4, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bcbtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bcval: { minWidth: 60, textAlign: 'center', fontSize: t.h3 },
  bcx: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  plan: { position: 'relative', overflow: 'hidden', gap: spacing.s2, borderWidth: 2, borderRadius: radius.lg, paddingVertical: spacing.s5, paddingHorizontal: spacing.s4 },
  pname: { fontSize: 22, fontWeight: '600', letterSpacing: 22 * 0.18, lineHeight: 22 },
  prule: { width: 48, height: 1, marginTop: spacing.s1 },
  pmark: { position: 'absolute', top: spacing.s4, right: spacing.s4 },
  planFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, flexWrap: 'wrap', marginTop: spacing.s1 },
  alt: { fontSize: t.xs, fontWeight: '600', textDecorationLine: 'underline' },

  card: { borderRadius: radius.lg, padding: spacing.s5, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  srow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s3, marginTop: spacing.s3 },

  foot: { paddingTop: spacing.s4, paddingHorizontal: spacing.s5, gap: spacing.s3, alignItems: 'center' },
  cta: { width: '100%', borderRadius: radius.full, paddingVertical: spacing.s3, paddingHorizontal: spacing.s5, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
});
