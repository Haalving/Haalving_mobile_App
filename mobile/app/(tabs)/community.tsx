import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGatherings, useMe, type Gathering } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * THE COMMUNITY — the published gatherings, from the real community tables.
 *
 * Reads `GET /client/community/gatherings`, which returns only APPROVED gatherings
 * (a pending one is absent from the answer, not filtered here). The demo's fuller
 * hive — the honeycomb, partners and the Haalving Zone — is deferred; this is the
 * gatherings lane the tab is built around, on real data.
 */
export default function CommunityScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const gatherings = useGatherings();
  const list = gatherings.data ?? [];

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.s4,
          paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s6,
          gap: spacing.s3,
        }}
      >
        <SceneBand
          kicker="THE COMMUNITY"
          title="Community"
          sub="Gatherings and the people walking beside you."
        />

        {list.map((g) => (
          <GatheringCard key={g.id} g={g} />
        ))}

        {gatherings.isLoading ? (
          <Text style={[styles.note, { color: c.ink3 }]}>Loading gatherings…</Text>
        ) : list.length === 0 ? (
          <Text style={[styles.note, { color: c.ink3 }]}>No gatherings just yet — check back soon.</Text>
        ) : null}
      </ScrollView>
    </ClientGround>
  );
}

function GatheringCard({ g }: { g: Gathering }) {
  const c = useTheme();
  return (
    <Card>
      <Text style={[styles.title, { color: c.ink }]}>{g.title}</Text>

      <View style={styles.metaRow}>
        <Icon name="cal" size={13} color={c.ink3} />
        <Text style={[styles.meta, { color: c.ink2 }]}>
          {g.when}
          {g.where ? ` · ${g.where}` : ''}
        </Text>
      </View>

      {g.host ? <Text style={[styles.host, { color: c.ink3 }]}>Hosted by {g.host}</Text> : null}

      {g.desc ? <Text style={[styles.desc, { color: c.ink2 }]}>{g.desc}</Text> : null}

      <View style={styles.footer}>
        <View style={[styles.pill, { backgroundColor: c.surface }]}>
          <Icon name="tribe" size={12} color={c.ink2} />
          <Text style={[styles.pillText, { color: c.ink2 }]}>{g.going} going</Text>
        </View>
        {/* spots is a free-text capacity line the coach wrote, shown as-is */}
        {g.spots ? <Text style={[styles.pillText, { color: c.ink3, flex: 1 }]}>{g.spots}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: t.sm, textAlign: 'center', marginTop: spacing.s4 },
  title: { fontSize: t.body, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.s1 },
  meta: { fontSize: t.sm },
  host: { fontSize: t.xs, marginTop: spacing.s1 },
  desc: { fontSize: t.sm, lineHeight: t.sm * 1.5, marginTop: spacing.s2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginTop: spacing.s3 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.s2,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  pillText: { fontSize: t.xs },
});
