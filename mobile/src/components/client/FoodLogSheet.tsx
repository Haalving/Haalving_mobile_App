import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Meal } from '@/api/client-app';
import { imageUrl } from '@/components/client/DishSheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * TODAY'S FOOD LOG — how much of the day is behind you.
 *
 * The plate on Today answers "what am I eating"; this answers "how am I doing",
 * which is a different question and the one a client asks at four in the
 * afternoon. Two counts carry it: how many of the day's meals are logged, and how
 * many of those a person has actually rated.
 *
 * ONLY LOGGED PLATES ARE LISTED. A prescribed meal nobody photographed is part of
 * the target, not part of the log — counting it would let the tally flatter the
 * day. The target is the number of slots the plan prescribes, so "2 of 3" means
 * what it says.
 *
 * RATED, OR WAITING ON A NAMED PERSON. A plate with stars shows them; one without
 * says who it is with, because "pending" tells a client nothing they can act on
 * and a name tells them who to ask.
 */
/**
 * HOW THE DAY IS GOING, counted once.
 *
 * THE TARGET IS WHAT THE PLAN PRESCRIBES, not how many rows came back. A client
 * who photographs a second breakfast adds an unplanned row, and counting that row
 * into the target moved the goalposts — the day read "3 of 4" when the plan asked
 * for three meals and two of them were logged. An extra plate cannot make the day
 * look less finished than it is.
 *
 * EXTRAS ARE COUNTED SEPARATELY, because they are real food a dietitian wants to
 * see; they are just not part of "did I eat what I was asked to".
 *
 * Exported because the Today link prints the same fraction above the sheet that
 * opens it, and two surfaces doing this arithmetic separately is how they drift.
 */
export function foodLogCount(meals: Meal[]): {
  logged: number;
  target: number;
  extras: number;
  rated: number;
} {
  const planned = meals.filter((m) => m.planned);
  const eaten = meals.filter((m) => m.id);
  return {
    logged: planned.filter((m) => m.id).length,
    target: planned.length,
    extras: eaten.length - planned.filter((m) => m.id).length,
    rated: eaten.filter((m) => m.stars != null).length,
  };
}

export function FoodLogSheet({
  open,
  meals,
  dietitian,
  observation,
  onClose,
  onOpenMeal,
}: {
  open: boolean;
  /** the day's plate rows — prescribed and logged, exactly as Today has them */
  meals: Meal[];
  /** first name of the seat that rates these, for the waiting pill */
  dietitian: string | null;
  observation: boolean;
  onClose: () => void;
  onOpenMeal: (id: string) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  /* a row is LOGGED when it has a meal behind it; the rest are still prescriptions */
  const logged = meals.filter((m) => m.id);
  const n = foodLogCount(meals);

  /* what has actually been eaten, not what the day prescribes */
  const protein = logged.reduce((s, m) => s + (m.protein ?? 0), 0);
  const kcal = logged.reduce((s, m) => s + (m.kcal ?? 0), 0);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: c.surface2, paddingBottom: insets.bottom + spacing.s5 }]}>
          <ScrollView contentContainerStyle={{ padding: spacing.s5, gap: spacing.s3 }}>
            <Text style={[styles.h1, { color: c.ink }]}>Today’s food log</Text>
            <Text style={[styles.sub, { color: c.ink2 }]}>
              {n.logged} of {n.target} meals logged
              {n.extras ? ` · ${n.extras} extra` : ''}
              {observation
                ? ' · observation window — capture only'
                : ` · ${n.rated} human-confirmed`}
            </Text>

            {logged.length ? (
              logged.map((m, i) => {
                const img = imageUrl(m.image ?? m.photo);
                return (
                  <Pressable
                    key={`${m.id}-${i}`}
                    onPress={() => m.id && onOpenMeal(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.slot}, ${(m.dishes ?? []).join(', ')}`}
                    style={[styles.row, { backgroundColor: c.surface }]}
                  >
                    {img ? (
                      <Image source={{ uri: img }} style={styles.art} resizeMode="cover" />
                    ) : (
                      <View style={[styles.art, styles.artFallback, { backgroundColor: c.surface3 }]}>
                        <Icon name="bowl" size={20} color={c.ink3} />
                      </View>
                    )}

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.slot, { color: c.ink }]}>
                        {m.slot}
                        {/* the plan never asked for this one — without the word,
                            a second breakfast is indistinguishable from the first */}
                        {!m.planned ? (
                          <Text style={[styles.extra, { color: c.ink3 }]}>  ·  Extra</Text>
                        ) : null}
                      </Text>
                      <Text style={[styles.dishes, { color: c.ink2 }]} numberOfLines={2}>
                        {[(m.dishes ?? []).join(' · '), m.ago].filter(Boolean).join(' · ')}
                      </Text>
                    </View>

                    {m.stars != null ? (
                      <View style={styles.stars}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Icon
                            key={n}
                            name="star"
                            size={13}
                            color={n <= (m.stars as number) ? c.culture : c.lineStrong}
                            filled={n <= (m.stars as number)}
                          />
                        ))}
                      </View>
                    ) : (
                      /* a name, not the word "pending" — one of them can be acted on */
                      <Text style={[styles.pill, { color: observation ? c.ink3 : c.culture }]}>
                        {observation ? 'Capture-only' : dietitian ? `With ${dietitian}` : 'With your team'}
                      </Text>
                    )}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.empty}>
                <Icon name="bowl" size={30} color={c.ink3} />
                <Text style={[styles.sub, { color: c.ink3 }]}>Nothing logged yet today.</Text>
              </View>
            )}

            {logged.length ? (
              <Text style={[styles.tally, { color: c.ink2, fontFamily: numFamily(500) }]}>
                So far: {protein} g protein · {kcal} kcal
              </Text>
            ) : null}

            <Button label="Close" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '86%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  h1: { fontSize: t.h2, fontWeight: '700' },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.45 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.md,
  },
  art: { width: 46, height: 46, borderRadius: radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  slot: { fontSize: t.sm, fontWeight: '700' },
  extra: { fontSize: t.micro, fontWeight: '600' },
  dishes: { fontSize: t.micro, marginTop: 2, lineHeight: t.micro * 1.4 },
  stars: { flexDirection: 'row', gap: 2 },
  pill: { fontSize: t.micro, fontWeight: '600' },
  tally: { fontSize: t.micro, marginTop: spacing.s2 },
  empty: { alignItems: 'center', gap: spacing.s2, paddingVertical: spacing.s6 },
});
