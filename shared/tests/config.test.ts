import { describe, expect, it } from 'vitest';

import {
  CHAIN_KINDS,
  CHAIN_LABELS,
  DEFAULT_CHAINS,
  isChainKind,
  validateChain,
} from '../src/chains.js';
import { DEFAULT_SHAPE, isMeetingDay, isReviewDay, isRest, validateProgram } from '../src/cycle.js';
import {
  FLOW_TRIGGERS,
  TRIGGER_LABELS,
  flowOn,
  stepWhen,
  validateTemplate,
  type AutomationStep,
} from '../src/flows.js';
import { STORABLE_ROLE_KEYS } from '../src/rbac.js';

/**
 * The rules Configuration enforces before anything is written.
 *
 * `validateProgram` returns SENTENCES, and the sentences are the contract — several
 * of them name the offending number back to the person who typed it, so each is
 * asserted whole rather than by a code.
 */

const shape = (over: Partial<typeof DEFAULT_SHAPE> = {}) => ({ ...DEFAULT_SHAPE, ...over });

describe('validateProgram', () => {
  it('passes the shipped shape', () => {
    expect(validateProgram(DEFAULT_SHAPE)).toBe('');
  });

  it('refuses a number that is not a whole number above zero', () => {
    const sentence = 'Every program number must be a whole number greater than zero. Nothing was saved.';
    expect(validateProgram(shape({ levels: 0 }))).toBe(sentence);
    expect(validateProgram(shape({ cycleDays: -1 }))).toBe(sentence);
    expect(validateProgram(shape({ reviewDay: 1.5 }))).toBe(sentence);
    expect(validateProgram(shape({ meetingDay: 0 }))).toBe(sentence);
  });

  it('refuses rest days that are not whole days above zero, or none at all', () => {
    const sentence = 'Rest days must be whole day numbers greater than zero. Nothing was saved.';
    expect(validateProgram(shape({ restDays: [] }))).toBe(sentence);
    expect(validateProgram(shape({ restDays: [0] }))).toBe(sentence);
    expect(validateProgram(shape({ restDays: [5, 2.5] }))).toBe(sentence);
  });

  it('refuses a negative session count but allows zero', () => {
    expect(validateProgram(shape({ sessions: { fitness: -1, yoga: 3, mind: 1 } }))).toBe(
      'Session counts must be zero or more. Nothing was saved.',
    );
    expect(validateProgram(shape({ sessions: { fitness: 0, yoga: 0, mind: 0 } }))).toBe('');
  });

  it('refuses a term of zero days', () => {
    expect(validateProgram(shape({ termDays: 0 }))).toBe(
      'The engagement term must be a whole number of days greater than zero. Nothing was saved.',
    );
  });

  /*
   * The TERM is deliberately not checked against the cycle. Seven levels of
   * fourteen days is 98, and the term paid for is 90 — two different clocks, and
   * the product is careful never to conflate them.
   */
  it('allows a term shorter than the whole programme', () => {
    expect(validateProgram(shape({ termDays: 90, cycleDays: 14, levels: 7 }))).toBe('');
  });

  it('names the offending day back when the review falls outside the cycle', () => {
    expect(validateProgram(shape({ reviewDay: 15, cycleDays: 14 }))).toBe(
      'The level review must fall inside the cycle — Day 15 of a 14-day cycle doesn’t exist. Nothing was saved.',
    );
  });

  it('names the offending day back when the meeting falls outside the cycle', () => {
    expect(validateProgram(shape({ meetingDay: 20, cycleDays: 14 }))).toBe(
      'The team meeting must fall inside the cycle — Day 20 of a 14-day cycle doesn’t exist. Nothing was saved.',
    );
  });

  it('lists every rest day that falls outside the cycle', () => {
    expect(validateProgram(shape({ restDays: [5, 16, 20], cycleDays: 14 }))).toBe(
      'Rest days must fall inside the cycle — day 16 & 20 is past Day 14. Nothing was saved.',
    );
  });

  it('accepts the review on the last day of the cycle', () => {
    expect(validateProgram(shape({ reviewDay: 14, cycleDays: 14 }))).toBe('');
  });
});

describe('the cycle helpers read the shape they are given', () => {
  it('answers the default shape', () => {
    expect(isRest(5)).toBe(true);
    expect(isRest(6)).toBe(false);
    expect(isReviewDay(12)).toBe(true);
    expect(isMeetingDay(14)).toBe(true);
  });

  it('moves with an overridden shape', () => {
    const o = { reviewDay: 11, restDays: [3, 8], meetingDay: 12 };
    expect(isReviewDay(11, o)).toBe(true);
    expect(isReviewDay(12, o)).toBe(false);
    expect(isRest(3, o)).toBe(true);
    expect(isRest(5, o)).toBe(false);
    expect(isMeetingDay(12, o)).toBe(true);
  });
});

describe('chains', () => {
  it('has the seven kinds in the demo order, each labelled', () => {
    expect(CHAIN_KINDS).toEqual([
      'team',
      'goalsheet',
      'diet',
      'chart',
      'level',
      'calendar',
      'template',
    ]);
    for (const k of CHAIN_KINDS) expect(CHAIN_LABELS[k]).toBeTruthy();
  });

  it('seeds every kind with at least one signature', () => {
    for (const k of CHAIN_KINDS) {
      expect(DEFAULT_CHAINS[k].length, `${k} should have steps`).toBeGreaterThan(0);
      expect(validateChain(DEFAULT_CHAINS[k], STORABLE_ROLE_KEYS)).toBe('');
    }
  });

  it('refuses an empty chain', () => {
    expect(validateChain([], STORABLE_ROLE_KEYS)).toBe(
      'A chain needs at least one signature. Nothing was saved.',
    );
  });

  it('refuses the same role twice', () => {
    expect(
      validateChain(
        [{ role: 'opshead' }, { role: 'core' }, { role: 'opshead' }],
        STORABLE_ROLE_KEYS,
      ),
    ).toBe('A role can only appear once in a chain. Nothing was saved.');
  });

  it('refuses a role that does not exist', () => {
    expect(validateChain([{ role: 'wizard' }], STORABLE_ROLE_KEYS)).toBe(
      'There is no role called wizard. Nothing was saved.',
    );
  });

  it('knows its own kinds', () => {
    expect(isChainKind('diet')).toBe(true);
    expect(isChainKind('breakfast')).toBe(false);
  });
});

describe('automations', () => {
  const step = (o: Partial<AutomationStep> = {}): AutomationStep => ({
    at: 540,
    title: 'Hello',
    text: 'Body',
    ...o,
  });

  it('labels both triggers', () => {
    expect(FLOW_TRIGGERS).toEqual(['ENROL', 'CYCLE_DAY']);
    expect(TRIGGER_LABELS.ENROL).toBe('Once, from joining');
    expect(TRIGGER_LABELS.CYCLE_DAY).toBe('Every cycle');
  });

  it('refuses a cycle step past the end of the cycle', () => {
    expect(validateTemplate({ trigger: 'CYCLE_DAY', steps: [step({ on: 20 })] })).toBe(
      'A cycle step must fall inside the cycle — Day 20 of a 14-day cycle doesn’t exist. Nothing was saved.',
    );
    expect(validateTemplate({ trigger: 'CYCLE_DAY', steps: [step({ on: 14 })] })).toBe('');
  });

  it('reads the cycle length from the shape it is given', () => {
    expect(validateTemplate({ trigger: 'CYCLE_DAY', steps: [step({ on: 20 })] }, { cycleDays: 21 })).toBe('');
  });

  /* an ENROL step has no ceiling — "180 days after joining" is an anniversary */
  it('allows a far-off enrolment step', () => {
    expect(validateTemplate({ trigger: 'ENROL', steps: [step({ after: 180 })] })).toBe('');
  });

  it('refuses a step with no title, or an impossible time', () => {
    expect(validateTemplate({ trigger: 'ENROL', steps: [step({ title: '  ' })] })).toBe(
      'Every step needs a title. Nothing was saved.',
    );
    expect(validateTemplate({ trigger: 'ENROL', steps: [step({ at: 2000 })] })).toBe(
      'A step has to be sent at a real time of day. Nothing was saved.',
    );
  });

  it('words the timing per trigger', () => {
    expect(stepWhen('ENROL', step({ after: 0 }))).toBe('On joining');
    expect(stepWhen('ENROL', step({ after: 1 }))).toBe('1 day after joining');
    expect(stepWhen('ENROL', step({ after: 6 }))).toBe('6 days after joining');
    expect(stepWhen('CYCLE_DAY', step({ on: 3 }))).toBe('Day 3 of the cycle');
  });

  describe('flowOn', () => {
    it('falls back to the template default when nobody has chosen', () => {
      expect(flowOn({ defaultOn: true, enabled: true }, undefined)).toBe(true);
      expect(flowOn({ defaultOn: false, enabled: true }, undefined)).toBe(false);
    });

    it('lets a per-client choice override the default either way', () => {
      expect(flowOn({ defaultOn: false, enabled: true }, true)).toBe(true);
      expect(flowOn({ defaultOn: true, enabled: true }, false)).toBe(false);
    });

    /* the house switch wins: pausing stops it for everybody, however many people
       have individually turned it on */
    it('is off for everybody when the template is paused', () => {
      expect(flowOn({ defaultOn: true, enabled: false }, true)).toBe(false);
      expect(flowOn({ defaultOn: true, enabled: false }, undefined)).toBe(false);
    });
  });
});
