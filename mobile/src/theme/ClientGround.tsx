import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * THE GROUND EVERY CLIENT SCREEN SITS ON.
 *
 * The client app's background is not a colour. `--bg` (#0D1211) is never painted:
 * app.css:664–669 makes the body transparent and puts a photograph behind it —
 *
 *   body:has(.shell-client){background:transparent}
 *   body:has(.shell-client)::before{content:""; position:fixed; inset:0; z-index:-2;
 *     background:url("../media/welcome.jpg") center 25% / cover no-repeat}
 *   body:has(.shell-client)::after{content:""; position:fixed; inset:0; z-index:-1;
 *     background:linear-gradient(to bottom,
 *       rgba(13,18,17,.80), rgba(13,18,17,.93) 34%, rgba(13,18,17,.985) 64%)}
 *
 * — the same morning onboarding wears, dimmed further so cards and instruments
 * stay legible (app.css:659–663).
 *
 * FIXED, NOT SCROLLING. `position:fixed` means the photograph is anchored to the
 * viewport and content moves over it. Putting it inside a ScrollView would make it
 * travel with the content, which reads as a completely different screen.
 *
 * ONE COMPONENT, EVERY SCREEN. If each screen painted its own ground they would
 * drift, and every pixel comparison would then differ everywhere at once rather
 * than on the thing that actually changed.
 *
 * The three gradient stops are the demo's, in the demo's order. `rgba(13,18,17,…)`
 * is `--bg` at three opacities — the colour is the same, only the veil thickens.
 */

/**
 * `center 25%` — the crop the demo picks, not the middle of the frame.
 *
 * Percentages here mean what they mean in CSS `background-position`: the 25%
 * line of the IMAGE is laid on the 25% line of the SCREEN, so on a tall phone the
 * horizon stays high and the jetty stays in view. A plain centre crop drops the
 * sky and puts the water behind the cards instead.
 */
const FOCUS = { left: '50%', top: '25%' } as const;

const STOPS = ['rgba(13,18,17,0.80)', 'rgba(13,18,17,0.93)', 'rgba(13,18,17,0.985)'] as const;

/** 0 / 34% / 64%, exactly as the CSS declares them. */
const LOCATIONS = [0, 0.34, 0.64] as const;

export function ClientGround({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.root}>
      <Image
        source={require('../../assets/welcome.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={FOCUS}
        /* the ground never animates in — a fade would show a bare colour first */
        transition={0}
        cachePolicy="memory-disk"
        pointerEvents="none"
        accessible={false}
        testID="client-ground-photo"
      />
      <LinearGradient
        colors={STOPS as unknown as [string, string, string]}
        locations={LOCATIONS as unknown as [number, number, number]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        testID="client-ground-scrim"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * No backgroundColor. The photograph IS the ground, and a colour behind it would
   * only show through if the image failed — in which case a bare #0D1211 is the
   * honest thing to see rather than a half-lit approximation of the scene.
   */
  root: { flex: 1 },
});
