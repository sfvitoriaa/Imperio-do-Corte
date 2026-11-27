import {
  businessDateKey,
  businessDateTime,
  businessDayBounds,
  businessMinutes,
  businessWeekday,
} from './business-time.js';

describe('business time helpers', () => {
  it('converts company-local date and time to the correct UTC instant', () => {
    const instant = businessDateTime('2026-11-30', '09:30');

    expect(instant.toISOString()).toBe('2026-11-30T12:30:00.000Z');
    expect(businessDateKey(instant)).toBe('2026-11-30');
    expect(businessMinutes(instant)).toBe(570);
  });

  it('builds local-day ranges and weekdays across UTC date boundaries', () => {
    const bounds = businessDayBounds('2026-11-30');

    expect(bounds.start.toISOString()).toBe('2026-11-30T03:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(businessWeekday('2026-11-30')).toBe(1);
    expect(businessDateKey(new Date('2026-12-01T02:59:00.000Z'))).toBe('2026-11-30');
  });
});
