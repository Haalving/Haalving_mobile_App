import { describe, expect, it } from 'vitest';

import {
  assignment,
  calendarFor,
  sessionStatus,
  slotsFor,
  type Assignment,
  type CalTemplate,
  type CalendarInput,
} from '../src/calendar.js';

const templates: Record<string, CalTemplate> = {
  'tp-fit': { days: { '1': { slots: [{ label: 'Strength I' }] }, '6': { slots: [{ label: 'Strength II' }] }, '7': { slots: [{ label: 'Strength III' }] } } },
  'tp-cul': { days: { '6': { slots: [{ label: 'Breakfast' }, { label: 'Lunch' }] } } },
};

const plans: Record<string, Assignment> = {
  fitness: { templateId: 'tp-fit', time: '18:00' },
  culture: { templateId: 'tp-cul', overrides: { '6': { slots: [{ label: 'Swapped plate' }] } } },
};

describe('assignment / slotsFor / sessionStatus', () => {
  it('assignment returns the pillar entry, or null when unassigned', () => {
    expect(assignment(plans, 'fitness')?.templateId).toBe('tp-fit');
    expect(assignment(plans, 'yoga')).toBeNull();
  });

  it('slotsFor falls back to the template day, and empty for an unassigned pillar', () => {
    expect(slotsFor(assignment(plans, 'fitness'), templates, 1)).toEqual([{ label: 'Strength I' }]);
    expect(slotsFor(assignment(plans, 'yoga'), templates, 1)).toEqual([]);
    /* a day the template does not prescribe */
    expect(slotsFor(assignment(plans, 'fitness'), templates, 2)).toEqual([]);
  });

  it('slotsFor prefers a day-level override over the template', () => {
    expect(slotsFor(assignment(plans, 'culture'), templates, 6)).toEqual([{ label: 'Swapped plate' }]);
  });

  it('sessionStatus returns the latest matching entry, else null', () => {
    const log = [
      { cy: 3, d: 1, pillar: 'fitness', status: 'planned' },
      { cy: 3, d: 1, pillar: 'fitness', status: 'missed' },
    ];
    expect(sessionStatus(log, 3, 1, 'fitness')).toBe('missed');
    expect(sessionStatus(log, 3, 2, 'fitness')).toBeNull();
  });
});

describe('calendarFor', () => {
  const input: CalendarInput = {
    cycle: 3,
    clientDay: 6,
    shape: { cycleDays: 14, restDays: [5, 10], reviewDay: 12, meetingDay: 14 },
    plans,
    templates,
    bookingsByDay: {
      6: [{ pillar: 'fitness', title: 'Form check-in', time: '6:30', staffId: 'u-vikram' }],
    },
    sessionLog: [{ cy: 3, d: 1, pillar: 'fitness', status: 'missed' }],
    staffFor: (p) => `u-${p}`,
    slotWord: (p) => `${p} session`,
    fmtDate: (off) => `d${off}`,
  };

  const cal = calendarFor(input);

  it('has one entry per cycle-day with the shape flags in the right places', () => {
    expect(cal).toHaveLength(14);
    expect(cal[4]!.rest).toBe(true); // day 5
    expect(cal[9]!.rest).toBe(true); // day 10
    expect(cal[11]!.review).toBe(true); // day 12
    expect(cal[13]!.meeting).toBe(true); // day 14
    expect(cal[5]!.today).toBe(true); // day 6
  });

  it('defaults status by position: past done, today today, future planned', () => {
    /* day 1 fitness is overridden by the log to missed */
    const d1 = cal[0]!.items.find((i) => i.pillar === 'fitness')!;
    expect(d1.status).toBe('missed');
    /* day 7 fitness is future → planned, unbooked → the seat holder */
    const d7 = cal[6]!.items.find((i) => i.pillar === 'fitness')!;
    expect(d7.status).toBe('planned');
    expect(d7.booked).toBe(false);
    expect(d7.staffId).toBe('u-fitness');
    expect(d7.time).toBe('18:00'); // the client's own hour, no booking
  });

  it("a booking wins the item's clock, staff and title; status is today's", () => {
    const d6 = cal[5]!.items.find((i) => i.pillar === 'fitness')!;
    expect(d6.booked).toBe(true);
    expect(d6.time).toBe('6:30');
    expect(d6.staffId).toBe('u-vikram');
    expect(d6.label).toBe('Form check-in');
    expect(d6.status).toBe('today');
  });

  it('reads the day-6 meal override for the meals lane', () => {
    expect(cal[5]!.meals).toEqual([{ label: 'Swapped plate' }]);
  });
});
