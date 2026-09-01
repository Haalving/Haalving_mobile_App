import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * The client app's primitives — the same names the console uses, so a component
 * means the same thing in both apps.
 *
 * The design rules are the demo's, restated in React Native terms:
 *  - cards carry TONE and SHADOW, never a 1px border
 *  - every numeral is set in the serif data face (`Num`)
 *  - a pillar's colour appears only in that pillar's own mark
 *  - nothing below 12px
 */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          padding: spacing.s5,
          /* elevation marks the OUTERMOST surface only — a raised tile inside a
             raised card is the nested-card tell */
          shadowColor: '#141A17',
          shadowOpacity: c.dark ? 0.4 : 0.05,
          shadowRadius: c.dark ? 8 : 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Every numeral in the app speaks in the data face.
 *
 * WEIGHT PICKS A FAMILY, not a `fontWeight`. The three Newsreader cuts are
 * separate files under separate names, so asking for 500 means asking for
 * `Newsreader-Medium`; setting `fontWeight: '500'` on the Regular cut gets a
 * synthetic bold on Android and nothing at all on iOS.
 */
export function Num({
  children,
  size = t.body,
  weight = 400,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: 400 | 500 | 600;
  style?: object;
}) {
  const c = useTheme();
  return (
    <Text style={[{ fontFamily: numFamily(weight), fontSize: size, color: c.ink }, style]}>
      {children}
    </Text>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <Text style={{ fontSize: t.h1, fontWeight: '600', letterSpacing: -0.5, color: c.ink }}>{children}</Text>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontSize: t.sm, lineHeight: 22, color: c.ink2 }}>{children}</Text>;
}

/** Short, uppercase, tracked — a LEGEND, never a sentence. */
export function Kicker({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <Text
      style={{
        fontSize: t.micro,
        fontWeight: '600',
        letterSpacing: 1.9,
        textTransform: 'uppercase',
        color: c.brand,
      }}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'solid',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost' | 'glass';
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = useTheme();
  const solid = variant === 'solid';
  const glass = variant === 'glass';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        /* a disabled control changes COLOUR rather than fading: opacity over a
           filled button puts white text at ~1.7:1, so the label you most need to
           read is the least readable thing on screen */
        backgroundColor: disabled
          ? c.surface3
          : glass
            ? 'rgba(255,255,255,0.14)'
            : solid
              ? c.brandFill
              : 'transparent',
        borderRadius: radius.full,
        paddingVertical: spacing.s4,
        paddingHorizontal: spacing.s5,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: solid || glass ? (glass ? 1 : 0) : 1.5,
        borderColor: glass ? 'rgba(255,255,255,0.3)' : c.brand,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={solid || glass ? '#fff' : c.brand} />
      ) : (
        <Text
          style={{
            fontSize: t.sm,
            fontWeight: '600',
            color: disabled ? c.ink2 : solid || glass ? '#fff' : c.brand,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * An empty state that SPEAKS — a sentence a human would say, never just an icon.
 * The demo is strict about this, and it is why its blank screens do not read as
 * broken ones.
 */
export function Empty({
  icon = 'leaf',
  sentence,
  sub,
}: {
  icon?: IconName | string;
  sentence: string;
  sub?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.s3, paddingVertical: spacing.s9 }}>
      <Icon name={icon} size={40} color={c.ink3} strokeWidth={1.4} />
      <Text style={{ fontSize: t.body, color: c.ink2, textAlign: 'center' }}>{sentence}</Text>
      {sub ? (
        <Text style={{ fontSize: t.sm, color: c.ink3, textAlign: 'center', maxWidth: 320 }}>{sub}</Text>
      ) : null}
    </View>
  );
}

/**
 * A PILL — a state, said in one word (`app.css:700`).
 *
 * Five tones, and each one is a wash plus its own ink, never a saturated fill: a
 * status is a fact about a row, not a thing competing with the row for attention.
 */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'ok' | 'info' | 'warn' | 'bad' | 'neutral';
}) {
  const c = useTheme();
  const TONES = {
    ok: { bg: c.okWash, fg: c.ok },
    info: { bg: c.brandWash, fg: c.brand },
    warn: { bg: c.amberWash, fg: c.amber },
    bad: { bg: c.dangerWash, fg: c.danger },
    neutral: { bg: c.surface2, fg: c.ink2 },
  } as const;
  const tint = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: tint.bg }]}>
      <Text style={{ color: tint.fg, fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.01 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * A CHIP — a control, not a state (`app.css:709`).
 *
 * The border width is CONSTANT across states. The demo says why in its own
 * comment: a chip that thickens when selected shifts every chip after it.
 */
export function Chip({
  children,
  icon,
  tone = 'plain',
  onPress,
}: {
  children: ReactNode;
  icon?: IconName | string;
  tone?: 'plain' | 'live';
  onPress?: () => void;
}) {
  const c = useTheme();
  const live = tone === 'live';
  const fg = live ? c.brand : c.ink2;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: live ? c.brandWash : c.surface,
          borderColor: live ? 'transparent' : c.line,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: t.micro, fontWeight: live ? '600' : '400' }}>{children}</Text>
    </Pressable>
  );
}

/**
 * A SECTION TITLE (`app.css:456`).
 *
 * Its bottom margin is NEGATIVE — `calc(var(--s1) * -1)` — because it belongs to
 * what follows it. Reproduced literally: without it the title floats midway
 * between the block above and the block it names.
 */
export function SecTitle({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <Text
      style={{
        fontSize: t.micro,
        fontWeight: '600',
        letterSpacing: t.micro * 0.15,
        textTransform: 'uppercase',
        color: c.ink3,
        marginTop: spacing.s4,
        marginBottom: -spacing.s1,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * A NOTICE — a sentence the screen needs to say out loud (`app.css:1318`).
 *
 * The hairline is the tone at 22% over the ground, which CSS writes as a
 * `color-mix`. React Native has no such function, so the three are resolved to
 * rgba here; they are the brand, amber and danger inks at the demo's own alpha.
 */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn' | 'bad';
}) {
  const c = useTheme();
  const TONES = {
    info: { bg: c.brandWash, edge: 'rgba(45,176,166,0.22)' },
    warn: { bg: c.amberWash, edge: 'rgba(217,164,74,0.30)' },
    bad: { bg: c.dangerWash, edge: 'rgba(214,106,96,0.30)' },
  } as const;
  const tint = TONES[tone];
  return (
    <View
      style={{
        backgroundColor: tint.bg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: tint.edge,
        paddingVertical: spacing.s3,
        paddingHorizontal: spacing.s4,
      }}
    >
      <Text style={{ color: c.ink, fontSize: t.xs, lineHeight: t.xs * 1.55 }}>{children}</Text>
    </View>
  );
}

export const sheetStyles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.s5 },
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: 1.5,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
});
