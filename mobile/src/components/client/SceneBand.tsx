import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type as t, leading } from '@/theme/tokens';

/**
 * THE PAGE MOMENT — one band of the arrival's morning per screen.
 *
 * `HV.ui.sceneBand` (core.js:2556) and `.scene.band` (app.css:537, 605, 630).
 *
 * TRANSPARENT ON THE CLIENT SHELL. The scene band CARRIES its own photograph and
 * scrim everywhere else in the demo — but not here. Inside the client shell the
 * band's own ground is switched OFF and it floats on the single fixed photograph
 * `ClientGround` already paints behind the whole app (app.css:672-674):
 *
 *   body:has(.shell-client) .scene.band{background:transparent}
 *   body:has(.shell-client) .scene.band > .bg,
 *   body:has(.shell-client) .scene.band > .scrim-y{display:none}
 *
 * So the band is JUST the text — kicker, greeting, sub — laid over the shared
 * scene, with an optional right-hand seat. An earlier version drew a second
 * `welcome.jpg` here with its own scrims, which put a bright, differently-cropped
 * photo card where the demo shows the dark shared ground continuing up behind the
 * words. This component only ever renders inside the client shell, so the override
 * is the whole story rather than a branch.
 *
 * On the client shell the band is also COMPACTED — `min-height:84px`, `padding:s4`,
 * and a 30px display line at 1.15 rather than the display token's 1.55 (app.css:
 * 605-607) — so the pillars arrive sooner.
 */

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
  /* transparent — the fixed ClientGround photograph is the band's ground */
  band: {
    position: 'relative',
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
  /* .scene.band > .seat — right s4, vertically centred; the 44px film mark
     centres at translateY(-22) (app.css:3615) */
  seat: {
    position: 'absolute',
    right: spacing.s4,
    top: '50%',
    transform: [{ translateY: -22 }],
  },
});
