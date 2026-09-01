import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type as t, leading } from '@/theme/tokens';

/**
 * THE PAGE MOMENT — one band of the arrival's morning per screen.
 *
 * `HV.ui.sceneBand` (core.js:2556) and `.scene.band` (app.css:537, 605, 630). The
 * rooms visibly share the lobby's scene: it is the same photograph the login film
 * opens on, cropped to a strip and scrimmed top and bottom so white type reads
 * over it.
 *
 * NEVER TWO ON ONE PAGE. The demo's own comment says so, and it is a rule about
 * meaning rather than layout: the band announces where you have arrived, and a
 * screen that announces twice has not decided what it is.
 *
 * The scrim is TWO gradients, not one. Reading them off app.css:539:
 *   to bottom  rgba(10,14,12,.62) → .22 at 34% → 0 at 52%
 *   to top     rgba(10,14,12,.88) → .56 at 24% → 0 at 56%
 * The band's own colour (10,14,12) is a shade off `--bg` (13,18,17) on purpose:
 * it is the film's dark, not the app's surface.
 *
 * On the client shell the band is COMPACTED — `min-height:84px`, `padding:s4`,
 * and a 30px display line at 1.15 rather than the display token's 1.55 (app.css:
 * 605-607) — so the pillars arrive sooner. That override is folded in here
 * because this component only ever renders inside the client shell.
 */

const SCRIM_DOWN = ['rgba(10,14,12,0.62)', 'rgba(10,14,12,0.22)', 'rgba(10,14,12,0)'] as const;
const SCRIM_DOWN_AT = [0, 0.34, 0.52] as const;
const SCRIM_UP = ['rgba(10,14,12,0)', 'rgba(10,14,12,0.56)', 'rgba(10,14,12,0.88)'] as const;
const SCRIM_UP_AT = [0.44, 0.76, 1] as const;

export function SceneBand({
  kicker,
  title,
  sub,
  /** the right-hand seat. Today parks the film's play mark here; nothing else uses it. */
  seat,
}: {
  kicker: string;
  title: string;
  sub?: string;
  seat?: ReactNode;
}) {
  return (
    <View style={styles.band}>
      <Image
        source={require('../../../assets/welcome.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        accessible={false}
      />
      <LinearGradient
        colors={SCRIM_DOWN as unknown as [string, string, string]}
        locations={SCRIM_DOWN_AT as unknown as [number, number, number]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={SCRIM_UP as unknown as [string, string, string]}
        locations={SCRIM_UP_AT as unknown as [number, number, number]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.fg, seat ? styles.fgWithSeat : null]}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.display}>{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>

      {seat ? <View style={styles.seat}>{seat}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
    marginBottom: spacing.s3,
  },
  fg: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    padding: spacing.s4,
  },
  /* the seat is 60px of reserved room at the right, so a long greeting wraps
     around the play mark instead of running under it (app.css:3617) */
  fgWithSeat: { paddingRight: 60 },
  kicker: {
    fontSize: t.micro,
    fontWeight: '600',
    letterSpacing: t.micro * 0.14,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },
  display: {
    fontSize: 30,
    lineHeight: 30 * 1.15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  sub: {
    fontSize: t.sm,
    lineHeight: leading.sm,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },
  seat: {
    position: 'absolute',
    right: spacing.s4,
    top: '50%',
    transform: [{ translateY: -20 }],
  },
});
