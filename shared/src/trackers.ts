/**
 * THE TRACKER SIGNALS — the six rings at the top of the Trackers screen, derived
 * from the client's `trackers` blob (steps, active minutes, activity calories,
 * sleep, screen time, water) against their targets. Pure: the same shape the
 * mobile screen reads, so the fixture it replaces is now this over real data.
 *
 * The Nutrient Panel (macros/micros) is a SEPARATE, later computation (meals × a
 * nutrient reference) and is not derived here.
 */

/** One signal ring — `series` names a `tk-*` colour token the screen paints. */
export interface TrackerSignal {
  key: string;
  icon: string;
  label: string;
  value: string;
  sub: string;
  pct: number;
  series: string;
}

/** The subset of the trackers blob the signals read. */
export interface TrackerInput {
  steps?: number;
  stepsTarget?: number;
  activeMins?: number;
  activeTarget?: number;
  actCal?: number;
  actCalTarget?: number;
  sleep?: string;
  sleepPct?: number;
  screenMins?: number;
  screenTarget?: number;
  waterDone?: number;
  waterTarget?: number;
}

const pct = (v: number, target: number): number =>
  target > 0 ? Math.min(100, Math.round((v / target) * 100)) : 0;

/** minutes to "1 h 36 m" / "2 h" / "45 m" — the demo's HV.fmtMins. */
const hm = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
};

const inLakh = (n: number): string => n.toLocaleString('en-IN');

/** The six signals, in the demo's order, over the client's real day. */
export function trackerSignals(t: TrackerInput | null | undefined): TrackerSignal[] {
  const b = t ?? {};
  const steps = b.steps ?? 0;
  const stepsTarget = b.stepsTarget ?? 0;
  const active = b.activeMins ?? 0;
  const activeTarget = b.activeTarget ?? 0;
  const actCal = b.actCal ?? 0;
  const actCalTarget = b.actCalTarget ?? 0;
  const sleepPct = b.sleepPct ?? 0;
  const screen = b.screenMins ?? 0;
  const screenTarget = b.screenTarget ?? 0;
  const water = b.waterDone ?? 0;
  const waterTarget = b.waterTarget ?? 0;

  return [
    { key: 'steps', icon: 'walk', label: 'Steps', value: inLakh(steps), sub: `of ${inLakh(stepsTarget)}`, pct: pct(steps, stepsTarget), series: 'tkMove' },
    { key: 'active', icon: 'pulse', label: 'Active', value: `${active} m`, sub: `of ${activeTarget}`, pct: pct(active, activeTarget), series: 'tkTime' },
    { key: 'actCal', icon: 'flame', label: 'Calories', value: String(actCal), sub: `of ${actCalTarget}`, pct: pct(actCal, actCalTarget), series: 'tkBurn' },
    { key: 'sleep', icon: 'moon', label: 'Sleep', value: b.sleep ?? '—', sub: `${sleepPct}%`, pct: sleepPct, series: 'tkRest' },
    { key: 'screen', icon: 'device', label: 'Screen', value: hm(screen), sub: `of ${hm(screenTarget)}`, pct: pct(screen, screenTarget), series: 'tkScreen' },
    { key: 'water', icon: 'drop', label: 'Water', value: String(water), sub: `of ${waterTarget}`, pct: pct(water, waterTarget), series: 'tkWater' },
  ];
}
