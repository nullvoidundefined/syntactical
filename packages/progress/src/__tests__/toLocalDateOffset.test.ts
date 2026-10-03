// B-34 review fix: an instant without Z or an explicit offset would be read
// in the host zone, so toLocalDate refuses it instead of guessing.
import { expect, it } from 'vitest';

import { toLocalDate } from '../toLocalDate.js';

it('throws on an instant with no Z or explicit offset', () => {
    expect(() => toLocalDate('2026-10-02T11:05:00', 'Pacific/Auckland')).toThrow(RangeError);
    expect(() => toLocalDate('2026-10-02', 'UTC')).toThrow(RangeError);
    expect(() => toLocalDate('Fri, 02 Oct 2026 11:05:00 GMT', 'UTC')).toThrow(RangeError);
});
