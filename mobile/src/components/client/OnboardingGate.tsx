import { StyleSheet, Text, View } from 'react-native';

import type { Onboarding } from '@/api/client-app';
import { Card } from '@/components/ui/primitives';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * WHERE YOU ARE, WHILE YOU ARE NOT A CLIENT YET.
 *
 * Signing up mints a login and puts a person on the twelve-step rail; the client
 * record — and with it the plan, the pod and the cycle — is minted at the far end
 * of it. This is what stands in the meantime, and it is shown INSTEAD of a tab's
 * contents rather than instead of the tab: every page is reachable from the first
 * minute, because a person who has just signed up should be able to look around
 * the thing they joined.
 *
 * IT SAYS WHAT IS HAPPENING, NOT WHAT IS MISSING. "No plan yet" is a fault
 * report; "your team is on step 2 of 12" is a status. The difference matters
 * most here, in the days when somebody has paid and can see nothing — the honest
 * answer is that people are working on it, and the screen should say so with the
 * step they are on.
 *
 * NOTHING IS INVENTED. Every number comes from `GET /client/me`, which reads the
 * arrival's real position on the rail. A progress bar with a made-up percentage
 * would be the one thing worse than saying nothing.
 */
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

      <Text style={[styles.note, { color: c.ink3 }]}>
        Your circle is already open — that is where your assessment begins.
      </Text>
    </Card>
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
});
