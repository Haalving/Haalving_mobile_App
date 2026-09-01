import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile, type PodSeat } from '@/api/client-app';
import { Avatar, ClientHeader } from '@/components/client/ClientHeader';
import { PILLARS, PillarPlate, type PillarKey } from '@/components/client/PillarGroup';
import { Card, Notice, Pill, SecTitle } from '@/components/ui/primitives';
import { useSession } from '@/store/session.store';
import { ClientGround } from '@/theme/ClientGround';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, TABBAR_HEIGHT, type as t, leading, useTheme } from '@/theme/tokens';

/**
 * PROFILE — your record, and the people standing behind it
 * (`views/client-profile.js`).
 *
 * Reached from the AVATAR, not the tab bar. Profile is not a daily destination,
 * and the demo gives its seat to My Circle for that reason.
 *
 * THE CIRCLE OF CARE IS THE POINT OF THIS SCREEN. The demo's own sentence under
 * it says why: these are the people at your review, and they share one Care
 * Circle, "so nothing about your plan is decided in a conversation you cannot
 * see". A cover is named as a cover — rule 4 sends the covering coach's name, and
 * hiding that would be telling a client their coach is someone who is on leave.
 *
 * THE RECORDS VAULT HOLDS SIGNED SUMMARIES ONLY — rule 5, enforced on the server.
 * A pending summary is a document nobody has stood behind yet, and a client is
 * never handed a medical reading in that state.
 *
 * NOT HERE: the settings toggles, the consent manager and the Vital Panel. Each
 * needs a write endpoint the client surface does not have, and a switch that
 * flips but saves nothing is worse than no switch. Listed in docs/pixel/TODO.md.
 */

const PILLAR_LABEL: Record<string, string> = {
  culture: 'Nutrition',
  fitness: 'Fitness',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};

export default function ProfileScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const clear = useSession((s) => s.clear);

  return (
    <ClientGround>
      {profile.data ? <ClientHeader name={profile.data.name} plan={profile.data.plan} /> : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 },
        ]}
      >
        {profile.isPending ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} />
        ) : null}

        {profile.isError ? (
          <Notice tone="bad">
            We could not load your profile. Nothing has changed — try again in a moment.
          </Notice>
        ) : null}

        {profile.data ? (
          <>
            {/* ---------- who you are ---------- */}
            <View style={styles.head}>
              <Avatar name={profile.data.name} size={56} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: c.ink }]}>{profile.data.name}</Text>
                <View style={styles.headMeta}>
                  <Pill tone="info">{profile.data.plan}</Pill>
                  <Text style={[styles.sub, { color: c.ink2 }]}>
                    Cycle <Text style={styles.num}>{profile.data.cycle}</Text> · Day{' '}
                    <Text style={styles.num}>{profile.data.day}</Text>
                  </Text>
                </View>
              </View>
            </View>

            {profile.data.code ? (
              <Text style={[styles.code, { color: c.ink3 }]}>{profile.data.code}</Text>
            ) : null}

            {/* ---------- your levels ---------- */}
            <SecTitle>Where you are</SecTitle>
            <Card>
              {profile.data.pillars.map((key, i) => (
                <View
                  key={key}
                  style={[
                    styles.levelRow,
                    i ? { borderTopWidth: 1, borderTopColor: c.line } : null,
                  ]}
                >
                  <PillarPlate pillar={key as PillarKey} size={36} />
                  <Text style={[styles.levelName, { color: c.ink }]}>
                    {PILLAR_LABEL[key] ?? PILLARS[key as PillarKey]?.name ?? key}
                  </Text>
                  <Text style={[styles.level, { color: c.ink2 }]}>
                    Level {profile.data!.levels?.[key] ?? 1}
                  </Text>
                </View>
              ))}
            </Card>

            {/* ---------- the circle of care ---------- */}
            <SecTitle>My circle of care</SecTitle>
            <Card>
              {profile.data.pod.length ? (
                profile.data.pod.map((seat, i) => <CircleRow key={seat.seat} seat={seat} first={i === 0} />)
              ) : (
                <Text style={[styles.sub, { color: c.ink3 }]}>
                  Your circle is being formed. Your coaches appear here as they are assigned.
                </Text>
              )}
            </Card>
            <Text style={[styles.note, { color: c.ink2 }]}>
              These are the people at your review. They share one Care Circle, so nothing about your
              plan is decided in a conversation you cannot see.
            </Text>

            {/* ---------- the records vault ---------- */}
            <SecTitle>Records vault</SecTitle>
            <Card>
              {profile.data.records.length ? (
                profile.data.records.map((r, i) => (
                  <View
                    key={r.id}
                    style={[styles.record, i ? { borderTopWidth: 1, borderTopColor: c.line } : null]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.recordTitle, { color: c.ink }]}>{r.title}</Text>
                      <Text style={[styles.sub, { color: c.ink3 }]}>
                        {r.kind} · {String(r.uploadedOn).slice(0, 10)}
                      </Text>
                    </View>
                    <Pill tone="ok">Signed</Pill>
                  </View>
                ))
              ) : (
                <Text style={[styles.sub, { color: c.ink3 }]}>
                  Nothing signed off yet. A summary appears here once a doctor has reviewed and
                  signed it — never before.
                </Text>
              )}
            </Card>

            {/* ---------- your call ---------- */}
            <SecTitle>Account</SecTitle>
            <Pressable
              accessibilityRole="button"
              onPress={() => void clear()}
              style={[styles.signOut, { borderColor: c.line }]}
            >
              <Text style={{ color: c.ink, fontSize: t.body, fontWeight: '600' }}>Sign out</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </ClientGround>
  );
}

/**
 * One seat in the circle.
 *
 * A COVER IS NAMED AS A COVER. `covering` means the name above belongs to
 * someone standing in today, not to the coach who owns the seat — saying only the
 * name would have a client message a person who is on leave.
 */
function CircleRow({ seat, first }: { seat: PodSeat; first: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.circleRow, first ? null : { borderTopWidth: 1, borderTopColor: c.line }]}>
      <Avatar name={seat.name} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.circleName, { color: c.ink }]}>{seat.name}</Text>
        <Text style={[styles.sub, { color: c.ink3 }]}>
          {PILLAR_LABEL[seat.seat] ?? seat.seat}
        </Text>
      </View>
      {seat.covering ? <Pill tone="warn">Covering today</Pill> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s1 },
  name: { fontSize: t.h1, fontWeight: '600', lineHeight: leading.h1 },
  headMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s2,
    marginTop: spacing.s1,
  },
  sub: { fontSize: t.sm, lineHeight: leading.sm },
  num: { fontFamily: numFamily(500) },
  code: { fontSize: t.micro, letterSpacing: t.micro * 0.08 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  levelName: { flex: 1, fontSize: t.body, fontWeight: '600' },
  level: { fontSize: t.sm },
  circleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  circleName: { fontSize: t.body, fontWeight: '600' },
  note: { fontSize: t.sm, lineHeight: leading.sm },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  recordTitle: { fontSize: t.body, fontWeight: '600' },
  signOut: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
