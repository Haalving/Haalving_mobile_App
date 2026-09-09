import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { numFamily } from '@/theme/fonts';
import { radius, type as t, useTheme } from '@/theme/tokens';

/**
 * THE MEASURING TAPE — height and weight as one instrument (`app.css:2201`,
 * `client-onboard.js` tape engine).
 *
 * A graduated strip slides under a fixed brand needle and the value is read at
 * the needle, the way a tailor reads a tape — not typed like a form. Same
 * anatomy both ways: height reads upward on a 112×330 vertical tape, weight
 * reads across on a full-width 104px one. The strip's travel is an Animated
 * transform so the drag never re-lays-out three hundred ticks; only the ROUNDED
 * reading goes back to the screen, and only when it changes. Released, the strip
 * settles onto the nearest graduation in 180ms — no overshoot.
 *
 * cfg, all in DISPLAY units: min/max/step and the physical pitch `pxStep`;
 * `maj`/`mid` say which graduations speak louder; `label` is the numeral a major
 * tick wears.
 */
export interface TapeCfg {
  min: number;
  max: number;
  step: number;
  pxStep: number;
  vertical: boolean;
  maj: (v: number) => boolean;
  mid: (v: number) => boolean;
  label: (v: number) => string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Tape({ cfg, value, onChange }: { cfg: TapeCfg; value: number; onChange: (v: number) => void }) {
  const c = useTheme();
  const vertical = cfg.vertical;
  const [size, setSize] = useState({ w: vertical ? 112 : 350, h: vertical ? 330 : 104 });
  const center = (vertical ? size.h : size.w) / 2;

  const posOf = (v: number) => ((vertical ? cfg.max - v : v - cfg.min) / cfg.step) * cfg.pxStep;
  const rounded = (v: number) => clamp(Math.round(v / cfg.step) * cfg.step, cfg.min, cfg.max);
  /* the strip's offset that puts `v` under the needle */
  const offsetFor = (v: number) => center - posOf(v);

  const shift = useRef(new Animated.Value(offsetFor(value))).current;
  const startVal = useRef(value);
  const live = useRef(value);
  const dragging = useRef(false);

  /* the parent's value (a unit switch, a reset) lands the strip without a drag */
  useEffect(() => {
    if (dragging.current) return;
    live.current = value;
    shift.setValue(offsetFor(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, size.w, size.h, cfg.min, cfg.max, cfg.step, cfg.pxStep, vertical]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => (vertical ? Math.abs(g.dy) > 2 : Math.abs(g.dx) > 2),
        onPanResponderGrant: () => {
          dragging.current = true;
          startVal.current = live.current;
        },
        onPanResponderMove: (_e, g) => {
          /* strip dragged down (dy > 0) reads HIGHER on a vertical tape; dragged
             right (dx > 0) reads LOWER on a horizontal one */
          const d = vertical ? g.dy : -g.dx;
          const raw = clamp(startVal.current + (d / cfg.pxStep) * cfg.step, cfg.min, cfg.max);
          shift.setValue(offsetFor(raw));
          const r = rounded(raw);
          if (r !== live.current) {
            live.current = r;
            onChange(r);
          }
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          Animated.timing(shift, { toValue: offsetFor(live.current), duration: 180, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          Animated.timing(shift, { toValue: offsetFor(live.current), duration: 180, useNativeDriver: true }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vertical, cfg.min, cfg.max, cfg.step, cfg.pxStep, center],
  );

  const ticks = useMemo(() => {
    const out: { v: number; pos: number; kind: 'maj' | 'mid' | '' }[] = [];
    const n = Math.round((cfg.max - cfg.min) / cfg.step);
    for (let i = 0; i <= n; i++) {
      const v = cfg.min + i * cfg.step;
      out.push({ v, pos: posOf(v), kind: cfg.maj(v) ? 'maj' : cfg.mid(v) ? 'mid' : '' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.min, cfg.max, cfg.step, cfg.pxStep, vertical]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const tickColor = c.lineStrong;
  const majColor = c.ink3;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.tape,
        vertical ? styles.v : styles.h,
        { backgroundColor: c.surface, shadowColor: '#000' },
      ]}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: cfg.min, max: cfg.max, now: value }}
      {...pan.panHandlers}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: vertical ? [{ translateY: shift }] : [{ translateX: shift }] },
        ]}
      >
        {ticks.map((tk) =>
          vertical ? (
            <View key={tk.v} style={[styles.tickV, { top: tk.pos }]}>
              {tk.kind === 'maj' ? (
                <Text style={[styles.labelV, { color: c.ink2, fontFamily: numFamily(500) }]}>{cfg.label(tk.v)}</Text>
              ) : null}
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  height: tk.kind === 'maj' ? 1.5 : 1,
                  width: tk.kind === 'maj' ? 32 : tk.kind === 'mid' ? 22 : 14,
                  backgroundColor: tk.kind === 'maj' ? majColor : tickColor,
                }}
              />
            </View>
          ) : (
            <View key={tk.v} style={[styles.tickH, { left: tk.pos }]}>
              {tk.kind === 'maj' ? (
                <Text style={[styles.labelH, { color: c.ink2, fontFamily: numFamily(500) }]}>{cfg.label(tk.v)}</Text>
              ) : null}
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: tk.kind === 'maj' ? 1.5 : 1,
                  height: tk.kind === 'maj' ? 32 : tk.kind === 'mid' ? 22 : 14,
                  backgroundColor: tk.kind === 'maj' ? majColor : tickColor,
                }}
              />
            </View>
          ),
        )}
      </Animated.View>

      {/* the needle — fixed, brand, with a pointer at its head */}
      {vertical ? (
        <View pointerEvents="none" style={[styles.needleV, { backgroundColor: c.brand }]}>
          <View style={[styles.headV, { borderLeftColor: c.brand }]} />
        </View>
      ) : (
        <View pointerEvents="none" style={[styles.needleH, { backgroundColor: c.brand }]}>
          <View style={[styles.headH, { borderTopColor: c.brand }]} />
        </View>
      )}

      {/* fading edges say the scale continues past the window */}
      {vertical ? (
        <>
          <LinearGradient pointerEvents="none" colors={[c.surface, `${c.surface}00`]} style={styles.fadeTop} />
          <LinearGradient pointerEvents="none" colors={[`${c.surface}00`, c.surface]} style={styles.fadeBottom} />
        </>
      ) : (
        <>
          <LinearGradient pointerEvents="none" colors={[c.surface, `${c.surface}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fadeLeft} />
          <LinearGradient pointerEvents="none" colors={[`${c.surface}00`, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fadeRight} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tape: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  h: { width: '100%', maxWidth: 420, height: 104 },
  v: { width: 112, height: 330 },
  tickV: { position: 'absolute', left: 0, right: 0, height: 0 },
  tickH: { position: 'absolute', top: 0, bottom: 0, width: 0 },
  /* `.tape.v .tick.maj span{right:38px; top:50%; translateY(-50%)}` */
  labelV: { position: 'absolute', right: 38, top: -9, fontSize: t.xs, lineHeight: 18, fontVariant: ['tabular-nums'] },
  /* `.tape.h .tick.maj span{bottom:38px; left:50%; translateX(-50%)}` */
  labelH: { position: 'absolute', bottom: 38, left: -20, width: 40, textAlign: 'center', fontSize: t.xs, lineHeight: 18, fontVariant: ['tabular-nums'] },
  needleV: { position: 'absolute', left: 0, right: 0, top: '50%', height: 2, marginTop: -1 },
  headV: {
    position: 'absolute',
    left: 0,
    top: -5,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  needleH: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1 },
  headH: {
    position: 'absolute',
    top: 0,
    left: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 44 },
  fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 44 },
  fadeLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 48 },
  fadeRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 48 },
});
