import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { newReviewItem, scheduleReview } from '../scheduleReview.js';
import { SCHEDULER_PARAMETERS } from '../schedulerParameters.js';

const MINUTE_MS = 60_000;
const AT = '2026-09-20T10:00:00Z';

it('pins ts-fsrs to an exact version so server replay cannot drift', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(manifest.dependencies['ts-fsrs']).toMatch(/^\d+\.\d+\.\d+$/);
});

it('states every scheduling parameter the replay depends on', () => {
    expect(SCHEDULER_PARAMETERS).toEqual({
        enable_fuzz: false,
        enable_short_term: true,
        learning_steps: ['1m', '10m'],
        maximum_interval: 36500,
        relearning_steps: ['10m'],
        request_retention: 0.9,
    });
});

it('follows the stated learning steps: a miss on a new item is due in 1 minute, a correct answer in 10', () => {
    const fresh = newReviewItem('q', AT);
    expect(scheduleReview(fresh, false, AT).card.due.getTime() - Date.parse(AT)).toBe(MINUTE_MS);
    expect(scheduleReview(fresh, true, AT).card.due.getTime() - Date.parse(AT)).toBe(10 * MINUTE_MS);
});
