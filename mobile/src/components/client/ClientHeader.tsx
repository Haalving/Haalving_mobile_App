import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE CLIENT HEADER — four seats, ported from `clientShell` (core.js:1607).
 *
 *   wordmark      HAALVING, letterspaced
 *   membership    the Poorna marque, or "Get a Coach" for everyone else
 *   coins         the gold coin and the balance
 *   avatar        the profile door, because Profile is not a daily destination
 *
 * ONE SEAT, TWO DOORS. The demo puts the membership marque and the coach shop in
 * the same place on purpose: a Poorna client already HAS every coach, so offering
 * to sell them one is nonsense — the marque opens their circle instead. The plan
 * decides which door, and that is the only branch here.
 *
 * The gold is NOT a token. `#E3C88C`, `#C9A86A` and the two washes below appear
 * nowhere in the palette; they are written as literals in app.css:348 and 582
 * because the membership livery is its own thing, deliberately outside the
 * product's greens. Pulling them into the palette would put gold within reach of
 * every screen, which is exactly what the demo avoids.
 */

const GOLD = {
  /** the marque's ink */
  ink: '#E3C88C',
  /** the coin's ink */
  coin: '#C9A86A',
  /** the marque's hairline: rgba(201,168,106,.5) */
  edge: 'rgba(201,168,106,0.5)',
  /** the coin chip's ground: rgba(201,168,106,.12) */
  wash: 'rgba(201,168,106,0.12)',
  /** the marque's ground — a 150deg gradient in the demo, flattened to its
      darker stop: React Native has no CSS gradient, and the lighter stop only
      shows across ~30px of a pill that is mostly its edge and its label. */
  ground: '#12110E',
} as const;

/**
 * The coin. Double-rimmed with a stroked H — HAALVING's gold voice, and the only
 * mark in the app drawn from two concentric circles.
 */
function Coin({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.4} fill="none" />
      <Circle cx="12" cy="12" r="6.4" stroke={color} strokeWidth={1.4} fill="none" />
      <Path
        d="M9.7 8.8v6.4M14.3 8.8v6.4M9.7 12h4.6"
        stroke={color}
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The avatar: initials on a hue derived from the name.
 *
 * The hue walk and the 32%/34% are the demo's (core.js:2529), including its
 * reason — white initials on a generated hue only clear 4.5:1 at or below ~36%
 * lightness, and yellow-greens are the worst case.
 *
 * `quad` is the HAALVING quadrilateral: a square halved, two corners open and two
 * held (app.css:580).
 */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hue = 0;
  for (const ch of String(name)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `hsl(${hue}, 32%, 34%)`,
        borderTopLeftRadius: size * 0.38,
        borderTopRightRadius: size * 0.15,
        borderBottomRightRadius: size * 0.38,
        borderBottomLeftRadius: size * 0.15,
      }}
    >
      <Text style={{ color: '#fff', fontSize: t.micro, fontWeight: '600' }}>{initials}</Text>
    </View>
  );
}

export function ClientHeader({
  name,
  plan,
  coins = 0,
}: {
  name: string;
  plan: string;
  coins?: number;
}) {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const poorna = plan?.toLowerCase() === 'poorna';

  return (
    <View
      style={[
        styles.head,
        {
          paddingTop: insets.top + spacing.s3,
          /* the demo's header is a blurred pane over the photograph
             (color-mix(in srgb, var(--bg) 82%, transparent)). Reproduced as the
             flat 82% wash: a BlurView here would blur the ground behind the whole
             app rather than the band, which is a different picture. */
          backgroundColor: 'rgba(13,18,17,0.82)',
        },
      ]}
    >
      <Text style={[styles.wordmark, { color: c.ink }]}>HAALVING</Text>

      {poorna ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Poorna membership — your coaches"
          style={styles.marque}
        >
          <Icon name="sparkle" size={13} color={GOLD.ink} strokeWidth={1.6} />
          <Text style={styles.marqueLabel}>POORNA</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/coach')}
          style={[styles.coachDoor, { borderColor: c.brand }]}
        >
          <Text style={[styles.coachLabel, { color: c.brand }]}>Get a Coach</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`HAALVING coins — ${coins}`}
        style={styles.coins}
      >
        <Coin color={GOLD.coin} />
        <Text style={styles.coinCount}>{coins.toLocaleString('en-IN')}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        onPress={() => router.push('/profile')}
      >
        <Avatar name={name} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s3,
  },
  wordmark: {
    fontSize: t.xs,
    fontWeight: '600',
    letterSpacing: t.xs * 0.26,
    /* `margin-left:auto` on the NEXT seat is what parks the rest at the right */
    flexGrow: 1,
  },
  marque: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: GOLD.edge,
    backgroundColor: GOLD.ground,
  },
  marqueLabel: {
    color: GOLD.ink,
    fontSize: t.micro,
    fontWeight: '600',
    letterSpacing: t.micro * 0.14,
  },
  coachDoor: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  coachLabel: { fontSize: t.micro, fontWeight: '600' },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: GOLD.wash,
  },
  /* the balance is a numeral, so it is set in the data face like every other */
  coinCount: {
    color: GOLD.coin,
    fontSize: t.micro,
    fontFamily: numFamily(600),
  },
});
