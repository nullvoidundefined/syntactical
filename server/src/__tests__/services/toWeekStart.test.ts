// A local date maps to the Monday of its week, across month and year ends.
import { describe, expect, it } from 'vitest';

import { toWeekStart } from '../../services/toWeekStart.js';

describe('toWeekStart', () => {
  it.each([
    ['2026-10-19', '2026-10-19'],
    ['2026-10-21', '2026-10-19'],
    ['2026-10-25', '2026-10-19'],
    ['2026-10-26', '2026-10-26'],
    ['2026-11-01', '2026-10-26'],
    ['2027-01-02', '2026-12-28'],
  ])('maps %s to %s', (localDate, monday) => {
    expect(toWeekStart(localDate)).toBe(monday);
  });
});
