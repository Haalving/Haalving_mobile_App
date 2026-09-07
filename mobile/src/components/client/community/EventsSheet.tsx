import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useEvents,
  useJoinChallenge,
  useJoinEvent,
  type ChallengeCard,
  type EventCard,
} from '@/api/client-app';
import { imageUrl } from '@/components/client/DishSheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/primitives';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

import { CommunitySheet } from './Sheet';

/**
 * EVENTS & CHALLENGES — two lanes behind one door.
 *
 * ONE DOOR, TWO TABS, because the hexagon that leads here counts them together
 * ("6 to join"). They are different commitments and the tabs say so without
 * making anybody read two screens to find out: an event is a date you turn up to,
 * a challenge is a stretch of days you keep.
 *
 * ONE CARD AT A TIME, paged. The deck is short and each card is a decision, so
 * the screen shows one whole card rather than a column of half-visible ones.
 *
 * THE THREE FACTS SIT ABOVE THE BUTTON. When and where, who is hosting, what it
 * costs or what is at stake — those are what somebody decides on, so they are not
 * buried in a description below the fold.
 */
export function EventsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useTheme();
  const [tab, setTab] = useState<'events' | 'challenges'>('events');
  const [i, setI] = useState(0);

  const q = useEvents();
  const joinEvent = useJoinEvent();
  const joinChallenge = useJoinChallenge();

  const events = q.data?.events ?? [];
  const challenges = q.data?.challenges ?? [];
  const deck: Array<EventCard | ChallengeCard> = tab === 'events' ? events : challenges;
  const at = Math.min(i, Math.max(0, deck.length - 1));
  const card = deck[at];

  const pickTab = (k: 'events' | 'challenges') => {
    setTab(k);
    setI(0);
  };

  return (
    <CommunitySheet open={open} title="Events & Challenges" onClose={onClose}>
      <View style={styles.tabs}>
        {(['events', 'challenges'] as const).map((k) => {
          const on = tab === k;
          return (
            <Pressable
              key={k}
              onPress={() => pickTab(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.tab, { backgroundColor: on ? c.brandFill : 'transparent', borderColor: on ? c.brandFill : c.line }]}
            >
              <Text style={[styles.tabText, { color: on ? '#fff' : c.ink2 }]}>
                {k === 'events' ? 'Events' : 'Challenges'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? <Text style={[styles.note, { color: c.ink3 }]}>Loading…</Text> : null}

      {card ? (
        <>
          {imageUrl(card.img) ? (
            <Image source={{ uri: imageUrl(card.img) as string }} style={styles.hero} resizeMode="cover" />
          ) : null}

          <Text style={[styles.title, { color: c.ink }]}>{card.title}</Text>

          <View style={{ gap: spacing.s2, marginTop: spacing.s2 }}>
            {'when' in card ? (
              <>
                <Fact icon="cal" k={card.when} v={card.where} />
                {card.host ? <Fact icon="users" k="Hosted" v={card.host} /> : null}
                <Fact icon="flag" k="Places" v={`${card.spots} places · kept small on purpose`} />
              </>
            ) : (
              <>
                <Fact icon="drop" k={`${card.days} days`} v="The tribe board tracks everyone together" />
                {card.host ? <Fact icon="users" k="Hosted" v={card.host} /> : null}
                {card.stake ? <Fact icon="award" k="At stake" v={card.stake} /> : null}
              </>
            )}
          </View>

          {card.desc ? <Text style={[styles.body, { color: c.ink2 }]}>{card.desc}</Text> : null}

          <Button
            label={
              card.joined
                ? 'when' in card
                  ? 'You are enrolled'
                  : 'You are in'
                : 'when' in card
                  ? 'Enrol for this event'
                  : 'Join the challenge'
            }
            onPress={() =>
              'when' in card ? joinEvent.mutate(card.id) : joinChallenge.mutate(card.id)
            }
            disabled={card.joined || joinEvent.isPending || joinChallenge.isPending}
          />

          {card.about.length ? (
            <>
              <Text style={[styles.secTitle, { color: c.ink }]}>
                About this {'when' in card ? 'event' : 'challenge'}
              </Text>
              {card.about.map((line, n) => (
                <Text key={n} style={[styles.body, { color: c.ink2 }]}>
                  {line}
                </Text>
              ))}
            </>
          ) : null}

          {/* where you are in the deck, and how to move — never a guess */}
          {deck.length > 1 ? (
            <View style={styles.pager}>
              <Pressable
                onPress={() => setI((n) => Math.max(0, n - 1))}
                disabled={at <= 0}
                accessibilityLabel="Previous"
                style={[styles.round, { backgroundColor: c.surface2, opacity: at <= 0 ? 0.4 : 1 }]}
              >
                <Icon name="chevL" size={18} color={c.ink} />
              </Pressable>

              <View style={styles.dots}>
                {deck.map((_, n) => (
                  <View key={n} style={[styles.dot, { backgroundColor: n === at ? c.brand : c.line }]} />
                ))}
              </View>

              <Pressable
                onPress={() => setI((n) => Math.min(deck.length - 1, n + 1))}
                disabled={at >= deck.length - 1}
                accessibilityLabel="Next"
                style={[styles.round, { backgroundColor: c.surface2, opacity: at >= deck.length - 1 ? 0.4 : 1 }]}
              >
                <Icon name="chevR" size={18} color={c.ink} />
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      {!q.isLoading && !deck.length ? (
        <Text style={[styles.note, { color: c.ink3 }]}>
          Nothing open here yet — your pod posts these as they are set.
        </Text>
      ) : null}
    </CommunitySheet>
  );
}

function Fact({ icon, k, v }: { icon: string; k: string; v: string }) {
  const c = useTheme();
  return (
    <View style={[styles.fact, { backgroundColor: c.surface2 }]}>
      <Icon name={icon} size={16} color={c.brand} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.factK, { color: c.ink }]}>{k}</Text>
        <Text style={[styles.factV, { color: c.ink2 }]}>{v}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s2 },
  tab: { paddingVertical: 8, paddingHorizontal: spacing.s5, borderRadius: radius.full, borderWidth: 1 },
  tabText: { fontSize: t.sm, fontWeight: '600' },
  hero: { width: '100%', height: 180, borderRadius: radius.md },
  title: { fontSize: t.h2, fontWeight: '700', marginTop: spacing.s2 },
  fact: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center', padding: spacing.s3, borderRadius: radius.sm },
  factK: { fontSize: t.sm, fontWeight: '600' },
  factV: { fontSize: t.micro, marginTop: 1 },
  body: { fontSize: t.sm, lineHeight: t.sm * 1.55, marginTop: spacing.s2 },
  secTitle: { fontSize: t.sm, fontWeight: '700', marginTop: spacing.s4 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s4, marginTop: spacing.s5 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  note: { fontSize: t.sm, textAlign: 'center', paddingVertical: spacing.s6 },
});
