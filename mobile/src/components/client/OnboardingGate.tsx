import { StyleSheet, Text, View } from 'react-native';
import { PLANS } from '@haalving/shared';

import type { Onboarding, PodSeat } from '@/api/client-app';
import { Card, SecTitle } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * WHERE YOU ARE, WHILE YOU ARE NOT A CLIENT YET.
 *
 * Signing up mints a login and puts a person on the twelve-step rail; the client
 * record — and with it the plan, the pod and the cycle — is minted at the far end
 * of it. These cards stand in the meantime, and they are shown INSTEAD of a tab's
 * contents rather than instead of the tab: every page is reachable from the first
 * minute, because a person who has just signed up should be able to look around
 * the thing they joined.
 *
 * THEY SAY WHAT IS HAPPENING, NOT WHAT IS MISSING. "No plan yet" is a fault
 * report; "your team is on step 2 of 12" is a status. The difference matters
 * most here, in the days when somebody has paid and can see nothing — the honest
 * answer is that people are working on it, and the screen should say so with the
 * step they are on.
 *
 * NOTHING IS INVENTED. Every number and every word comes from `GET /client/me`
 * and `GET /client/profile`, which read the arrival's real position on the rail
 * and what the person actually typed into the sign-up deck. A field nobody has
 * filled prints a placeholder that says so — never a sample value.
 */

/** A fact the person can read back: what they told us, or what was measured. */
export function Fact({
  label,
  value,
  placeholder = 'Not yet recorded',
  mono = false,
  first = false,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  mono?: boolean;
  first?: boolean;
}) {
  const c = useTheme();
  const has = !!value && value.trim().length > 0;
  return (
    <View style={[styles.fact, first ? null : { borderTopWidth: 1, borderTopColor: c.line }]}>
      <Text style={[styles.factLabel, { color: c.ink3 }]}>{label}</Text>
      <Text
        style={[
          styles.factValue,
          { color: has ? c.ink : c.ink3 },
          has ? null : styles.placeholder,
          mono && has ? { fontFamily: numFamily() } : null,
        ]}
        numberOfLines={3}
      >
        {has ? value : placeholder}
      </Text>
    </View>
  );
}

/** The rail: the step you stand on, the ones behind it, the ones ahead. */
export function OnboardingGate({ ob, what }: { ob: Onboarding; what: string }) {
  const c = useTheme();
  /* the rail's real position, as a fraction — never a guess, and never 100%
     while the record is still an arrival */
  const done = Math.max(0, Math.min(1, (ob.step - 1) / ob.total));
  return (
    <Card>
      <Text style={[styles.kicker, { color: c.brand }]}>YOUR ONBOARDING</Text>
      <Text style={[styles.title, { color: c.ink }]}>{what}</Text>
      <Text style={[styles.body, { color: c.ink2 }]}>
        Your plan is built from your normal, not a template — so your team walks a
        twelve-step start with you before anything is prescribed.
      </Text>
      <View style={[styles.track, { backgroundColor: c.surface3 }]}>
        <View style={[styles.fill, { backgroundColor: c.brand, width: `${done * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.step, { color: c.ink }]}>
          Step {ob.step} of {ob.total}
        </Text>
        <Text style={[styles.label, { color: c.ink2 }]}>{ob.label}</Text>
      </View>
      {ob.phase ? <Text style={[styles.phase, { color: c.ink3 }]}>{ob.phase}</Text> : null}

      {/* THE WHOLE RAIL, so "step 3 of 12" has the other eleven beside it — the
          stage you are in, the ones behind you, the ones still to come */}
      {ob.steps?.length ? (
        <View style={[styles.rail, { borderTopColor: c.line }]}>
          {ob.steps.map((s, i) => {
            const newPhase = i === 0 || ob.steps![i - 1]!.phase !== s.phase;
            const now = s.state === 'now';
            const past = s.state === 'done';
            return (
              <View key={s.n}>
                {newPhase ? (
                  <Text style={[styles.railPhase, { color: c.ink3 }]}>{s.phase.toUpperCase()}</Text>
                ) : null}
                <View style={styles.railRow}>
                  <View
                    style={[
                      styles.dot,
                      past ? { backgroundColor: c.brand, borderColor: c.brand } : null,
                      now ? { borderColor: c.brand, borderWidth: 2 } : null,
                      !past && !now ? { borderColor: c.line } : null,
                    ]}
                  />
                  <Text
                    style={[
                      styles.railText,
                      { color: now ? c.ink : past ? c.ink2 : c.ink3 },
                      now ? { fontWeight: '700' } : null,
                    ]}
                  >
                    {s.n}. {s.label}
                    {now ? '  · you are here' : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[styles.note, { color: c.ink3 }]}>
        Your circle is already open — that is where your assessment begins.
      </Text>
    </Card>
  );
}

const FITNESS_WORD: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};
const TRACK_WORD: Record<string, string> = { sedentary: 'Sedentary', moderate: 'Moderate', active: 'Active' };

/** What the person typed into the sign-up deck — read back, never rewritten. */
export function OnboardingTold({ ob }: { ob: Onboarding }) {
  const told = ob.told;
  return (
    <>
      <SecTitle>What you told us</SecTitle>
      <Card>
        <Fact first label="Goals" value={told?.goals?.length ? told.goals.join(' · ') : null} placeholder="Not yet shared" />
        <Fact label="Health notes" value={told?.conditions?.length ? told.conditions.join(' · ') : null} placeholder="Nothing flagged" />
        <Fact label="Fitness level" value={told?.fitness ? (FITNESS_WORD[told.fitness] ?? told.fitness) : null} placeholder="Not yet shared" />
        <Fact label="Starting category" value={told?.track ? (TRACK_WORD[told.track] ?? told.track) : null} placeholder="Set from your fitness level" />
        <Fact label="In your words" value={told?.note ?? null} placeholder="Not yet shared" />
      </Card>
    </>
  );
}

/** What has been measured — at sign-up by you, or at the InBody step by your team. */
export function OnboardingMeasured({ ob }: { ob: Onboarding }) {
  const c = useTheme();
  const m = ob.measured;
  const n = (v: number | null | undefined, unit: string) => (v == null ? null : `${v} ${unit}`);
  return (
    <>
      <SecTitle>Your measurements</SecTitle>
      <Card>
        <Fact first mono label="Height" value={n(m?.heightCm, 'cm')} />
        <Fact mono label="Weight" value={n(m?.weightKg, 'kg')} />
        <Fact mono label="Body fat" value={n(m?.fat, '%')} />
        <Fact mono label="Muscle" value={n(m?.muscle, '%')} />
        <Fact mono label="Protein" value={n(m?.protein, '%')} />
        <Text style={[styles.foot, { color: c.ink3 }]}>
          {m?.source === 'self'
            ? 'Entered by you at sign-up. Your team re-measures at the InBody step.'
            : m?.source
              ? 'Measured by your team.'
              : 'Your team measures these at the InBody step of onboarding.'}
        </Text>
      </Card>
    </>
  );
}

const SEAT_LABEL: Record<string, string> = {
  dietitian: 'Fuel: Nutrition Biohack',
  fitness: 'Power: Fitness Biohack',
  yoga: 'Flow: Yoga Biohack',
  mind: 'Peace: Mind Biohack',
  doctor: 'Doctor',
  admin: 'Haalving Coach',
  opshead: 'Operations Head',
  onboarding: 'Running your onboarding',
};

/** The people around you before the pod is seated — the desk running onboarding. */
export function OnboardingCircle({ pod }: { pod: PodSeat[] }) {
  const c = useTheme();
  return (
    <>
      <SecTitle>Your circle</SecTitle>
      <Card>
        {pod.length ? (
          pod.map((s, i) => (
            <View
              key={`${s.seat}:${s.coach?.id ?? i}`}
              style={[styles.seat, i ? { borderTopWidth: 1, borderTopColor: c.line } : null]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.seatName, { color: c.ink }]}>{s.coach?.name ?? 'Seat open'}</Text>
                <Text style={[styles.seatRole, { color: c.ink3 }]}>
                  {SEAT_LABEL[s.seat] ?? s.seat}
                  {s.covering ? ' · covering' : ''}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.foot, { color: c.ink3 }]}>
            Your circle is being formed. Your coaches appear here as they are assigned.
          </Text>
        )}
      </Card>
    </>
  );
}

/** The plan you chose, as the product describes it — and what is prepared from it. */
export function OnboardingPlan({ plan, ob }: { plan: string; ob: Onboarding }) {
  const c = useTheme();
  const def = (PLANS as Record<string, { name: string; tag: string; desc: string }>)[plan.toLowerCase()];
  return (
    <>
      <SecTitle>Your plan</SecTitle>
      <Card>
        <Text style={[styles.planName, { color: c.ink }]}>{def?.name ?? plan}</Text>
        {def?.tag ? <Text style={[styles.planTag, { color: c.ink2 }]}>{def.tag}</Text> : null}
        {def?.desc ? <Text style={[styles.body, { color: c.ink2 }]}>{def.desc}</Text> : null}
        <Fact
          label="Starting category"
          value={ob.told?.track ? (TRACK_WORD[ob.told.track] ?? ob.told.track) : null}
          placeholder="Set from your fitness level"
        />
        <Text style={[styles.foot, { color: c.ink3 }]}>
          Your fourteen-day plan is written by your team after the five observation days, from what
          they see — not from a template.
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: t.micro, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: t.h3, fontWeight: '600', marginTop: spacing.s2 },
  body: { fontSize: t.sm, lineHeight: t.sm * 1.5, marginTop: spacing.s2 },
  track: { height: 4, borderRadius: radius.full, overflow: 'hidden', marginTop: spacing.s4 },
  fill: { height: '100%' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.s2, marginTop: spacing.s3 },
  step: { fontSize: t.sm, fontWeight: '600' },
  label: { fontSize: t.sm },
  phase: { fontSize: t.micro, marginTop: 1 },
  note: { fontSize: t.micro, marginTop: spacing.s4 },
  rail: { marginTop: spacing.s4, paddingTop: spacing.s3, borderTopWidth: 1 },
  railPhase: { fontSize: t.micro, fontWeight: '700', letterSpacing: 1, marginTop: spacing.s2, marginBottom: 2 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingVertical: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  railText: { fontSize: t.sm, flex: 1 },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
  },
  factLabel: { fontSize: t.sm, flex: 0.9 },
  factValue: { fontSize: t.sm, fontWeight: '600', flex: 1.4, textAlign: 'right' },
  placeholder: { fontWeight: '400', fontStyle: 'italic' },
  foot: { fontSize: t.micro, marginTop: spacing.s3, lineHeight: t.micro * 1.5 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s2 },
  seatName: { fontSize: t.sm, fontWeight: '600' },
  seatRole: { fontSize: t.micro, marginTop: 1 },
  planName: { fontSize: t.h3, fontWeight: '600' },
  planTag: { fontSize: t.sm, marginTop: 2 },
});
