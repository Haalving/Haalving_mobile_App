import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { spacing, type as t, leading, useTheme } from '@/theme/tokens';

/**
 * A PILLAR, AS A DRAWER — `.tg` (app.css:1806) and the groups built in
 * client-today.js:757.
 *
 * Closed, it is ONE LINE you can act on. Open, it is the whole prescription. The
 * demo's reason for the shape is worth keeping in view: Today opens short, and the
 * next thing that actually needs doing is the drawer that starts open.
 *
 * THE SUMMARY LINE DISAPPEARS WHEN OPEN (`.tg[open] .tsum{display:none}`). It is a
 * stand-in for the contents, so leaving it above them says the same thing twice.
 *
 * The chevron rotates 90 degrees rather than swapping for a caret — one mark, one
 * state, which is why it can animate at all.
 */

export const PILLARS = {
  fitness: { key: 'fitness', name: 'Fitness', art: require('../../../assets/pillars/fitness.webp') },
  culture: { key: 'culture', name: 'Nutrition', art: require('../../../assets/pillars/culture.webp') },
  yoga: { key: 'yoga', name: 'Yoga', art: require('../../../assets/pillars/yoga.webp') },
  wellness: { key: 'wellness', name: 'Mind Wellness', art: require('../../../assets/pillars/wellness.webp') },
} as const;

export type PillarKey = keyof typeof PILLARS;

/**
 * The order Today lists them in, and it is not alphabetical or by importance.
 * Nutrition leads because the plate is the decision a client faces first and most
 * often — three times before the evening session comes round.
 */
export const PILLAR_ORDER: PillarKey[] = ['culture', 'fitness', 'yoga', 'wellness'];

/**
 * The pillar's specimen plate: matte-clay artwork, one colourway per pillar, keyed
 * to alpha so it sits on any ground. 44px, or 36 for `sm` (app.css:2311).
 */
export function PillarPlate({ pillar, size = 44 }: { pillar: PillarKey; size?: number }) {
  return (
    <Image
      source={PILLARS[pillar].art}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={0}
      accessible={false}
    />
  );
}

export function PillarGroup({
  pillar,
  summary,
  level,
  first = false,
  defaultOpen = false,
  children,
}: {
  pillar: PillarKey;
  /** the one line the closed drawer shows */
  summary: string;
  /** "L2", or "Obs" through the observation window */
  level: string;
  /** the first drawer carries no top rule — the rule SEPARATES, it does not frame */
  first?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={first ? undefined : { borderTopWidth: 1, borderTopColor: c.lineSoft }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${PILLARS[pillar].name}. ${summary}`}
        onPress={() => setOpen((v) => !v)}
        style={styles.summary}
      >
        <PillarPlate pillar={pillar} />
        <View style={styles.name}>
          <Text style={[styles.title, { color: c.ink }]}>{PILLARS[pillar].name}</Text>
          {open ? null : (
            <Text numberOfLines={1} style={[styles.sum, { color: c.ink2 }]}>
              {summary}
            </Text>
          )}
        </View>
        <Text style={[styles.lvl, { color: c.ink3 }]}>{level}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevR" size={16} color={c.ink3} strokeWidth={2} />
        </View>
      </Pressable>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

/**
 * A session inside a drawer — `.tg-item`. Bold noun, its time and coach beneath,
 * and an action parked at the right.
 */
export function PillarItem({
  label,
  detail,
  action,
}: {
  label: string;
  detail?: string;
  action?: ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={styles.item}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.itemLabel, { color: c.ink }]}>{label}</Text>
        {detail ? <Text style={[styles.itemDetail, { color: c.ink2 }]}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/** The banded part header inside a drawer — `.tg-part`. Band, rail, then the noun. */
export function PillarBand({ icon, label }: { icon: string; label: string }) {
  const c = useTheme();
  return (
    <View style={styles.band}>
      <Icon name={icon} size={13} color={c.brand} strokeWidth={1.6} />
      <Text style={[styles.bandLabel, { color: c.ink2 }]}>{label}</Text>
    </View>
  );
}

/** Nothing on the plan here today — said as a sentence, never as a blank. */
export function PillarEmpty({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.empty, { color: c.ink3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 44,
  },
  name: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: t.sm, fontWeight: '600' },
  sum: { fontSize: t.xs },
  lvl: { fontSize: t.micro, letterSpacing: t.micro * 0.04, textTransform: 'uppercase' },
  body: { gap: spacing.s2, paddingBottom: spacing.s3 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingLeft: spacing.s4,
  },
  itemLabel: { fontSize: t.body, fontWeight: '600' },
  itemDetail: { fontSize: t.xs, lineHeight: leading.xs },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: spacing.s3,
  },
  bandLabel: {
    fontSize: t.micro,
    fontWeight: '600',
    letterSpacing: t.micro * 0.08,
    textTransform: 'uppercase',
  },
  empty: { fontSize: t.xs, lineHeight: leading.xs, paddingLeft: spacing.s4 },
});
