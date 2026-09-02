import { describe, expect, it } from 'vitest';

import { levelup, type LevelupClient, type LevelupRefs } from '../src/levelup.js';

/* compact stand-ins for the demo's cultureCriteria / bodyCriteria / program.wellness
   — the same shapes config.getReference() serves, small enough to read here */
const refs: LevelupRefs = {
  cultureCriteria: {
    gates: [
      { key: 'goals', label: 'Level goals achieved', target: '≥ 80%' },
      { key: 'diet', label: 'Diet plan compliance', target: '≥ 80%' },
      { key: 'group', label: 'Group participation & recommendations', target: '≥ 80%' },
      { key: 'photos', label: 'Food photo updates', target: 'min 25 of 33' },
      { key: 'calpro', label: 'Calorie & protein targets', target: '≥ 80%' },
    ],
    tracks: { sedentary: { label: 'Sedentary', levels: { '2': { goals: ['Improved hormone response'] } } } },
  },
  bodyCriteria: {
    bar: '≥ 75% of level goals',
    sessionBars: { fitness: 'min 4 of 5', yoga: '3 of 3' },
    tracks: { sedentary: { label: 'Sedentary', levels: { '3': ['Activate core', 'Strengthen abs'] } } },
  },
  wellness: { '4': { sleep: '7–8 h', screen: '2–2.5 h', practice: 'Nightly wind-down breath · 2 min' } },
  reviewWord: 'Day-12',
};

const rajesh: LevelupClient = {
  levels: { fitness: 3, culture: 2, yoga: 3, wellness: 4 },
  track: 'sedentary',
  sessions: {
    fitness: { done: 3, target: 5, cancelled: 0 },
    yoga: { done: 2, target: 3 },
    mind: { done: 1, target: 1 },
  },
  culturePhotos: { uploaded: 18, of: 33, min: 25 },
  compliance: 83,
  sleep: '6 h 40 m',
};

describe('levelup', () => {
  it('is null for an observation client — no levels, no ratings yet', () => {
    expect(levelup('fitness', { ...rajesh, observation: true }, refs)).toBeNull();
  });

  it('is null when there is no session ledger', () => {
    expect(levelup('fitness', { ...rajesh, sessions: null }, refs)).toBeNull();
  });

  it('fitness: four rows, min-4-of-5 bar, ticked counts only the true rows', () => {
    const lu = levelup('fitness', rajesh, refs)!;
    expect(lu.level).toBe(3);
    expect(lu.trackLabel).toBe('Sedentary');
    expect(lu.rows).toHaveLength(4);
    /* 3 of 5 done, bar is 4 → not met */
    expect(lu.rows[0]!.small).toContain('3 of 5');
    expect(lu.rows[0]!.small).toContain('min 4 of 5');
    expect(lu.rows[0]!.met).toBe(false);
    /* 0 cancellations ≤ 1 → met */
    expect(lu.rows[1]!.met).toBe(true);
    /* the two the team confirms at review are three-state null, not false */
    expect(lu.rows[2]!.met).toBeNull();
    expect(lu.rows[3]!.met).toBeNull();
    expect(lu.ticked).toBe(1);
    expect(lu.total).toBe(4);
    expect(lu.goals).toEqual(['Activate core', 'Strengthen abs']);
    expect(lu.note).toContain('Fitness moves up at the Day-12 review');
  });

  it('culture: five gates; the photo gate is below its minimum, the diet gate reads compliance', () => {
    const lu = levelup('culture', rajesh, refs)!;
    expect(lu.rows).toHaveLength(5);
    const photos = lu.rows.find((r) => r.label === 'Food photo updates')!;
    expect(photos.small).toBe('18 of 33 photos · min 25');
    expect(photos.met).toBe(false);
    const diet = lu.rows.find((r) => r.label === 'Diet plan compliance')!;
    expect(diet.small).toContain('83%');
    expect(diet.met).toBe(true);
    expect(lu.note).toContain('Nutrition moves up');
  });

  it('culture: the photo gate ticks once the minimum is reached', () => {
    const lu = levelup('culture', { ...rajesh, culturePhotos: { uploaded: 30, of: 33, min: 25 } }, refs)!;
    expect(lu.rows.find((r) => r.label === 'Food photo updates')!.met).toBe(true);
  });

  it('wellness: mind session plus sleep/screen/practice, named "Daily practice"', () => {
    const lu = levelup('wellness', rajesh, refs)!;
    expect(lu.trackLabel).toBe('Daily practice');
    expect(lu.rows[0]!.label).toBe('Mind session attended');
    expect(lu.rows[0]!.met).toBe(true);
    expect(lu.rows.some((r) => r.small.includes('level cap 2–2.5 h'))).toBe(true);
    expect(lu.note).toContain('Mind Wellness moves at the Day-12 review');
  });
});
