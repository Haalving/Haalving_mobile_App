import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOODS, useClearArrival, useSetArrival, type ArrivalCell, type Mood } from '@/api/client-app';
import { EmptyDayFace, MOOD_LABEL, MOOD_LINE, MoodFace, NEUTRAL_LINE } from '@/components/client/MoodFaces';
import { Icon } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE ARRIVAL SHEET — a ceremony, not a form (client-today.js openArrival).
 *
 * One large face that listens, four small ones that answer, a line for why,
 * seven days of weather below. Tapping a face IS the note: it saves at once
 * and the band behind the sheet settles on it. Settling on a face is one
 * arrival, not four, so a second tap the same morning refines the answer
 * rather than stacking one. A mood is offered, never owed — "Clear today's
 * note" takes it back.
 *
 * Geometry is the demo's: the big face at 96, the answering faces at 38 in a
 * 58 disc, the strip's at 22 (app.css .mbig, .moodrow, .mstrip).
 */
export function ArrivalSheet({
  open,
  onClose,
  mood,
  note,
  strip,
}: {
  open: boolean;
  onClose: () => void;
  mood: string | null;
  note: string | null;
  strip: ArrivalCell[];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const set = useSetArrival();
  const clear = useClearArrival();

  const [pick, setPick] = useState<Mood | null>((mood as Mood | null) ?? null);
  const [why, setWhy] = useState(note ?? '');

  /* the sheet opens on what the server holds — a save made from Trackers, say */
  useEffect(() => {
    if (!open) return;
    setPick((mood as Mood | null) ?? null);
    setWhy(note ?? '');
  }, [open, mood, note]);

  const choose = (m: Mood) => {
    setPick(m);
    set.mutate({ mood: m, note: why.trim() || undefined });
  };

  /* the line rides with the face; an empty box clears a line written earlier */
  const saveWhy = () => {
    if (!pick) return;
    set.mutate({ mood: pick, note: why.trim() || '' });
  };

  const takeBack = () => {
    clear.mutate(undefined, {
      onSuccess: () => {
        setPick(null);
        setWhy('');
      },
    });
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: c.surface2, paddingBottom: insets.bottom + spacing.s4 }]}>
          <Pressable style={styles.x} onPress={onClose} hitSlop={10} accessibilityLabel="Done — close">
            <Icon name="x" size={20} color={c.ink3} />
          </Pressable>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.s5, paddingTop: spacing.s5 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.kicker, { color: c.brand }]}>THIS MORNING</Text>
            <Text style={[styles.h1, { color: c.ink }]}>How are you arriving?</Text>

            {/* .mbig — 96px, hairline 1.05 */}
            <View style={styles.big}>
              <MoodFace mood={pick} size={96} color={c.ink} variant="lg" strokeWidth={1.05} />
            </View>
            <Text style={[styles.line, { color: c.ink2 }]}>{pick ? MOOD_LINE[pick] : NEUTRAL_LINE}</Text>

            {/* .moodrow — four answering faces */}
            <View style={styles.row} accessibilityRole="radiogroup">
              {MOODS.map((m) => {
                const on = pick === m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => choose(m)}
                    style={styles.mood}
                  >
                    <View style={[styles.disc, on ? { backgroundColor: c.brandWash } : null]}>
                      <MoodFace mood={m} size={38} color={on ? c.brand : c.ink3} />
                    </View>
                    <Text style={[styles.moodLabel, { color: on ? c.brand : c.ink3 }]}>{MOOD_LABEL[m]}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* .mnote */}
            <TextInput
              style={[styles.note, { backgroundColor: c.surface3, color: c.ink }]}
              placeholder="A line about why — only if you want"
              placeholderTextColor={c.ink3}
              value={why}
              onChangeText={setWhy}
              onBlur={saveWhy}
              onSubmitEditing={saveWhy}
              multiline
              numberOfLines={2}
              maxLength={280}
              accessibilityLabel="A line about why, optional"
            />

            {/* .mstrip — the last seven arrivals, oldest first, ending on today */}
            <View style={styles.strip}>
              <View style={styles.stripRow}>
                {strip.map((cell) => {
                  const shown = cell.today ? pick : (cell.mood as Mood | null);
                  const color = shown ? (cell.today ? c.brand : c.ink2) : c.ink3;
                  return (
                    <View key={`${cell.day}-${cell.today ? 't' : 'p'}`} style={styles.cell}>
                      {shown ? <MoodFace mood={shown} size={22} color={color} /> : <EmptyDayFace size={22} color={color} />}
                      <Text style={[styles.cellDay, { color }]}>{cell.day}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.cap, { color: c.ink3 }]}>Your last seven arrivals, day by day</Text>
            </View>

            {pick ? (
              <Pressable onPress={takeBack} style={styles.clear} accessibilityRole="button" disabled={clear.isPending}>
                <Text style={[styles.clearText, { color: c.ink3 }]}>Clear today’s note</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  x: { position: 'absolute', top: spacing.s2, right: spacing.s2, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.16, textAlign: 'center' },
  h1: { fontSize: t.h2, fontWeight: '600', textAlign: 'center', marginTop: spacing.s1 },
  big: { alignItems: 'center', marginTop: spacing.s4, marginBottom: spacing.s2 },
  line: { textAlign: 'center', minHeight: t.sm * 2.6, marginHorizontal: spacing.s4, marginBottom: spacing.s3, fontSize: t.sm, lineHeight: t.sm * 1.45 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s4 },
  mood: { alignItems: 'center', gap: spacing.s1, minWidth: 64 },
  disc: { width: 58, height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  moodLabel: { fontSize: 12, letterSpacing: 0.24 },
  note: { marginTop: spacing.s4, borderRadius: 12, padding: spacing.s3, fontSize: 14, lineHeight: 14 * 1.45, minHeight: 14 * 1.45 * 2 + spacing.s3 * 2, textAlignVertical: 'top' },
  strip: { marginTop: spacing.s5, marginBottom: spacing.s4, alignItems: 'center' },
  stripRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s2, marginBottom: spacing.s1 },
  cell: { alignItems: 'center', gap: 2 },
  cellDay: { fontSize: 12, fontFamily: numFamily(400) },
  cap: { fontSize: 12 },
  clear: { width: '100%', alignItems: 'center', marginTop: spacing.s2, padding: spacing.s2, minHeight: 44, justifyContent: 'center' },
  clearText: { fontSize: 13 },
});
