import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe, useTrackers, type NutrientRow, type TrackerSignal } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { QuickAddSheet } from '@/components/client/QuickAddSheet';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * Trackers — the signals hub (`client-trackers.js`, the #/trackers tab).
 *
 * The scene band, the Daily/Journey segmented control, the day strip, the eight
 * signal readings and the Nutrient-Panel ledger, at the demo's boxes. Data from a
 * fixture until `GET /client/trackers` ships.
 *
 * DEFERRED this breadth pass (documented in docs/pixel/TODO.md): the demo's
 * centrepiece is a floating hologram FIGURE (img/np/body.webp) with the signals
 * as glass satellites (backdrop-blur) and a spinning pad — that needs the body
 * asset, expo-blur and SVG masks. Here the same readings render as a signal grid;
 * the per-signal detail pages and the manual-entry FAB sheets are not yet ported.
 */

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function TrackersScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const tr = useTrackers();
  const data = tr.data;
  const [addOpen, setAddOpen] = useState(false);

  const seriesColor = (s: string) => (c as unknown as Record<string, string>)[s] ?? c.brand;
  const stateColor = { ok: c.ok, warn: c.amber, bad: c.danger } as const;

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8 }]}
      >
        <SceneBand kicker="YOUR SIGNALS" title="Trackers" sub="Pick a day · tap any signal to open it" />

        {/* Daily / Journey segmented control (.tfil.t2) */}
        <View style={styles.seg}>
          <View style={[styles.segBtn, { backgroundColor: c.brandFill }]}>
            <Text style={[styles.segLabel, { color: '#fff' }]}>Daily Tracking</Text>
          </View>
          <Pressable style={styles.segBtn} onPress={() => router.push('/(tabs)/journey')}>
            <Text style={[styles.segLabel, { color: c.ink3 }]}>Journey</Text>
          </Pressable>
        </View>

        {/* day strip — a week of days, today selected (simplified) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dstrip}>
          {WEEK.map((w, i) => {
            const on = i === WEEK.length - 1;
            return (
              <View key={i} style={[styles.dday, on ? { backgroundColor: c.surface } : null]}>
                <Text style={[styles.dw, { color: on ? c.ink : c.ink3 }]}>{w}</Text>
                <Text style={[styles.dn, { color: on ? c.ink : c.ink3, fontFamily: numFamily(on ? 600 : 400) }]}>
                  {i + 1}
                </Text>
              </View>
            );
          })}
        </ScrollView>
        <Text style={[styles.dsel, { color: c.ink2 }]}>Today</Text>

        {/* the eight signals */}
        <View style={styles.grid}>
          {(data?.signals ?? []).map((s) => (
            <Signal key={s.key} s={s} color={seriesColor(s.series)} />
          ))}
        </View>

        {/* Nutrient Panel ledger — shown once the panel is computed; until then the
            signals above stand on their own rather than under two empty headers */}
        {data && (data.macros.length > 0 || data.micros.length > 0) ? (
          <Card>
            <Text style={[styles.tkgrp, { color: c.ink3 }]}>MACROS · DAILY TARGETS</Text>
            {data.macros.map((r) => (
              <LedgerRow key={r.name} r={r} dot={stateColor[r.state]} />
            ))}
            <Text style={[styles.tkgrp, { color: c.ink3, marginTop: spacing.s4 }]}>
              MICROS · THE FIVE YOUR TEAM ACTS ON
            </Text>
            {data.micros.map((r) => (
              <LedgerRow key={r.name} r={r} dot={stateColor[r.state]} />
            ))}
          </Card>
        ) : data ? (
          <Card>
            <Text style={[styles.tkgrp, { color: c.ink3 }]}>NUTRIENT PANEL</Text>
            <Text style={{ color: c.ink2, fontSize: t.sm, lineHeight: t.sm * 1.5 }}>
              Your macros and the five micros your team acts on appear here as your logged
              meals are read.
            </Text>
          </Card>
        ) : null}

        <Text style={[styles.audit, { color: c.ink3 }]}>
          Steps, activity, sleep and screen time sync automatically; water is one tap here, any time.
        </Text>
      </ScrollView>

      {/* the quick-add FAB — opens the manual-entry sheet */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log a track"
        onPress={() => setAddOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: TABBAR_HEIGHT + insets.bottom + spacing.s5,
            borderColor: c.brand,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <Icon name="plus" size={27} color="#fff" strokeWidth={1.5} />
      </Pressable>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </ClientGround>
  );
}

function Signal({ s, color }: { s: TrackerSignal; color: string }) {
  const c = useTheme();
  return (
    <View style={[styles.sig, { backgroundColor: c.surface }]}>
      <View style={styles.sigHead}>
        <Icon name={s.icon} size={16} color={color} />
        <Text style={[styles.sigLabel, { color: c.ink3 }]}>{s.label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={{ fontFamily: numFamily(500), fontSize: 22, color: c.ink }}>{s.value}</Text>
        {s.sub ? <Text style={{ fontSize: t.micro, color: c.ink3 }}>{s.sub}</Text> : null}
      </View>
      <View style={[styles.sigBar, { backgroundColor: c.surface3 }]}>
        <View style={{ height: '100%', borderRadius: radius.full, width: `${Math.min(100, s.pct)}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

function LedgerRow({ r, dot }: { r: NutrientRow; dot: string }) {
  const c = useTheme();
  return (
    <View style={styles.tkrow}>
      <View style={[styles.hdot, { backgroundColor: dot }]} />
      <Text style={{ color: c.ink2, fontSize: t.sm }}>{r.name}</Text>
      <View style={[styles.leader, { borderBottomColor: c.line }]} />
      <Text style={{ fontFamily: numFamily(500), color: c.ink, fontSize: t.h3 }}>{r.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5, gap: spacing.s4 },
  seg: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s1, marginTop: spacing.s3 },
  segBtn: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.s2, paddingHorizontal: spacing.s4, borderRadius: radius.full },
  segLabel: { fontSize: t.sm, fontWeight: '600' },

  dstrip: { gap: spacing.s1 },
  dday: { width: 48, alignItems: 'center', gap: 2, paddingVertical: spacing.s2, borderRadius: radius.md },
  dw: { fontSize: t.micro, fontWeight: '600', letterSpacing: 0.6 },
  dn: { fontSize: t.micro },
  dsel: { fontSize: t.xs, fontWeight: '600', textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  sig: { width: '48.5%', borderRadius: radius.md, padding: spacing.s3, gap: spacing.s1 },
  sigHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  sigLabel: { fontSize: t.micro, fontWeight: '600', letterSpacing: 0.2 },
  sigBar: { height: 3, borderRadius: radius.full, marginTop: spacing.s1, overflow: 'hidden' },

  tkgrp: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.15, marginBottom: spacing.s2 },
  tkrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingVertical: 3 },
  hdot: { width: 6, height: 6, borderRadius: 3 },
  leader: { flex: 1, borderBottomWidth: 1, borderStyle: 'dotted', marginBottom: 4 },

  audit: { fontSize: t.micro, fontStyle: 'italic', lineHeight: t.micro * 1.4 },

  fab: {
    position: 'absolute',
    right: spacing.s5,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
