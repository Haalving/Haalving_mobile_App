import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { MOODS, type Mood } from '@/api/client-app';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/** the four moods, in friendly words for the picker and the answered line */
const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Good',
  sad: 'Low',
  angry: 'Tense',
  drained: 'Tired',
};

/**
 * TODAY'S BANDS — the streak, the arrival, and the morning-film mark.
 *
 * These are the demo's own boxes (app.css .streak :591, .arrive :550, .filmmark
 * :3622), drawn here at their exact geometry so the harness measures the real
 * layout TODAY. The values behind them are stubbed, because the client API does
 * not serve the facts yet:
 *   - the streak needs kept-days per cycle-day,
 *   - the arrival needs the mood recorded for this cycle-day,
 *   - the film needs the day's prescribed clip from the content calendar.
 * Each expected payload is written down in docs/pixel/TODO.md under "needs API
 * field", so the backend session can add them without guessing — and each card
 * lights up the moment its field arrives.
 *
 * The gold here is NOT a token, exactly as in ClientHeader: `#EBD49B` and the two
 * washes below are the reward register's own livery (app.css:593, 596), written as
 * literals so gold never leaks into a screen that has no business wearing it.
 */

const GOLD = {
  /** the streak's ink — app.css:593 `color:#EBD49B` */
  ink: '#EBD49B',
  /** the streak card's ground — rgba(201,168,106,.10) */
  ground: 'rgba(201,168,106,0.10)',
  /** the "DAY STREAK" label — rgba(235,212,155,.6) */
  label: 'rgba(235,212,155,0.6)',
} as const;

/* the streak flame — app.css marks it fillable; the demo's own path
   (client-today.js:807), NOT the nav flame, which is a different drawing. */
const FLAME = 'M12 3.5c.5 2.7 2 4.2 3.5 5.8 1.4 1.5 2.5 3.1 2.5 5.2a6 6 0 0 1-12 0c0-1.7.7-3.2 1.8-4.4.3 1 .9 1.8 1.7 2.3-.4-3 .7-6.2 2.5-8.9z';

function Flame({ on }: { on: boolean }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" style={{ opacity: on ? 1 : 0.3 }}>
      <Path
        d={FLAME}
        fill={on ? GOLD.ink : 'none'}
        stroke={GOLD.ink}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * THE STREAK — one flame a day, lit when that day's tasks were all done, the
 * count of days kept beside them (app.css:591-602). Seven flames, oldest first,
 * so the fire reads left to now.
 *
 * STUB: days 0, no flame lit. When `me.streak` arrives the count and the lit
 * flames follow it with no layout change.
 */
export function StreakBand({
  days = 0,
  kept = [false, false, false, false, false, false, false],
}: {
  days?: number;
  kept?: boolean[];
}) {
  const seven = kept.length === 7 ? kept : [false, false, false, false, false, false, false];
  return (
    <View style={styles.streak}>
      <Text style={styles.streakNum}>{days}</Text>
      <View style={styles.streakSt}>
        <Text style={styles.streakLabel}>DAY STREAK</Text>
      </View>
      <View style={styles.streakDays}>
        {seven.map((on, i) => (
          <Flame key={i} on={on} />
        ))}
      </View>
    </View>
  );
}

/* the neutral arrival face — client-today.js:322 (NEUTRAL_FACE): a ring, two
   eyes, a level mouth. The "v.01" eyes are dots drawn by the round cap. */
function NeutralFace({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.3} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M9 10.3v.01M15 10.3v.01M9.4 14.8h5.2"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* the arrival chevron — client-today.js:782 */
function ArriveChevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M10 7l5 5-5 5"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * THE ARRIVAL — a glass band that invites the morning mood (app.css:550-562).
 *
 * Unanswered, it rests on the neutral face and "How are you arriving?"; a tap opens
 * a row of four moods. Picking one POSTs it (the caller's `onPick`) and, once the
 * answer rides back on `GET /client/today`, the band settles on the chosen mood —
 * a brand face and the word for it — and no longer opens. Keyed by cycle-day on the
 * server, so it is this morning's, not a browsed day's.
 */
export function ArriveBand({
  mood = null,
  onPick,
  pending = false,
}: {
  mood?: string | null;
  onPick?: (m: Mood) => void;
  pending?: boolean;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const answered = !!mood;
  const label = answered ? (MOOD_LABEL[mood as Mood] ?? 'Noted') : 'How are you arriving?';

  return (
    <View>
      <Pressable
        style={styles.arrive}
        onPress={() => !answered && !pending && setOpen((o) => !o)}
        disabled={answered || pending}
      >
        <View style={styles.af}>
          {/* white at rest, brand once a mood is chosen */}
          <NeutralFace color={answered ? c.brand : '#fff'} />
        </View>
        <View style={styles.at}>
          <Text style={styles.atSmall}>ARRIVING</Text>
          <Text style={styles.atB}>{label}</Text>
        </View>
        <View style={styles.ac}>{!answered ? <ArriveChevron /> : null}</View>
      </Pressable>

      {open && !answered ? (
        <View style={styles.moods}>
          {MOODS.map((m) => (
            <Pressable
              key={m}
              style={[styles.moodPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
              onPress={() => {
                onPick?.(m);
                setOpen(false);
              }}
            >
              <Text style={styles.moodText}>{MOOD_LABEL[m]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * THE MORNING-FILM MARK — the poster that lives in Today's band all day
 * (app.css:3622, FILM_MARK core.js:3192). YouTube's silhouette in HAALVING's
 * voice: a brand-fill rect under a white triangle, lifted off the near-black
 * ground by a brand hairline.
 *
 * STUB: present but inert — there is no film to play until the content calendar
 * is served. Drawn as a plain View, not a Pressable, so a tap does nothing rather
 * than promising a film that is not there.
 */
export function FilmMark() {
  const c = useTheme();
  return (
    <View style={styles.filmmark}>
      <Svg width={30} height={21} viewBox="0 0 30 21">
        <Rect x={0.6} y={0.6} width={28.8} height={19.8} rx={6.2} fill={c.brandFill} stroke={c.brand} strokeWidth={1.2} />
        <Path d="M12 6.3 19.4 10.5 12 14.7Z" fill="#fff" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /* .streak — app.css:591-593 */
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    width: '100%',
    marginTop: -spacing.s2,
    marginBottom: spacing.s2,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: GOLD.ground,
  },
  /* the count is a numeral, so the data face — app.css:594 `font-size:26px` */
  streakNum: { fontFamily: numFamily(400), fontSize: 26, color: GOLD.ink },
  streakSt: { flex: 1, minWidth: 0 },
  streakLabel: {
    fontSize: t.micro,
    letterSpacing: t.micro * 0.14,
    color: GOLD.label,
  },
  streakDays: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  /* .arrive — app.css:550-562 */
  arrive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    width: '100%',
    marginTop: -spacing.s2,
    marginBottom: spacing.s3,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  af: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  at: { flex: 1, minWidth: 0, gap: 2 },
  atSmall: {
    fontSize: t.micro,
    letterSpacing: t.micro * 0.14,
    color: 'rgba(255,255,255,0.55)',
  },
  atB: { fontSize: t.body, color: '#fff' },
  ac: {},
  /* the mood picker that drops from the band when tapped */
  moods: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s2,
    marginBottom: spacing.s2,
  },
  moodPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderRadius: radius.md,
  },
  moodText: { fontSize: t.sm, color: '#fff', fontWeight: '600' },

  /* .filmmark — app.css:3622 */
  filmmark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
