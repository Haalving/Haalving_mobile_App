import { describe, expect, it } from 'vitest';

import { dailyTargets } from '../src/daily.js';

describe('dailyTargets', () => {
  it('reads the client tracker targets, sleep is the fixed band', () => {
    const rows = dailyTargets({ stepsTarget: 8000, waterTarget: 8, screenTarget: 120 });
    expect(rows.map((r) => r.label)).toEqual(['Steps', 'Water', 'Sleep', 'Screen']);
    expect(rows[0]!.value).toBe('8,000');
    expect(rows[1]!.value).toBe('8 glasses');
    expect(rows[2]!.value).toBe('7–8 h');
    expect(rows[3]!.value).toBe('under 120 min');
  });

  it('falls back to sensible defaults when a target is missing', () => {
    const rows = dailyTargets(null);
    expect(rows[0]!.value).toBe('0');
    expect(rows[1]!.value).toBe('8 glasses');
    expect(rows[3]!.value).toBe('under 120 min');
  });
});
