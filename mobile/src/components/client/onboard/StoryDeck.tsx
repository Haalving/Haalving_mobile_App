import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { IndexGlyph } from '@/components/client/onboard/IndexGlyph';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE STORY DECK — a stacked deck, peeled like dealt cards (`client-onboard.js`
 * wireStory, `app.css:2910`).
 *
 * The earlier card always sits nearer the eye, so advancing PEELS the top card
 * off to the left and the next is simply unmasked — it was already in place
 * beneath, and only rises from 95.5% to full size. At rest the next two cards
 * fan +16px steps to the right (nested lower by their own shrink) and the
 * dealt-away card keeps an 8px sliver at the left screen edge. Geometry measured
 * from the JioHotstar hero deck: FAN 16, SCALE .955, SLIVER 8, ≤200ms ease-out
 * with no overshoot. Commit past 30% of the card or on a flick.
 *
 * A card reached by ANY route advances the gate (`onReach`) — the dots walk the
 * deck too, because a deck is not touch-only.
 */
export interface StoryCard {
  img?: ImageSource;
  /** the pillar the slide introduces — its kicker wears that pillar's colour */
  pillar?: 'culture' | 'fitness' | 'yoga' | 'wellness';
  /** the closing slide is the Index itself */
  fin?: boolean;
  k: string;
  h: string;
  s: string;
}

const FAN = 16;
const SCALE = 0.955;
const SLIVER = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function StoryDeck({
  cards,
  width,
  height,
  initial = 0,
  onReach,
}: {
  cards: StoryCard[];
  /** the deck's own width — it bleeds to the screen edges */
  width: number;
  height: number;
  initial?: number;
  onReach: (i: number) => void;
}) {
  const c = useTheme();
  const N = cards.length;
  /* `.obslide{left:16px; width:calc(100% - 62px)}` */
  const W = width - 62;
  const [cur, setCur] = useState(clamp(initial, 0, N - 1));
  const curRef = useRef(cur);

  const xs = useRef(cards.map(() => new Animated.Value(0))).current;
  const scs = useRef(cards.map(() => new Animated.Value(1))).current;

  const slotPos = (s: number) => {
    if (s <= -1) return { x: -(SLIVER + (W / 2) * (1 + SCALE)), sc: SCALE };
    const d = Math.min(s, 2);
    const sc = Math.pow(SCALE, d);
    /* centred scale pulls the right edge in — the translate restores it, then
       adds the fan step, so edges land +16px apart like the original */
    return { x: (W / 2) * (1 - sc) + FAN * d, sc };
  };
  const lerp = (a: { x: number; sc: number }, b: { x: number; sc: number }, p: number) => ({
    x: a.x + (b.x - a.x) * p,
    sc: a.sc + (b.sc - a.sc) * p,
  });
  const put = (i: number, p: { x: number; sc: number }) => {
    xs[i]!.setValue(p.x);
    scs[i]!.setValue(p.sc);
  };

  const layout = (at: number, animate: boolean) => {
    const anims: Animated.CompositeAnimation[] = [];
    cards.forEach((_, i) => {
      const p = slotPos(i - at);
      if (animate) {
        anims.push(Animated.timing(xs[i]!, { toValue: p.x, duration: 190, useNativeDriver: true }));
        anims.push(Animated.timing(scs[i]!, { toValue: p.sc, duration: 190, useNativeDriver: true }));
      } else put(i, p);
    });
    if (anims.length) Animated.parallel(anims).start();
  };

  useEffect(() => {
    layout(curRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W]);

  const go = (i: number) => {
    const next = clamp(i, 0, N - 1);
    curRef.current = next;
    setCur(next);
    onReach(next);
    layout(next, true);
  };

  /* the live drag. dx < 0 peels the front card away 1:1 under the finger while
     the cards beneath ease one slot forward; dx > 0 drags the previous card
     back on top 1:1 while the deck recedes one slot. */
  const render = (dxIn: number) => {
    const at = curRef.current;
    let dx = dxIn;
    if ((dx < 0 && at >= N - 1) || (dx > 0 && at <= 0)) dx *= 0.25; /* the ends push back */
    if (dx <= 0) {
      const p = W ? Math.min(1, -dx / W) : 0;
      cards.forEach((_, i) => {
        const slot = i - at;
        if (slot < 0) put(i, slotPos(slot));
        else if (slot === 0) put(i, { x: dx, sc: 1 });
        else put(i, lerp(slotPos(slot), slotPos(slot - 1), at < N - 1 ? p : 0));
      });
    } else if (at === 0) {
      cards.forEach((_, i) => {
        if (i === 0) put(i, { x: dx, sc: 1 });
        else put(i, slotPos(i));
      });
    } else {
      const away = slotPos(-1);
      const p2 = Math.min(1, dx / -away.x);
      cards.forEach((_, i) => {
        const slot = i - at;
        if (slot === -1) put(i, { x: Math.min(0, away.x + dx), sc: SCALE + (1 - SCALE) * p2 });
        else if (slot < -1) put(i, slotPos(slot));
        else put(i, lerp(slotPos(slot), slotPos(slot + 1), p2));
      });
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => render(g.dx),
        onPanResponderRelease: (_e, g) => {
          const at = curRef.current;
          const dx = g.dx;
          const vx = g.vx;
          /* commit past 30% of the card, or on a flick in the same direction */
          const commit = Math.abs(dx) > W * 0.3 || (Math.abs(vx) > 0.55 && vx < 0 === dx < 0);
          if (commit && dx < 0 && at < N - 1) go(at + 1);
          else if (commit && dx > 0 && at > 0) go(at - 1);
          else layout(at, true);
        },
        onPanResponderTerminate: () => layout(curRef.current, true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [W, N],
  );

  const pillarColor = { culture: c.cultureDeep, fitness: c.fitnessDeep, yoga: c.yogaDeep, wellness: c.wellnessDeep };

  return (
    <View style={{ width, gap: spacing.s4 }}>
      <View style={{ height, overflow: 'hidden' }} {...pan.panHandlers} accessibilityRole="none">
        {/* the earlier card always sits nearer the eye — later cards paint first */}
        {cards
          .map((card, i) => (
            <Animated.View
              key={i}
              style={[
                styles.slide,
                { width: W, backgroundColor: c.surface, transform: [{ translateX: xs[i]! }, { scale: scs[i]! }] },
              ]}
              accessibilityElementsHidden={i !== cur}
            >
              {card.fin ? (
                <View style={styles.fin}>
                  <View style={{ alignSelf: 'center', width: '72%' }}>
                    <IndexGlyph vals={{ fitness: 80, culture: 88, yoga: 67, wellness: 100 }} width={W * 0.72} />
                  </View>
                  <View style={styles.txtFin}>
                    <Text style={[styles.k2, { color: c.brand2 }]}>{card.k.toUpperCase()}</Text>
                    <Text style={styles.h}>{card.h}</Text>
                    <Text style={styles.s}>{card.s}</Text>
                  </View>
                </View>
              ) : (
                <>
                  {card.img ? (
                    <Image source={card.img} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="memory-disk" />
                  ) : null}
                  {/* clear glass down to the waist, then only as much ink as the caption needs */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(13,18,17,0)', 'rgba(13,18,17,0.34)', 'rgba(13,18,17,0.88)']}
                    locations={[0.46, 0.68, 0.96]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.txt}>
                    <Text style={[styles.k2, { color: card.pillar ? pillarColor[card.pillar] : c.brand2 }]}>{card.k.toUpperCase()}</Text>
                    <Text style={styles.h}>{card.h}</Text>
                    <Text style={styles.s}>{card.s}</Text>
                  </View>
                </>
              )}
            </Animated.View>
          ))
          .reverse()}
      </View>

      {/* the dots are real slide controls — the visible mark is the bar */}
      <View style={styles.dots}>
        {cards.map((_, i) => (
          <Pressable key={i} onPress={() => go(i)} style={styles.dot} accessibilityRole="button" accessibilityLabel={`Go to slide ${i + 1} of ${N}`}>
            <View style={[styles.bar, { backgroundColor: i === cur ? c.brand : c.surface3 }]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  txt: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.s4, gap: spacing.s2 },
  fin: { flex: 1, justifyContent: 'space-between', paddingTop: spacing.s6 },
  txtFin: { padding: spacing.s4, gap: spacing.s2 },
  k2: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.15, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } },
  h: { fontSize: t.h2, fontWeight: '600', letterSpacing: -0.4, lineHeight: t.h2 * 1.15, color: '#fff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } },
  s: { fontSize: t.xs, lineHeight: t.xs * 1.5, color: 'rgba(233,238,233,0.88)', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } },
  dots: { flexDirection: 'row', gap: spacing.s1, justifyContent: 'center' },
  dot: { minWidth: 20, minHeight: 44, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 14, height: 3, borderRadius: radius.full },
});
