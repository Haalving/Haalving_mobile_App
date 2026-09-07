import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useToday, type Meal } from '@/api/client-app';
import { DishSheet, imageUrl } from '@/components/client/DishSheet';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * NUTRITION, FOR ONE DAY — what to eat, and what it comes to.
 *
 * READ FROM `/client/today?day=<iso>`, which already assembles exactly this: the
 * prescribed plate for that cycle-day, each meal's calories and protein, and the
 * targets line the console prints above the same plate. The plan screen could not
 * ask for it before only because a calendar day carried the label "Sep 10" and not
 * a date.
 *
 * THE MEALS ARE WHAT THE PLAN PRESCRIBES, not only what has been photographed. A
 * day nobody has logged still shows the food, because the question a client opens
 * this to answer is "what am I eating today".
 *
 * TAPPING ONE OPENS THE DISH, and it is the SAME sheet Today uses — how it is
 * made, what goes in it, what may be eaten instead. One dish sheet, so the two
 * screens cannot describe the same plate differently.
 */

const PART_ORDER = ['Morning', 'Afternoon', 'Evening'] as const;

export function NutritionDay({ iso }: { iso: string }) {
  const c = useTheme();
  const q = useToday(iso);
  const [dish, setDish] = useState<Meal | null>(null);

  const day = q.data;
  const meals = day && 'meals' in day ? (day.meals as Meal[]) : [];
  const head = day && 'plate' in day ? (day.plate as { title: string; kcal: number; protein: number } | null) : null;

  return (
    <View style={{ gap: spacing.s3 }}>
      {/* the targets line — the same sentence the console prints above this plate */}
      {head ? (
        <Text style={[styles.head, { color: c.ink2, fontFamily: numFamily(500) }]}>
          {head.title.toUpperCase()} · {head.kcal} KCAL · {head.protein} G PROTEIN A DAY
        </Text>
      ) : null}

      {q.isLoading ? <Text style={[styles.note, { color: c.ink3 }]}>Loading the day’s plate…</Text> : null}

      {PART_ORDER.map((part) => {
        const rows = meals.filter((m) => m.part === part);
        if (!rows.length) return null;
        return (
          <View key={part} style={{ gap: spacing.s2 }}>
            <Text style={[styles.part, { color: c.ink3 }]}>{part.toUpperCase()}</Text>
            {rows.map((m, i) => {
              const img = imageUrl(m.image);
              /* "Logged" once a plate has been photographed; otherwise the row is
                 an invitation rather than a record */
              const logged = !!m.id;
              return (
                <Pressable
                  key={`${m.slot}-${i}`}
                  onPress={() => setDish(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.dish || m.slot}, ${m.kcal ?? '?'} calories`}
                  style={[styles.row, { backgroundColor: c.surface }]}
                >
                  {img ? (
                    <Image source={{ uri: img }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: c.surface3 }]} />
                  )}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.dish, { color: c.ink }]} numberOfLines={2}>
                      {m.dish || m.slot}
                    </Text>
                    <Text style={[styles.meta, { color: c.ink2 }]} numberOfLines={1}>
                      {[m.time, m.slot, m.kcal != null ? `${m.kcal} kcal` : null,
                        m.protein != null ? `${m.protein} g protein` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>

                  <Text style={[styles.pill, { color: logged ? c.brand : c.ink3 }]}>
                    {logged ? 'Logged' : 'Photo'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {!q.isLoading && !meals.length ? (
        <Text style={[styles.note, { color: c.ink3 }]}>No plate set for this day yet.</Text>
      ) : null}

      <Text style={[styles.note, { color: c.ink3 }]}>Tap a dish for how it’s made and what goes in it.</Text>

      {/* the SAME dish sheet Today opens — three pages, one description of a plate */}
      <DishSheet meal={dish} onClose={() => setDish(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { fontSize: t.micro, letterSpacing: 0.4, lineHeight: t.micro * 1.5 },
  part: { fontSize: t.micro, fontWeight: '700', letterSpacing: 1, marginTop: spacing.s2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.md,
  },
  thumb: { width: 46, height: 46, borderRadius: radius.sm },
  dish: { fontSize: t.sm, fontWeight: '700', lineHeight: t.sm * 1.3 },
  meta: { fontSize: t.micro, marginTop: 2 },
  pill: { fontSize: t.micro, fontWeight: '600' },
  note: { fontSize: t.micro, marginTop: spacing.s2 },
});
