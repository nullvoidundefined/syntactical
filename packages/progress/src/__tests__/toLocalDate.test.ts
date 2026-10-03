// B-34 and Review Focus 2: an instant maps to the calendar date in the
// user's IANA timezone, across DST changes, and an unknown zone throws.
import { describe, expect, it } from 'vitest';

import { toLocalDate } from '../toLocalDate.js';

describe('toLocalDate', () => {
    it('counts 00:05 in Auckland as the next local day (Review Focus 2)', () => {
        expect(toLocalDate('2026-10-02T11:05:00Z', 'Pacific/Auckland')).toBe('2026-10-03');
    });

    it('keeps 23:55 in Auckland on the same local day', () => {
        expect(toLocalDate('2026-10-02T10:55:00Z', 'Pacific/Auckland')).toBe('2026-10-02');
    });

    it('uses the daylight offset after Auckland springs forward', () => {
        // 2026-09-27 02:00 NZST becomes 03:00 NZDT (+13); +12 would give 09-27.
        expect(toLocalDate('2026-09-27T11:30:00Z', 'Pacific/Auckland')).toBe('2026-09-28');
        // Before the change, +12 applies: 11:30Z on 09-26 is 23:30 local.
        expect(toLocalDate('2026-09-26T11:30:00Z', 'Pacific/Auckland')).toBe('2026-09-26');
    });

    it('uses the standard offset after New York falls back', () => {
        // 2026-11-01 02:00 EDT becomes 01:00 EST (-5); -4 would give 11-02.
        expect(toLocalDate('2026-11-02T04:30:00Z', 'America/New_York')).toBe('2026-11-01');
        // Before the change, -4 applies: 03:30Z on 10-31 is 23:30 on 10-30.
        expect(toLocalDate('2026-10-31T03:30:00Z', 'America/New_York')).toBe('2026-10-30');
    });

    it('puts an evening answer west of UTC on the previous UTC date', () => {
        expect(toLocalDate('2026-10-03T06:59:00Z', 'America/Los_Angeles')).toBe('2026-10-02');
        expect(toLocalDate('2026-10-03T07:00:00Z', 'America/Los_Angeles')).toBe('2026-10-03');
    });

    it('returns the UTC date for UTC', () => {
        expect(toLocalDate('2026-12-31T23:59:59Z', 'UTC')).toBe('2026-12-31');
    });

    it('honours an explicit offset in the instant', () => {
        expect(toLocalDate('2026-10-03T00:30:00+02:00', 'UTC')).toBe('2026-10-02');
    });

    it('throws on an unknown timezone instead of falling back to UTC', () => {
        expect(() => toLocalDate('2026-10-02T11:05:00Z', 'Mars/Olympus_Mons')).toThrow(RangeError);
        expect(() => toLocalDate('2026-10-02T11:05:00Z', '')).toThrow(RangeError);
    });

    it('throws on a timezone that is not a string instead of using the host zone', () => {
        const missingZone = undefined as unknown as string;
        expect(() => toLocalDate('2026-10-02T11:05:00Z', missingZone)).toThrow(RangeError);
    });

    it('throws on an instant that is not a valid date', () => {
        expect(() => toLocalDate('not a date', 'UTC')).toThrow(RangeError);
    });
});
