import { describe, expect, it } from 'vitest';

import { trackerSignals } from '../src/trackers.js';

/* Rajesh's real trackers blob — the six signals must reproduce exactly what the
   old fixture hand-carried (it was his values all along). */
const RAJESH = {
  steps: 6100,
  stepsTarget: 8000,
  activeMins: 38,
  activeTarget: 60,
  actCal: 210,
  actCalTarget: 350,
  sleep: '6 h 40 m',
  sleepPct: 83,
  screenMins: 96,
  screenTarget: 120,
  waterDone: 5,
  waterTarget: 8,
};

describe('trackerSignals', () => {
  it('derives the six signals from the blob, matching the fixture', () => {
    const s = trackerSignals(RAJESH);
    expect(s.map((x) => x.key)).toEqual(['steps', 'active', 'actCal', 'sleep', 'screen', 'water']);
    expect(s[0]).toMatchObject({ value: '6,100', sub: 'of 8,000', pct: 76, series: 'tkMove' });
    expect(s[1]).toMatchObject({ value: '38 m', sub: 'of 60', pct: 63 });
    expect(s[2]).toMatchObject({ value: '210', sub: 'of 350', pct: 60 });
    expect(s[3]).toMatchObject({ value: '6 h 40 m', sub: '83%', pct: 83 });
    expect(s[4]).toMatchObject({ value: '1 h 36 m', sub: 'of 2 h', pct: 80 });
    expect(s[5]).toMatchObject({ value: '5', sub: 'of 8', pct: 63 });
  });

  it('is safe on an empty blob — zeros, not a throw', () => {
    const s = trackerSignals(null);
    expect(s).toHaveLength(6);
    expect(s[0]).toMatchObject({ value: '0', pct: 0 });
  });
});
