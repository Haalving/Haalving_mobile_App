import { ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHive, useMe, useShelves } from '@/api/client-app';
import { ClientHeader } from '@/components/client/ClientHeader';
import { Honeycomb, type HexDoor, type HiveTile } from '@/components/client/Honeycomb';
import { EventsSheet } from '@/components/client/community/EventsSheet';
import { GamesSheet } from '@/components/client/community/GamesSheet';
import { ShelfSheet } from '@/components/client/community/ShelfSheet';
import { OnboardingGate } from '@/components/client/OnboardingGate';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * THE COMMUNITY — the hive, and nothing else on the page.
 *
 * THE COMB IS THE PAGE. Three doors — the daily Health Games book, Events &
 * Challenges, and the Haalving Zone — each carrying a line of live state from
 * `GET /client/community/hive`, then four tiles for the quieter rooms. Every lane
 * opens as a SHEET over this hub: the hive is one section, and a route of its own
 * under `(tabs)/` becomes a tab, which is what went wrong the first time.
 *
 * The published gatherings are the Events tab of Events & Challenges. They used to
 * be listed here as well, which made the hub a scrolling list with a honeycomb
 * stuck on top of it.
 */
export default function CommunityScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const hive = useHive();
  const shelves = useShelves();
  /*
   * THE HIVE IS ONE SECTION. Every room opens as a sheet over this hub rather than
   * as a route of its own — a route under `(tabs)/` becomes a TAB, which is exactly
   * what went wrong the first time round.
   */
  const [room, setRoom] = useState<null | 'games' | 'events' | 'partners' | 'learn'>(null);
  const { width } = useWindowDimensions();

  /*
   * THE GATE. Somebody signed up but not yet promoted has an account and no
   * client record, so there is nothing on this page to draw — and every
   * query behind it would refuse. The tab stays reachable and says where
   * their onboarding actually is instead.
   */
  if (me.data && !me.data.onboarded && me.data.onboarding) {
    return (
      <ClientGround>
        <ClientHeader name={me.data.name} plan={me.data.plan} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: spacing.s2,
            paddingHorizontal: spacing.s5,
            paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8,
          }}
        >
          <OnboardingGate ob={me.data.onboarding} what={'The community opens once you are onboarded.'} />
        </ScrollView>
      </ClientGround>
    );
  }

  /*
   * THE THREE DOORS AND THEIR LIVE LINES.
   *
   * Each meta line is real state or nothing: while the hive is still loading the
   * line reads as a dash rather than a zero, because "0 questions today" is a
   * claim and an unloaded count is not.
   */
  const h = hive.data;
  const games = h
    ? h.games.answered
      ? `${h.games.answered} of ${h.games.total} today`
      : `${h.games.total} question${h.games.total === 1 ? '' : 's'} today`
    : '—';
  const doors: HexDoor[] = [
    { key: 'quiz', label: 'Health Games', icon: 'bulb', meta: games, onPress: () => setRoom('games') },
    {
      key: 'event',
      label: 'Events & Challenges',
      icon: 'cal',
      meta: h ? `${h.events.total} to join` : '—',
      onPress: () => setRoom('events'),
    },
    {
      key: 'zone',
      label: 'Haalving Zone',
      icon: 'grid',
      /* the count is real even though the room is not built yet — it is read from
         the same hive call, so the door will not change its story when it opens */
      meta: h ? `${h.zone.posts} posts · ${h.zone.zones} zone${h.zone.zones === 1 ? '' : 's'}` : '—',
      onPress: () => {},
    },
  ];

  const tiles: HiveTile[] = [
    { icon: 'award', label: 'Our Partners', onPress: () => setRoom('partners') },
    { icon: 'doc', label: 'E-Learning & Content', onPress: () => setRoom('learn') },
    { icon: 'grid', label: 'Placeholder 3', soon: true },
    { icon: 'flow', label: 'Placeholder 4', soon: true },
  ];

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
        {/*
          * THE COMB IS THE PAGE.
          *
          * No scene band and no gatherings list under it: the hive is ONE section
          * and every lane lives behind a door. The gatherings that used to sit
          * here are the Events tab of Events & Challenges, and printing them twice
          * made the hub a scrolling list with a honeycomb stuck on top.
          */}
        <Text style={[styles.welcome, { color: c.ink2 }]}>Welcome,</Text>
        <Text style={[styles.who, { color: c.ink }]}>{me.data?.name ?? ' '}</Text>

        <Honeycomb width={width - spacing.s4 * 2} doors={doors} tiles={tiles} />

      </ScrollView>

      {/* the rooms, each over the hub rather than beside it in the tab bar */}
      <GamesSheet open={room === 'games'} onClose={() => setRoom(null)} />
      <EventsSheet open={room === 'events'} onClose={() => setRoom(null)} />
      <ShelfSheet
        open={room === 'partners'}
        title="Our Partners"
        sub="The places HAALVING has already vetted, so a day away from your plan is still a day on it. Your coach can book any of these for you."
        footnote="Partner rates apply to Poorna memberships."
        items={shelves.data?.partners ?? []}
        loading={shelves.isLoading}
        onClose={() => setRoom(null)}
      />
      <ShelfSheet
        open={room === 'learn'}
        title="E-Learning & Content"
        sub="The reading behind the plan — why the four pillars are the four pillars, in the words of the people who set them."
        footnote="New pieces land on the first day of every cycle."
        items={shelves.data?.learn ?? []}
        loading={shelves.isLoading}
        onClose={() => setRoom(null)}
      />
    </ClientGround>
  );
}

const styles = StyleSheet.create({
  /* the reference opens on a greeting, not a scene band — the comb is the page */
  welcome: { fontSize: t.h3, marginTop: spacing.s2 },
  who: { fontSize: t.h1, fontWeight: '700', marginBottom: spacing.s5 },
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
