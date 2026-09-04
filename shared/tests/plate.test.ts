import { describe, expect, it } from 'vitest';

import {
  dishLine,
  doseOf,
  groupSum,
  nutTargetsFor,
  partOfDay,
  r1,
  slotImage,
  slotSum,
  tplTargetsOn,
  type PlateItem,
} from '../src/plate.js';

/**
 * The plate math, against the seed's own foods.
 *
 * These numbers are the ones the console prints on Rajesh's Plan tab, so the
 * assertions double as the contract between the two surfaces: if the client app
 * ever shows a different reading for the same day, one of these fails first.
 */

const LIB: PlateItem[] = [
  { id: 'ci-idli', name: 'Idli', nutrients: { kcal: 60, protein: 1.8, carbs: 12, fat: 0.3, fibre: 0.8 },
    media: { image: 'img/dishes/dish-idli-1.webp' } },
  { id: 'ci-chutney', name: 'Coconut chutney', nutrients: { kcal: 105, protein: 1.9, carbs: 4, fat: 9, fibre: 2 },
    media: { image: 'img/dishes/dish-chutney-1.webp' } },
  { id: 'ci-dosa', name: 'Plain dosa', nutrients: { kcal: 165, protein: 3.5, carbs: 29, fat: 4, fibre: 1 } },
  { id: 'ci-oats', name: 'Oats bowl', nutrients: { kcal: 190, protein: 6, carbs: 32, fat: 4, fibre: 5 } },
  { id: 'ci-squat', name: 'Chair squats', dose: { sets: 3, reps: 10, rpe: 5 } },
];
const byId = new Map(LIB.map((i) => [i.id, i]));

/** Rajesh's day-6 Breakfast, exactly as the L1 template states it. */
const BREAKFAST = {
  label: 'Breakfast',
  time: '8:00',
  options: [[{ id: 'ci-idli', x: 2 }, 'ci-chutney'], ['ci-dosa', 'ci-chutney'], ['ci-oats']],
} as const;

describe('the dish line', () => {
  it('joins one option with + and alternatives with or', () => {
    expect(dishLine(BREAKFAST, byId)).toBe(
      'Idli ×2 + Coconut chutney or Plain dosa + Coconut chutney or Oats bowl',
    );
  });

  it('never prints a redundant ×1', () => {
    expect(dishLine({ options: [['ci-oats']] }, byId)).toBe('Oats bowl');
    expect(dishLine({ options: [[{ id: 'ci-oats', x: 1 }]] }, byId)).toBe('Oats bowl');
  });

  it('falls back to the id when the library has lost the item', () => {
    /* a dish the catalogue no longer carries still names itself — a blank row
       would read as a meal with nothing in it */
    expect(dishLine({ options: [['ci-gone']] }, byId)).toBe('ci-gone');
  });

  it('is empty for a slot with no options at all', () => {
    expect(dishLine({ options: [] }, byId)).toBe('');
    expect(dishLine(null, byId)).toBe('');
  });
});

describe('the reading', () => {
  it('sums the FIRST option only — alternatives are not extra food', () => {
    /* Idli 60 × 2 + chutney 105 = 225, which is what the console prints */
    const sum = slotSum(BREAKFAST, byId);
    expect(sum.kcal).toBe(225);
    expect(r1(sum.protein)).toBe('5.5');

    /* summing every group would be 225 + 270 + 190 — three breakfasts */
    expect(sum.kcal).not.toBe(685);
  });

  it('multiplies by the portion count', () => {
    expect(groupSum([{ id: 'ci-idli', x: 2 }], byId).kcal).toBe(120);
    expect(groupSum(['ci-idli'], byId).kcal).toBe(60);
  });

  it('reads a missing item as zero rather than throwing', () => {
    expect(groupSum(['ci-gone'], byId)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  });

  it('takes its picture from the lead item', () => {
    expect(slotImage(BREAKFAST, byId)).toBe('img/dishes/dish-idli-1.webp');
    expect(slotImage({ options: [['ci-dosa']] }, byId)).toBeNull();
  });
});

describe('the day part', () => {
  it('bands a 24-hour clock, which the demo could not', () => {
    /* the demo's own parser needs an am/pm suffix, so every seeded template slot
       collapsed into one Morning band — these three are the fix */
    expect(partOfDay('8:00')).toBe('Morning');
    expect(partOfDay('13:00')).toBe('Afternoon');
    expect(partOfDay('19:30')).toBe('Evening');
  });

  it('reads the spoken clock too', () => {
    expect(partOfDay('8:00 am')).toBe('Morning');
    expect(partOfDay('1:00 pm')).toBe('Afternoon');
    expect(partOfDay('7:00 pm')).toBe('Evening');
  });

  it('puts an unhoured meal at the top of the day', () => {
    expect(partOfDay(null)).toBe('Morning');
    expect(partOfDay('')).toBe('Morning');
  });
});

describe('the dose', () => {
  it('prefers the client, then the slot, then the item', () => {
    const slot = { options: [['ci-squat']], dose: { reps: 12 } };
    expect(doseOf(slot, 'reps', byId)).toBe(12);
    expect(doseOf(slot, 'reps', byId, { dose: { reps: 15 } })).toBe(15);
    /* nothing said at either level falls to the exercise's own default */
    expect(doseOf({ options: [['ci-squat']] }, 'sets', byId)).toBe(3);
  });

  it('treats an empty string as unsaid, not as a value', () => {
    expect(doseOf({ options: [['ci-squat']], dose: { sets: '' } }, 'sets', byId)).toBe(3);
  });

  it('is undefined when nobody has said anything', () => {
    expect(doseOf({ options: [['ci-squat']] }, 'weight', byId)).toBeUndefined();
  });
});

describe('the day targets', () => {
  const days = { '1': { targets: { kcal: 1700, protein: 75 } }, '6': {} };

  it('inherits the nearest earlier day that stated one', () => {
    expect(tplTargetsOn(days, 6, 14)?.kcal).toBe(1700);
  });

  it('derives protein at a fifth of energy when only kcal is stated', () => {
    const t = nutTargetsFor({ templateId: 'tp' }, { '1': { targets: { kcal: 1800 } } }, 6, 14);
    /* 1800 × 0.2 ÷ 4 — the demo's own derivation, and where "90 g" comes from */
    expect(t?.protein).toBe(90);
    expect(t?.src).toBe('template');
  });

  it('lets the client override beat the template', () => {
    const t = nutTargetsFor({ templateId: 'tp', targets: { kcal: 1500 } }, days, 6, 14);
    expect(t?.kcal).toBe(1500);
    expect(t?.src).toBe('client');
  });

  it('answers null when nothing is assigned and nothing is stated', () => {
    /* the observation case: a derived 1800 would be a goal nobody set, printed
       against a plate that does not exist */
    expect(nutTargetsFor({ templateId: null }, null, 3, 14)).toBeNull();
  });

  it('still derives for an assigned template that states no targets', () => {
    const t = nutTargetsFor({ templateId: 'tp' }, {}, 6, 14);
    expect(t?.kcal).toBe(1800);
    expect(t?.src).toBe('derived');
  });
});
