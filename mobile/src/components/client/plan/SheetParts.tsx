import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlanMove, PlanProgress } from '@/api/client-app';
import { imageUrl } from '@/components/client/DishSheet';
import { Icon } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE PIECES EVERY PILLAR SHEET IS BUILT FROM — the demo's own `tg-*` grammar.
 *
 * One file, because Nutrition and the three session pillars draw the SAME rows:
 * a head line, a banded part, an illustrated row, and the two progress figures.
 * The demo builds all four sheets from one set of helpers (`client-plan.js`), and
 * splitting them here is how the sheets stay identical as they change.
 */

/** `.tg-head` — the plan's own sentence above the rows. */
export function TgHead({ children }: { children: string }) {
  const c = useTheme();
  return <Text style={[styles.head, { color: c.ink3, fontFamily: numFamily(500) }]}>{children}</Text>;
}

/** `.tg-part` — band, rail, then the noun. Morning / Afternoon / Evening. */
export function TgBand({ icon, label }: { icon: string; label: string }) {
  const c = useTheme();
  return (
    <View style={[styles.band, { backgroundColor: c.surface3 }]}>
      <Icon name={icon} size={13} color={c.brand} strokeWidth={1.6} />
      <Text style={[styles.bandText, { color: c.ink2 }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/**
 * `.tg-task` — the illustrated row, and the demo's measurements exactly.
 *
 * 64×64 of art with the image at 84% and CONTAINED, on no background: the demo's
 * CSS carries a note that a wash tile reads as "the image has a background" on
 * the dark theme, so the picture floats.
 *
 * A ROW WITH NO PICTURE DRAWS NO TILE. Reserving an empty square beside every
 * unillustrated move reads as a broken image, and an invented placeholder would
 * be worse — it shows something the catalogue never had.
 */
export function TgTask({
  title,
  sub,
  art,
  action,
  onPress,
}: {
  title: string;
  sub?: string | null;
  art?: string | null;
  action?: React.ReactNode;
  onPress?: () => void;
}) {
  const c = useTheme();
  const src = imageUrl(art);
  const body = (
    <View style={styles.task}>
      {src ? (
        <View style={styles.tcard}>
          <Image source={{ uri: src }} style={styles.tcardImg} contentFit="contain" />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.taskTitle, { color: c.ink }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.taskSub, { color: c.ink2 }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/**
 * ONE MOVE, WITH ITS OWN TICK.
 *
 * A session is several exercises and a client finishes them one at a time, so
 * the tick belongs on the move, not only on the session. Once done it stops
 * being a button: a control that re-submits what is already recorded invites a
 * second write that means nothing.
 */
export function MoveRow({
  move,
  canTick,
  pending,
  onOpen,
  onDone,
}: {
  move: PlanMove;
  canTick: boolean;
  pending: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const c = useTheme();
  return (
    <TgTask
      title={move.dish || move.slot}
      sub={move.detail?.items?.[0]?.portion || move.time || null}
      art={move.image}
      onPress={onOpen}
      action={
        move.done ? (
          <View style={styles.doneMark}>
            <Icon name="check" size={13} color={c.ok ?? c.brand} />
            <Text style={[styles.doneText, { color: c.ok ?? c.brand }]}>Done</Text>
          </View>
        ) : canTick ? (
          <Pressable
            onPress={onDone}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${move.dish || move.slot} done`}
            style={[styles.doBtn, { borderColor: c.brand, opacity: pending ? 0.5 : 1 }]}
          >
            <Text style={[styles.doText, { color: c.brand }]}>Done</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

/** "Your progress this cycle" — the two figures the demo prints under each sheet. */
export function ProgressTiles({ rows }: { rows: PlanProgress[] }) {
  const c = useTheme();
  if (!rows.length) return null;
  return (
    <>
      <Text style={[styles.cardTitle, { color: c.ink }]}>Your progress this cycle</Text>
      <View style={styles.tiles}>
        {rows.map((r) => (
          <View key={r.k} style={[styles.tile, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={[styles.tileK, { color: c.ink3 }]}>{r.k.toUpperCase()}</Text>
            <Text style={[styles.tileV, { color: c.ink, fontFamily: numFamily(600) }]}>{r.v}</Text>
            <Text style={[styles.tileSub, { color: c.ink3 }]}>{r.sub}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  head: { fontSize: t.micro, letterSpacing: 0.4, lineHeight: t.micro * 1.5 },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: 6,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.sm,
    marginTop: spacing.s2,
  },
  bandText: { fontSize: t.micro, fontWeight: '700', letterSpacing: 1 },

  /* `.tg-task{padding:var(--s1) 0}` — and no left padding: the picture marks the row */
  task: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingVertical: 4 },
  tcard: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  tcardImg: { width: '84%', height: '84%' },
  taskTitle: { fontSize: t.h3, fontWeight: '600', lineHeight: t.h3 * 1.3, letterSpacing: -0.16 },
  taskSub: { fontSize: t.xs, marginTop: 2, lineHeight: t.xs * 1.4 },

  doBtn: { borderWidth: 1, borderRadius: radius.full, paddingVertical: 5, paddingHorizontal: spacing.s3 },
  doText: { fontSize: t.micro, fontWeight: '700' },
  doneMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: t.micro, fontWeight: '700' },

  cardTitle: { fontSize: t.sm, fontWeight: '700', marginTop: spacing.s3 },
  tiles: { flexDirection: 'row', gap: spacing.s3 },
  tile: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.s3, gap: 2 },
  tileK: { fontSize: t.micro, fontWeight: '600', letterSpacing: 0.6 },
  tileV: { fontSize: 20, fontWeight: '600' },
  tileSub: { fontSize: t.micro },
});
