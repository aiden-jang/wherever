import { describe, expect, it } from 'vitest';
import { journeyTiming } from './arrivalPlan.js';

const planned = { start: '2026-08-11T23:00:00.000Z', duration: 90 as const };

describe('journeyTiming', () => {
  it('turns the meetup and trip estimate into a leave-by time', () => {
    const timing = journeyTiming(planned, 'planning', 30, undefined, new Date('2026-08-11T22:00:00.000Z'));
    expect(timing.leaveAt?.toISOString()).toBe('2026-08-11T22:30:00.000Z');
    expect(timing.overdueMinutes).toBe(0);
  });

  it('flags a missed leave-by time without pretending to track location', () => {
    const timing = journeyTiming(planned, 'planning', 20, undefined, new Date('2026-08-11T22:51:00.000Z'));
    expect(timing.overdueMinutes).toBe(11);
  });

  it('estimates arrival from the moment someone says they are heading out', () => {
    const timing = journeyTiming(planned, 'heading_out', 25, '2026-08-11T22:10:00.000Z');
    expect(timing.eta?.toISOString()).toBe('2026-08-11T22:35:00.000Z');
  });
});
