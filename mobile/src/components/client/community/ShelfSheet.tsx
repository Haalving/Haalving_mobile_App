import { StyleSheet, Text, View } from 'react-native';

import type { ShelfItem } from '@/api/client-app';
import { Icon } from '@/components/ui/Icon';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

import { CommunitySheet } from './Sheet';

/**
 * A REFERENCE SHELF — Our Partners, or E-Learning & Content.
 *
 * ONE COMPONENT FOR BOTH, because the rows are the same object: an icon, a name,
 * a line about it, and on the learning shelf a word for how you take it in
 * (Read / Film / Listen). Two components would drift the moment one got a
 * padding change.
 *
 * A ROW IS NOT A BUTTON UNLESS IT OPENS SOMETHING. Every item here is reference —
 * a place your coach can book, a piece that is not written yet — and dressing a
 * row as tappable when nothing happens is the bug the `+` icon had. `href` is
 * what makes one live, and until the team sets one the row is quietly a row.
 */
export function ShelfSheet({
  open,
  title,
  sub,
  footnote,
  items,
  loading,
  onClose,
}: {
  open: boolean;
  title: string;
  sub: string;
  footnote: string;
  items: ShelfItem[];
  loading: boolean;
  onClose: () => void;
}) {
  const c = useTheme();

  return (
    <CommunitySheet open={open} title={title} sub={sub} footnote={items.length ? footnote : undefined} onClose={onClose}>
      {loading ? <Text style={[styles.note, { color: c.ink3 }]}>Loading…</Text> : null}

      {items.map((it) => (
        <View key={it.id} style={[styles.row, { backgroundColor: c.surface2 }]}>
          <View style={[styles.icon, { backgroundColor: c.surface3 }]}>
            <Icon name={it.icon} size={17} color={c.brand} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: c.ink }]}>{it.name}</Text>
            {it.note ? <Text style={[styles.sub, { color: c.ink2 }]}>{it.note}</Text> : null}
          </View>

          {/* the learning shelf's own word — Read, Film, Listen. It says what the
              piece IS, so it sits as a label rather than as a button that lies. */}
          {it.kind ? (
            <Text style={[styles.kind, { color: c.brand }]} numberOfLines={1}>
              {it.kind}
            </Text>
          ) : null}
        </View>
      ))}

      {!loading && !items.length ? (
        <Text style={[styles.note, { color: c.ink3 }]}>Nothing on this shelf yet.</Text>
      ) : null}
    </CommunitySheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: t.sm, fontWeight: '700' },
  sub: { fontSize: t.micro, marginTop: 2, lineHeight: t.micro * 1.45 },
  kind: { fontSize: t.micro, fontWeight: '600' },
  note: { fontSize: t.sm, textAlign: 'center', paddingVertical: spacing.s6 },
});
