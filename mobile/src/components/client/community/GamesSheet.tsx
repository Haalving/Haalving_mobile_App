import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAnswerGame, useGames } from '@/api/client-app';
import { Icon } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

import { CommunitySheet } from './Sheet';

/**
 * HEALTH GAMES — the daily book, one question at a time.
 *
 * ONE QUESTION ON SCREEN, with arrows under it, because that is what the book is:
 * five short questions you move through, not a form you scroll. A list of five
 * would invite skimming to the ones that look easy, which is the opposite of what
 * a daily quiz is for.
 *
 * THE FIRST ANSWER STANDS. The server refuses a second, so after answering the
 * options stop being buttons and become the record of what happened — what was
 * chosen, what was right, and why. A quiz you can retry until it goes green
 * measures nothing.
 *
 * THE KEY ARRIVES WITH THE VERDICT. `answer` and `why` are null until this client
 * has answered, so the correct index is never sitting in the payload for somebody
 * reading the network tab.
 */
export function GamesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useTheme();
  const q = useGames();
  const answer = useAnswerGame();

  const [dayIdx, setDayIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);

  const days = q.data ?? [];
  const day = days[Math.min(dayIdx, Math.max(0, days.length - 1))];
  const qs = day?.questions ?? [];
  const cur = qs[Math.min(qIdx, Math.max(0, qs.length - 1))];

  const pickDay = (i: number) => {
    setDayIdx(i);
    setQIdx(0);
  };

  return (
    <CommunitySheet open={open} title="Health Games" onClose={onClose}>
      {/* the day strip — today first, each showing how much of it is behind you */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {days.map((d, i) => {
          const on = i === dayIdx;
          const done = d.questions.filter((x) => x.chose != null).length;
          return (
            <Pressable
              key={d.id}
              onPress={() => pickDay(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${d.label}, ${done} of ${d.questions.length} answered`}
              style={[styles.day, { backgroundColor: on ? c.brandFill : c.surface2, borderColor: on ? c.brandFill : c.line }]}
            >
              <Text style={[styles.dayLabel, { color: on ? '#fff' : c.ink }]}>{d.label}</Text>
              {/* a dot per question, filled as they are answered — the demo's stars */}
              <View style={styles.pips}>
                {d.questions.map((x, n) => (
                  <View
                    key={n}
                    style={[
                      styles.pip,
                      {
                        backgroundColor:
                          x.chose != null ? (on ? '#fff' : c.brand) : on ? 'rgba(255,255,255,0.35)' : c.line,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.dayMeta, { color: on ? '#fff' : c.ink3, fontFamily: numFamily(500) }]}>
                {done}/{d.questions.length}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {q.isLoading ? <Text style={[styles.note, { color: c.ink3 }]}>Loading…</Text> : null}

      {day && cur ? (
        <>
          <Text style={[styles.lede, { color: c.ink3 }]}>
            {day.date || day.label} · {qs.length} question{qs.length === 1 ? '' : 's'} · use the arrows below
          </Text>

          <View style={[styles.card, { backgroundColor: c.surface2, borderColor: c.line }]}>
            <Text style={[styles.prompt, { color: c.ink }]}>{cur.prompt}</Text>

            <View style={{ gap: spacing.s2, marginTop: spacing.s4 }}>
              {cur.options.map((opt, i) => {
                const answered = cur.chose != null;
                const mine = answered && cur.chose === i;
                const key = answered && cur.answer === i;
                return (
                  <Pressable
                    key={i}
                    disabled={answered || answer.isPending}
                    onPress={() => answer.mutate({ questionId: cur.id, chose: i })}
                    accessibilityRole="button"
                    style={[
                      styles.opt,
                      {
                        backgroundColor: key ? c.brandWash : mine ? c.surface3 : c.surface,
                        borderColor: key ? c.brand : mine ? c.lineStrong : c.line,
                      },
                    ]}
                  >
                    <Text style={[styles.optText, { color: c.ink }]}>{opt}</Text>
                    {key ? <Icon name="check" size={16} color={c.brand} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {cur.chose != null ? (
              <>
                <Text style={[styles.verdict, { color: cur.chose === cur.answer ? c.brand : c.amber }]}>
                  {cur.chose === cur.answer ? 'Right' : 'Not this time'}
                </Text>
                {cur.why ? <Text style={[styles.why, { color: c.ink2 }]}>{cur.why}</Text> : null}
              </>
            ) : null}
          </View>

          {/* paging: arrows and a dot per question, so position is never a guess */}
          <View style={styles.pager}>
            <Pressable
              onPress={() => setQIdx((n) => Math.max(0, n - 1))}
              disabled={qIdx <= 0}
              accessibilityLabel="Previous question"
              style={[styles.round, { backgroundColor: c.surface2, opacity: qIdx <= 0 ? 0.4 : 1 }]}
            >
              <Icon name="chevL" size={18} color={c.ink} />
            </Pressable>

            <View style={styles.dots}>
              {qs.map((_, n) => (
                <View
                  key={n}
                  style={[styles.dot, { backgroundColor: n === qIdx ? c.brand : c.line }]}
                />
              ))}
            </View>

            <Pressable
              onPress={() => setQIdx((n) => Math.min(qs.length - 1, n + 1))}
              disabled={qIdx >= qs.length - 1}
              accessibilityLabel="Next question"
              style={[styles.round, { backgroundColor: c.surface2, opacity: qIdx >= qs.length - 1 ? 0.4 : 1 }]}
            >
              <Icon name="chevR" size={18} color={c.ink} />
            </Pressable>
          </View>
        </>
      ) : null}

      {!q.isLoading && !day ? (
        <Text style={[styles.note, { color: c.ink3 }]}>No games are open yet.</Text>
      ) : null}
    </CommunitySheet>
  );
}

const styles = StyleSheet.create({
  strip: { gap: spacing.s2, paddingBottom: spacing.s2 },
  day: {
    minWidth: 66,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dayLabel: { fontSize: t.sm, fontWeight: '700' },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 5, height: 5, borderRadius: 3 },
  dayMeta: { fontSize: 11 },
  lede: { fontSize: t.micro, marginTop: spacing.s2 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.s5 },
  prompt: { fontSize: t.h3, fontWeight: '700', lineHeight: t.h3 * 1.35 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  optText: { fontSize: t.sm, flex: 1 },
  verdict: { fontSize: t.sm, fontWeight: '700', marginTop: spacing.s4 },
  why: { fontSize: t.sm, lineHeight: t.sm * 1.55, marginTop: spacing.s2 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s4 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  note: { fontSize: t.sm, textAlign: 'center', paddingVertical: spacing.s6 },
});
