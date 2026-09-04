import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiUrl } from '@/api/client';
import type { Meal } from '@/api/client-app';
import { Icon } from '@/components/ui/Icon';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * ONE MEAL, OPENED.
 *
 * The plate row says what to eat and what it comes to; this answers the three
 * questions behind it, in the demo's own order — how it is made, what goes in
 * it, and what may be eaten instead. A row that could not be opened was the
 * whole gap: a client could read "Idli ×2 + Coconut chutney · 225 kcal" and had
 * no way to find out how to make it or what to have if the idli batter had run
 * out.
 *
 * PAGED, NOT SCROLLED. Three short answers read better one at a time than as one
 * long column, and the pager is what the demo uses. The page count is honest:
 * only the pages that have something to say are built, so a dish with no
 * alternatives shows two pages rather than an empty third.
 *
 * EVERY WORD IS THE CATALOGUE'S. The method, the portions and the readings come
 * from the items the plan prescribes, so this sheet cannot describe a dish that
 * is not on the plate.
 */

/** The catalogue stores `img/dishes/x.webp`; the API serves it from its own root. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const origin = apiUrl().replace(/\/api\/v1\/?$/, '');
  return `${origin}/${String(path).replace(/^\/+/, '')}`;
}

type Page = { h: string; body: 'how' | 'what' | 'instead' };

export function DishSheet({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);

  if (!meal) return null;
  const d = meal.detail;

  /* only the pages with something on them — a pager that lands on an empty page
     is worse than a shorter pager */
  const pages: Page[] = [
    ...(d?.how?.length || d?.video ? [{ h: 'How it’s made', body: 'how' as const }] : []),
    ...(d?.items?.length ? [{ h: 'What goes in it', body: 'what' as const }] : []),
    ...(d?.alternatives?.length ? [{ h: 'Or instead', body: 'instead' as const }] : []),
  ];
  const page = pages[Math.min(i, Math.max(0, pages.length - 1))];
  const img = imageUrl(meal.image);

  const sub = [meal.time, meal.slot, meal.kcal != null ? `${meal.kcal} kcal` : null,
    meal.protein != null ? `${meal.protein} g protein` : null].filter(Boolean).join(' · ');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <View style={[styles.sheet, { backgroundColor: c.surface2, paddingBottom: insets.bottom + spacing.s4 }]}>
          <Pressable style={styles.x} onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="x" size={20} color={c.ink3} />
          </Pressable>

          <ScrollView contentContainerStyle={{ padding: spacing.s5, paddingTop: spacing.s7 }}>
            {img ? (
              <Image source={{ uri: img }} style={styles.hero} resizeMode="cover" />
            ) : null}

            <Text style={[styles.title, { color: c.ink }]}>{meal.dish || meal.slot}</Text>
            {sub ? <Text style={[styles.sub, { color: c.ink3 }]}>{sub}</Text> : null}

            {!page ? (
              <Text style={[styles.body, { color: c.ink2 }]}>
                Nothing more is written about this one yet.
              </Text>
            ) : (
              <>
                <Text style={[styles.k, { color: c.ink3 }]}>{page.h}</Text>

                {page.body === 'how' ? (
                  d?.how?.length ? (
                    d.how.map((step, n) => (
                      <Text key={n} style={[styles.body, { color: c.ink }]}>
                        {step}
                      </Text>
                    ))
                  ) : (
                    <Text style={[styles.body, { color: c.ink2 }]}>
                      No method is written for this one.
                    </Text>
                  )
                ) : null}

                {page.body === 'what'
                  ? (d?.items ?? []).map((it) => (
                      <View key={it.id} style={styles.row}>
                        <Text style={[styles.dot, { color: c.brand }]}>•</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.itemName, { color: c.ink }]}>
                            {it.name}
                            {it.portion ? <Text style={{ color: c.ink3 }}>{`  ${it.portion}`}</Text> : null}
                          </Text>
                          {it.kcal != null || it.protein != null ? (
                            <Text style={[styles.itemSub, { color: c.ink3 }]}>
                              {[it.kcal != null ? `${it.kcal} kcal` : null,
                                it.protein != null ? `${it.protein} g protein` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))
                  : null}

                {page.body === 'instead' ? (
                  <>
                    {(d?.alternatives ?? []).map((a, n) => (
                      <View key={n} style={styles.row}>
                        <Text style={[styles.dot, { color: c.brand }]}>•</Text>
                        <Text style={[styles.body, { color: c.ink, flex: 1 }]}>{a}</Text>
                      </View>
                    ))}
                    <Text style={[styles.note, { color: c.ink3 }]}>
                      Any one of these replaces the plate above — they are alternatives,
                      not extras.
                    </Text>
                  </>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={[styles.foot, { borderTopColor: c.line }]}>
            <Pressable
              onPress={() => setI((n) => Math.max(0, n - 1))}
              disabled={i <= 0}
              style={[styles.round, { backgroundColor: c.surface3, opacity: i <= 0 ? 0.4 : 1 }]}
              accessibilityLabel="Previous"
            >
              <Icon name="chevL" size={18} color={c.ink} />
            </Pressable>

            <Text style={[styles.count, { color: c.ink3 }]}>
              {pages.length ? `${Math.min(i, pages.length - 1) + 1}/${pages.length}` : '—'}
            </Text>

            <Pressable
              onPress={() => setI((n) => Math.min(pages.length - 1, n + 1))}
              disabled={i >= pages.length - 1}
              style={[styles.round, { backgroundColor: c.surface3, opacity: i >= pages.length - 1 ? 0.4 : 1 }]}
              accessibilityLabel="Next"
            >
              <Icon name="chevR" size={18} color={c.ink} />
            </Pressable>

            <Pressable onPress={onClose} style={[styles.close, { backgroundColor: c.brandFill }]}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  x: { position: 'absolute', top: spacing.s3, right: spacing.s4, zIndex: 2, padding: 4 },
  hero: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.s4 },
  title: { fontSize: t.h3, fontWeight: '600', lineHeight: t.h3 * 1.3 },
  sub: { fontSize: t.micro, marginTop: 3 },
  k: { fontSize: t.micro, fontWeight: '700', letterSpacing: 1, marginTop: spacing.s5 },
  body: { fontSize: t.sm, lineHeight: t.sm * 1.6, marginTop: spacing.s3 },
  row: { flexDirection: 'row', gap: spacing.s2, marginTop: spacing.s3 },
  dot: { fontSize: t.sm, lineHeight: t.sm * 1.6 },
  itemName: { fontSize: t.sm, fontWeight: '600' },
  itemSub: { fontSize: t.micro, marginTop: 1 },
  note: { fontSize: t.micro, marginTop: spacing.s4, fontStyle: 'italic' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
  },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: t.micro, minWidth: 28, textAlign: 'center' },
  close: { flex: 1, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontWeight: '600', fontSize: t.sm },
});
