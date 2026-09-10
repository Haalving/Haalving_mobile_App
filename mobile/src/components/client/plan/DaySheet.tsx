import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useMarkSessionDone,
  useSendCircle,
  type Meal,
  type PlanDayItem,
  type PlanProgress,
} from '@/api/client-app';
import { DishSheet } from '@/components/client/DishSheet';
import { NutritionDay } from '@/components/client/plan/NutritionDay';
import { MoveRow, ProgressTiles } from '@/components/client/plan/SheetParts';
import { Icon } from '@/components/ui/Icon';
import { Button, Pill } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * A DAY, OPENED — and one session inside it.
 *
 * The grid says a day HAS a fitness session; it cannot say which one, when, with
 * whom, or whether it has happened. Tapping a day was doing nothing at all, so
 * that was the whole of what a client could learn about their own week.
 *
 * TWO LAYERS, one sheet. The day lists its sessions with each one's status; a row
 * opens that session's own card — the block, the coach, the progress this cycle,
 * and the two things a client can actually do about it.
 *
 * "CAN'T MAKE IT" GOES TO THE COACH, not into a local flag. A session a client
 * silently drops is a session the coach turns up for; the message lands in the
 * circle, which is the room the coach already watches, and it names the session
 * and the day so nobody has to ask which one.
 */

const PILLAR_WORD: Record<string, string> = {
  fitness: 'Power: Fitness Biohack',
  culture: 'Fuel: Nutrition Biohack',
  yoga: 'Flow: Yoga Biohack',
  wellness: 'Peace: Mind Biohack',
};

/** The status a session carries, in the client's words. */
function statusOf(status: string): { label: string; tone: 'ok' | 'warn' | 'plain' } {
  if (status === 'done') return { label: 'done', tone: 'ok' };
  if (status === 'today') return { label: 'today', tone: 'ok' };
  if (status === 'missed' || status === 'miss') return { label: 'missed', tone: 'warn' };
  if (status === 'cancelled') return { label: 'cancelled', tone: 'warn' };
  return { label: 'planned', tone: 'plain' };
}

export interface DayForSheet {
  day: number;
  date: string;
  /** the real date, so the day's plate can be fetched */
  iso?: string;
  rest?: boolean;
  flag?: string;
  plate?: boolean;
  items: PlanDayItem[];
}

export function DaySheet({
  day,
  colors,
  todayDay,
  levels,
  progress,
  unallocated = [],
  onClose,
  onFullPlan,
}: {
  day: DayForSheet | null;
  colors: Record<string, string>;
  /** the cycle-day it is now — a session cannot be ticked before it happens */
  todayDay: number;
  /** each pillar's level, for the "Level N" pill the demo prints in the header */
  levels: Record<string, number>;
  /** "Your progress this cycle", per pillar — the server does this arithmetic */
  progress: Record<string, PlanProgress[]>;
  /** on a next-cycle day: the pillars nobody has queued — a row each, saying so */
  unallocated?: string[];
  onClose: () => void;
  onFullPlan: (pillar: string) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const send = useSendCircle();
  const markDone = useMarkSessionDone();

  /* which session is open, by index — null means the day's list */
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  /* the plate is its own room inside the day — the food, not a session */
  const [openPlate, setOpenPlate] = useState(false);
  /* one move, opened onto its instructions */
  const [move, setMove] = useState<Meal | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (!day) return null;
  const item = openIdx != null ? day.items[openIdx] : null;

  const close = () => {
    setOpenIdx(null);
    setOpenPlate(false);
    setSent(null);
    onClose();
  };

  const cantMakeIt = (it: PlanDayItem) => {
    const who = it.staff ? ` ${it.staff}` : '';
    send.mutate(
      `I can't make ${it.label} on day ${day.day} (${day.date}), ${it.time}.${who ? ` Sorry${who} —` : ''} can we move it?`,
      { onSuccess: () => setSent(it.label) },
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: c.surface2, paddingBottom: insets.bottom + spacing.s5 }]}>
          <ScrollView contentContainerStyle={{ padding: spacing.s5, gap: spacing.s3 }}>
            {openPlate ? (
              /* ------------------------------------------------ the plate */
              <>
                <View style={styles.headRow}>
                  <Pressable onPress={() => setOpenPlate(false)} hitSlop={10} accessibilityLabel="Back to the day">
                    <Icon name="chevL" size={20} color={c.ink} />
                  </Pressable>
                  <Text style={[styles.h1, { color: c.ink }]}>Fuel: Nutrition Biohack</Text>
                  {levels.culture != null ? (
                    <View style={{ marginLeft: 'auto' }}>
                      <Pill tone="info">{`Level ${levels.culture}`}</Pill>
                    </View>
                  ) : null}
                </View>
                {day.iso ? (
                  <NutritionDay iso={day.iso} />
                ) : (
                  <Text style={[styles.note, { color: c.ink3 }]}>This day has no date to read.</Text>
                )}
                {/* a plate is not "done" — each meal is Logged or not, which the
                    rows above already say. The cycle figures are the summary. */}
                <ProgressTiles rows={progress.culture ?? []} />
                <Button
                  label="Full Diet Plan"
                  variant="ghost"
                  onPress={() => {
                    close();
                    onFullPlan('culture');
                  }}
                />
                <Button label="Close" onPress={close} />
              </>
            ) : item ? (
              /* ---------------------------------------------- one session */
              <>
                <View style={styles.headRow}>
                  <Pressable onPress={() => setOpenIdx(null)} hitSlop={10} accessibilityLabel="Back to the day">
                    <Icon name="chevL" size={20} color={c.ink} />
                  </Pressable>
                  <Text style={[styles.h1, { color: c.ink }]}>{PILLAR_WORD[item.pillar] ?? item.pillar}</Text>
                  {levels[item.pillar] != null ? (
                    <View style={{ marginLeft: 'auto' }}>
                      <Pill tone="info">{`Level ${levels[item.pillar]}`}</Pill>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.title, { color: c.ink }]}>{item.label}</Text>
                <Text style={[styles.sub, { color: c.ink2 }]}>
                  {item.time}
                  {item.staff ? ` · with ${item.staff}` : ''}
                </Text>
                <StatusPill status={item.status} />

                {/*
                  * WHAT THE SESSION ACTUALLY IS.
                  *
                  * The card used to be a title, a time and a coach — everything
                  * except the thing a client opens it to find out. These are the
                  * moves the template prescribes, described by the same code that
                  * describes a meal, and each one opens onto how it is done.
                  */}
                {(item.moves ?? []).map((mv, n) => (
                  <MoveRow
                    key={`${mv.slot}-${n}`}
                    move={mv}
                    /* a plan you can tick a week ahead measures nothing */
                    canTick={day.day <= todayDay}
                    pending={markDone.isPending}
                    onOpen={() => setMove(mv)}
                    onDone={() =>
                      markDone.mutate({ day: day.day, pillar: item.pillar, moveIdx: mv.idx ?? n })
                    }
                  />
                ))}
                {(item.moves ?? []).length ? (
                  <Text style={[styles.note, { color: c.ink3 }]}>
                    Tap a move for how it’s done.
                  </Text>
                ) : null}

                <ProgressTiles rows={progress[item.pillar] ?? []} />

                {/*
                  * MARK IT DONE — and the team sees it.
                  *
                  * This writes the same completion a coach's tick writes, so the
                  * client's progress and their coach's board cannot tell two
                  * stories about the same half hour. Offered only once the day has
                  * come round: a plan you can tick a week ahead measures nothing.
                  */}
                {item.status !== 'done' && day.day <= todayDay ? (
                  <Button
                    label={markDone.isPending ? 'Marking…' : 'Mark session done'}
                    onPress={() => markDone.mutate({ day: day.day, pillar: item.pillar })}
                    disabled={markDone.isPending}
                  />
                ) : null}
                {item.status === 'done' ? (
                  <Text style={[styles.note, { color: c.brand }]}>
                    Done — your team can see this.
                  </Text>
                ) : null}

                {/* what the client can do about it, and nothing they cannot */}
                {sent === item.label ? (
                  <Text style={[styles.note, { color: c.brand }]}>
                    Your coach has been told — they will come back to you in the circle.
                  </Text>
                ) : (
                  <Button
                    label={send.isPending ? 'Telling your coach…' : 'Can’t make it'}
                    variant="ghost"
                    onPress={() => cantMakeIt(item)}
                    disabled={send.isPending}
                  />
                )}

                <Button
                  label={`Full ${PILLAR_WORD[item.pillar] ?? ''} plan`.replace('  ', ' ')}
                  variant="ghost"
                  onPress={() => {
                    close();
                    onFullPlan(item.pillar);
                  }}
                />
                <Button label="Close" onPress={close} />
              </>
            ) : (
              /* ------------------------------------------------- the day */
              <>
                <Text style={[styles.h1, { color: c.ink }]}>
                  Day {day.day}
                  {day.date ? ` · ${day.date}` : ''}
                </Text>
                {day.flag ? (
                  <Text style={[styles.flag, { color: c.brand }]}>{day.flag.toUpperCase()}</Text>
                ) : null}

                {day.rest ? (
                  <Text style={[styles.note, { color: c.ink2 }]}>
                    Active rest day — a gentle walk, plenty of water, an early night. Recovery is part of
                    the plan, not a pause from it.
                  </Text>
                ) : null}

                {day.items.map((it, i) => {
                  const st = statusOf(it.status);
                  return (
                    <Pressable
                      key={`${it.pillar}-${i}`}
                      onPress={() => setOpenIdx(i)}
                      accessibilityRole="button"
                      style={[styles.row, { backgroundColor: c.surface }]}
                    >
                      <View style={[styles.dot, { backgroundColor: colors[it.pillar] ?? c.ink3 }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rowTitle, { color: c.ink }]}>{it.label}</Text>
                        <Text style={[styles.rowSub, { color: c.ink2 }]} numberOfLines={1}>
                          {it.time}
                          {it.staff ? ` · ${it.staff}` : ''} · {PILLAR_WORD[it.pillar] ?? it.pillar}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.pill,
                          {
                            color: st.tone === 'ok' ? c.brand : st.tone === 'warn' ? c.amber : c.ink3,
                            fontFamily: numFamily(500),
                          },
                        ]}
                      >
                        {st.label}
                      </Text>
                    </Pressable>
                  );
                })}

                {/* the plate is the day's standing task, rest days included */}
                {day.plate ? (
                  <Pressable
                    onPress={() => setOpenPlate(true)}
                    accessibilityRole="button"
                    accessibilityLabel="The day’s plate"
                    style={[styles.row, { backgroundColor: c.surface }]}
                  >
                    <View style={[styles.dot, { backgroundColor: colors.culture ?? c.ink3 }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: c.ink }]}>The day’s plate</Text>
                      <Text style={[styles.rowSub, { color: c.ink2 }]}>
                        Nutrition · every day · photo your meals
                      </Text>
                    </View>
                    <Text style={[styles.pill, { color: c.ink3 }]}>daily</Text>
                  </Pressable>
                ) : null}

                {/* NOT ALLOCATED — a pillar nobody has queued for next cycle. Said
                    plainly, rather than drawing this cycle's plan under next cycle's
                    date and letting the reader assume it carries on. */}
                {unallocated.map((p) => (
                  <View key={p} style={[styles.row, { backgroundColor: c.surface, opacity: 0.75 }]}>
                    <View style={[styles.dot, { backgroundColor: c.ink3 }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: c.ink }]}>{PILLAR_WORD[p] ?? p}</Text>
                      <Text style={[styles.rowSub, { color: c.ink2 }]}>Not allocated yet — your coach hasn’t set this for next cycle</Text>
                    </View>
                    <Text style={[styles.pill, { color: c.ink3 }]}>—</Text>
                  </View>
                ))}

                {!day.items.length && !day.plate && !day.rest && !unallocated.length ? (
                  <Text style={[styles.note, { color: c.ink3 }]}>
                    Nothing scheduled — enjoy the open day.
                  </Text>
                ) : null}

                {day.items.length ? (
                  <Text style={[styles.note, { color: c.ink3 }]}>
                    Tap a row for the task and your progress in it.
                  </Text>
                ) : null}

                <Button label="Close" onPress={close} />
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* the same detail sheet a dish opens — one way of describing a thing */}
      <DishSheet meal={move} onClose={() => setMove(null)} />
    </Modal>
  );
}

function StatusPill({ status }: { status: string }) {
  const c = useTheme();
  const st = statusOf(status);
  const tone = st.tone === 'ok' ? c.brand : st.tone === 'warn' ? c.amber : c.ink3;
  return (
    <View style={[styles.statusWrap, { borderColor: tone }]}>
      <Text style={[styles.statusText, { color: tone }]}>{st.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  h1: { fontSize: t.h2, fontWeight: '700' },
  title: { fontSize: t.h3, fontWeight: '700', marginTop: spacing.s2 },
  sub: { fontSize: t.sm, marginTop: 2 },
  flag: { fontSize: t.micro, fontWeight: '700', letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: t.sm, fontWeight: '700' },
  rowSub: { fontSize: t.micro, marginTop: 2 },
  pill: { fontSize: t.micro, fontWeight: '600' },
  statusWrap: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.s2,
  },
  statusText: { fontSize: t.micro, fontWeight: '600' },
  note: { fontSize: t.sm, lineHeight: t.sm * 1.5, marginTop: spacing.s2 },
  move: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.md,
  },
  moveArt: { width: 46, height: 46, borderRadius: radius.sm },
  moveTitle: { fontSize: t.sm, fontWeight: '700' },
  moveSub: { fontSize: t.micro, marginTop: 2, lineHeight: t.micro * 1.4 },
});
