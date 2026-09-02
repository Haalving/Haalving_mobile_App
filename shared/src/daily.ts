/**
 * THE DAILY STRIP — the plan's standing targets, ported from `dailyTab`
 * (demo client-plan.js:786). Steps, water and screen read the client's OWN
 * tracker targets (not the programme blob, whose numbers are level ranges); sleep
 * is the fixed 7–8 h band the review measures against. Icons, labels and sub-lines
 * are the demo's, verbatim, so the app draws the same four rows.
 */

export interface PlanDaily {
  icon: string;
  label: string;
  value: string;
  sub: string;
}

export interface TrackerTargets {
  stepsTarget?: number | null;
  waterTarget?: number | null;
  screenTarget?: number | null;
}

export function dailyTargets(trackers: TrackerTargets | null | undefined): PlanDaily[] {
  const steps = trackers?.stepsTarget ?? 0;
  const water = trackers?.waterTarget ?? 8;
  const screen = trackers?.screenTarget ?? 120;
  return [
    {
      icon: 'walk',
      label: 'Steps',
      value: steps.toLocaleString('en-IN'),
      sub: 'every day — counted from your phone or watch',
    },
    { icon: 'drop', label: 'Water', value: `${water} glasses`, sub: 'spread through the day' },
    { icon: 'moon', label: 'Sleep', value: '7–8 h', sub: 'the band that counts at review' },
    { icon: 'device', label: 'Screen', value: `under ${screen} min`, sub: 'none in the hour before bed' },
  ];
}
