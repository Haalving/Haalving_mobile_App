import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';
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

/** Every numeral in the app speaks in the data face. */
export function Num({ children, size = t.body, style }: { children: ReactNode; size?: number; style?: object }) {
  const c = useTheme();
  return (
    <Text style={[{ fontFamily: 'Newsreader', fontSize: size, color: c.ink }, style]}>{children}</Text>
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

export const sheetStyles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.s5 },
});
