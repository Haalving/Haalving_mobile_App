import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Notice, Pill } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * Journey — the HAALVING Index as four brick towers (`client-journey.js`,
 * #/trackers/journey). One brick-course per level, lit to the pillar's level, the
 * "now" course ringed, the rest waiting. Review countdown and a level-up preview.
 *
 * Reads levels + day from /client/me (committed), so no fixture. Standard and the
 * observation variant (all bricks unlit) both at the demo's boxes. LEVELS = 7,
 * review day 12, cycle 14 (the program shape).
 */

const LEVELS = 7;
const REVIEW_DAY = 12;
const CYCLE_DAYS = 14;
const ORDER = ['fitness', 'culture', 'yoga', 'wellness'] as const;
const NAME: Record<string, string> = {
  fitness: 'Fitness',
  culture: 'Nutrition',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};

export default function JourneyScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const m = me.data;
  const obs = m?.observation ?? false;

  return (
    <ClientGround>
      {m ? <ClientHeader name={m.name} plan={m.plan} /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 }]}
      >
        <SceneBand
          kicker="YOUR JOURNEY"
          title="Journey"
          sub={
            obs
              ? `Observation · day ${m?.day ?? 1} of 5`
              : `Cycle ${m?.cycle ?? 1} · day ${m?.day ?? 1} of ${CYCLE_DAYS} · ${LEVELS} levels`
          }
        />

        {me.isPending ? <ActivityIndicator color={c.brand} style={{ marginTop: spacing.s8 }} /> : null}

        {m && !obs ? (
          <>
            <Card>
              <Text style={[styles.k, { color: c.ink3 }]}>HAALVING JOURNEY</Text>
              <Bricks levels={m.levels} />
            </Card>

            <Text style={[styles.secTitle, { color: c.ink3 }]}>LEVEL REVIEW</Text>
            <Card>
              <View style={styles.trow}>
                <View style={[styles.iconTile, { backgroundColor: c.surface2 }]}>
                  <Icon name="cal" size={18} color={c.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.ink, fontWeight: '600', fontSize: t.sm }}>
                    {m.day >= REVIEW_DAY
                      ? 'Review today'
                      : `Level review in ${REVIEW_DAY - m.day} ${REVIEW_DAY - m.day === 1 ? 'day' : 'days'}`}
                  </Text>
                  <Text style={{ color: c.ink2, fontSize: t.xs }}>
                    Your care team confirms every level change together — nothing moves without them.
                  </Text>
                </View>
                <Pill tone={m.day >= REVIEW_DAY ? 'warn' : 'neutral'}>
                  Day {REVIEW_DAY} of {CYCLE_DAYS}
                </Pill>
              </View>
            </Card>

            <Text style={[styles.sub, { color: c.ink2 }]}>
              Each pillar climbs on its own — a level earned in one is yours to keep, whatever the
              other three are doing.
            </Text>
            <Button label="Preview a level-up" variant="ghost" onPress={() => {}} />
          </>
        ) : null}

        {m && obs ? (
          <>
            <Notice>Five quiet days — we learn your normal before we shape it.</Notice>
            <Text style={[styles.secTitle, { color: c.ink3 }]}>YOUR HAALVING JOURNEY</Text>
            <Card>
              <Bricks levels={{ fitness: 0, culture: 0, yoga: 0, wellness: 0 }} unlit />
              <Text style={[styles.sub, { color: c.ink2, textAlign: 'center', marginTop: spacing.s3 }]}>
                The bricks wait for you. {LEVELS} courses to the top.
              </Text>
            </Card>
            <Button label="How the journey works" variant="ghost" onPress={() => {}} />
          </>
        ) : null}
      </ScrollView>
    </ClientGround>
  );
}

/** Four towers, seven courses each, lit to the pillar's level. */
function Bricks({ levels, unlit = false }: { levels: Record<string, number>; unlit?: boolean }) {
  const c = useTheme();
  const pc: Record<string, string> = { fitness: c.fitness, culture: c.culture, yoga: c.yoga, wellness: c.wellness };
  const courses = Array.from({ length: LEVELS }, (_, i) => LEVELS - i); // 7..1

  return (
    <View style={styles.bricks}>
      {ORDER.map((k) => {
        const lv = unlit ? 0 : Math.max(1, Math.min(LEVELS, levels[k] ?? 1));
        const now = unlit || lv >= LEVELS ? 0 : lv + 1;
        const color = unlit ? c.ink3 : pc[k];
        return (
          <View key={k} style={styles.col}>
            <View style={styles.stack}>
              {courses.map((i) => {
                const state = i <= lv ? 'on' : i === now ? 'now' : 'wait';
                return (
                  <View
                    key={i}
                    style={[
                      styles.brick,
                      { backgroundColor: c.surface2 },
                      state === 'on' ? { backgroundColor: pc[k] } : null,
                      state === 'now' ? { borderWidth: 1.5, borderColor: pc[k] } : null,
                    ]}
                  >
                    {state !== 'wait' ? (
                      <Text
                        style={{
                          fontFamily: numFamily(600),
                          fontSize: t.xs,
                          color: state === 'on' ? c.bg : c.ink,
                        }}
                      >
                        {i}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.jname, { color }]}>{NAME[k]}</Text>
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.jlvSmall, { color: c.ink3 }]}>LEVEL</Text>
              <Text style={{ fontFamily: numFamily(500), fontSize: t.h2, color }}>
                {unlit ? '—' : levels[k] ?? 1}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  secTitle: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.15, marginBottom: -spacing.s1 },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.55 },

  bricks: { flexDirection: 'row', gap: spacing.s3, maxWidth: 400, alignSelf: 'center', paddingTop: spacing.s4 },
  col: { flex: 1, gap: spacing.s2, alignItems: 'stretch' },
  stack: { gap: 3, borderRadius: radius.sm, overflow: 'hidden' },
  brick: { height: 26, alignItems: 'center', justifyContent: 'center' },
  jname: { fontSize: t.micro, fontWeight: '600', textAlign: 'center', lineHeight: t.micro * 1.3 },
  jlvSmall: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },

  trow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  iconTile: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
