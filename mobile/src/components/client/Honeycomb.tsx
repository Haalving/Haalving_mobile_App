import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

import { Icon } from '@/components/ui/Icon';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE HIVE — three doors cut from one comb.
 *
 * LAID OUT WITH FLEXBOX, NOT ABSOLUTE POSITIONING, and that is a scar rather than
 * a preference. Two earlier versions positioned the labels absolutely over the
 * polygons; on the device they laid out in normal flow instead, stacked below the
 * comb and clipped away, so the hexagons rendered as three huge blank shapes. A
 * uiautomator dump is what finally said so — the label boxes were full-width with
 * inverted bounds. Rows and a negative margin cannot fail that way.
 *
 * THE SHAPES ARE ONE SVG BEHIND THE ROWS. One canvas, one viewBox, drawn once and
 * sized in the same units the rows use, so the picture and the tap targets are
 * derived from the same numbers.
 *
 * THE COMB IS SMALLER THAN THE COLUMN. At full width the cells were half the
 * screen each and the section read as three enormous buttons. The reference sits
 * the comb at about two thirds of the content width, centred.
 *
 *   W · H = W×1.12 · gutter G      the lower cell nests up by one slant
 */

const W = 118;
const H = Math.round(W * 1.12); // 132
const G = 10;
const SLANT = Math.round(H * 0.25); // 33 — the angled shoulder the cell nests into
const CANVAS_W = W * 2 + G;
const CANVAS_H = H + (H - SLANT);

/** A point-topped cell on a 100×112 grid, scaled to W×H and offset to (x, y). */
const cell = (x: number, y: number): string =>
  [
    [50, 0],
    [100, 28],
    [100, 84],
    [50, 112],
    [0, 84],
    [0, 28],
  ]
    .map(([px, py]) => `${((px as number) / 100) * W + x},${((py as number) / 112) * H + y}`)
    .join(' ');

const SLOTS = [
  { x: 0, y: 0 },
  { x: W + G, y: 0 },
  { x: (W + G) / 2, y: H - SLANT },
] as const;

/** Half-visible cells around the edges — the lattice the comb is cut from. */
const GHOSTS = [
  { x: -(W * 0.55), y: H - SLANT },
  { x: CANVAS_W - W * 0.45, y: H - SLANT },
  { x: -(W * 0.55), y: -(H - SLANT) },
  { x: CANVAS_W - W * 0.45, y: -(H - SLANT) },
] as const;

type Fill = { a: string; b: string; ink: string };

const FILLS: Record<HexKey, Fill> = {
  quiz: { a: '#14746D', b: '#0A3F3C', ink: '#FFFFFF' },
  event: { a: '#D8E6E0', b: '#A3C0B7', ink: '#141A17' },
  zone: { a: '#F3E4BD', b: '#C8AC70', ink: '#141A17' },
};

export type HexKey = 'quiz' | 'event' | 'zone';

export interface HexDoor {
  key: HexKey;
  label: string;
  icon: string;
  /** The live line under the label — never a static caption. */
  meta: string;
  onPress: () => void;
}

export interface HiveTile {
  icon: string;
  label: string;
  /** A tile with nothing behind it yet says so rather than doing nothing. */
  soon?: boolean;
  onPress?: () => void;
}

/** One door: the words over its cell. The polygon behind it is drawn by the comb. */
function Cell({ door }: { door: HexDoor }) {
  const f = FILLS[door.key];
  return (
    <Pressable
      onPress={door.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${door.label}. ${door.meta}`}
      style={styles.cell}
    >
      <Icon name={door.icon} size={22} color={f.ink} strokeWidth={1.4} />
      <Text style={[styles.hxLabel, { color: f.ink }]} numberOfLines={2}>
        {door.label}
      </Text>
      <Text style={[styles.hxMeta, { color: f.ink, fontFamily: numFamily(500) }]} numberOfLines={2}>
        {door.meta}
      </Text>
    </Pressable>
  );
}

export function Honeycomb({
  doors,
  tiles,
  width,
}: {
  doors: HexDoor[];
  tiles: HiveTile[];
  width: number;
}) {
  const c = useTheme();
  const [a, b, d] = doors;
  const tileW = Math.floor((width - spacing.s3) / 2);

  return (
    <View>
      <View style={styles.combWrap}>
        <View style={styles.comb}>
          {/* the shapes, behind the rows. Inline absolute rather than the
              StyleSheet constant — see the note at the top of this file. */}
          <Svg
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            <Defs>
              {doors.map((x) => {
                const f = FILLS[x.key];
                return (
                  <LinearGradient key={x.key} id={`hx-${x.key}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={f.a} />
                    <Stop offset="1" stopColor={f.b} />
                  </LinearGradient>
                );
              })}
            </Defs>

            {GHOSTS.map((g, i) => (
              <Polygon key={`ghost-${i}`} points={cell(g.x, g.y)} fill={c.surface} opacity={0.5} />
            ))}

            {doors.map((x, i) => {
              const s = SLOTS[i];
              if (!s) return null;
              return <Polygon key={x.key} points={cell(s.x, s.y)} fill={`url(#hx-${x.key})`} />;
            })}
          </Svg>

          <View style={styles.row}>
            {a ? <Cell door={a} /> : null}
            {b ? <Cell door={b} /> : null}
          </View>
          <View style={[styles.row, { marginTop: -SLANT }]}>
            {d ? <Cell door={d} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.label}
            onPress={tile.soon ? undefined : tile.onPress}
            disabled={tile.soon}
            accessibilityRole="button"
            accessibilityLabel={tile.soon ? `${tile.label}, coming soon` : tile.label}
            style={[
              styles.tile,
              {
                width: tileW,
                backgroundColor: c.surface2,
                borderColor: c.line,
                opacity: tile.soon ? 0.55 : 1,
              },
            ]}
          >
            <View style={styles.tileTop}>
              <View style={[styles.tileIcon, { backgroundColor: c.surface3 }]}>
                <Icon name={tile.icon} size={16} color={c.brand} />
              </View>
              {/* said out loud: a tile that ignores a tap reads as broken */}
              {tile.soon ? (
                <View style={[styles.soon, { backgroundColor: c.surface3 }]}>
                  <Text style={[styles.soonText, { color: c.ink3 }]}>Soon</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tileLabel, { color: c.ink }]}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  combWrap: { alignItems: 'center' },
  comb: { width: CANVAS_W, height: CANVAS_H, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: G, justifyContent: 'center' },
  /* the cell is the tap target AND the label box; the polygon under it is drawn
     to the same W×H, so what a person taps is the shape they read */
  cell: {
    width: W,
    height: H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 1,
  },
  hxLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  hxMeta: { fontSize: 10, textAlign: 'center', opacity: 0.85, lineHeight: 13 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3, marginTop: spacing.s5 },
  tile: { borderWidth: 1, borderRadius: radius.md, padding: spacing.s4, gap: spacing.s6 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  soon: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  soonText: { fontSize: 11, fontWeight: '600' },
  tileLabel: { fontSize: t.sm, fontWeight: '600' },
});
