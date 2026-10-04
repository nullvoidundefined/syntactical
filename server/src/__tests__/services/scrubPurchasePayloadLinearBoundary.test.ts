// B-59.11: the strict (match-only) boundary check reads the code point before an occurrence in
// O(1) instead of copying the prefix, so a string made of many repeated near-miss occurrences
// (`xann@x.co `, where the letter before each email keeps it unmatched) scrubs in linear time.
// The large case uses about 200 kB, where a prefix copy per occurrence costs seconds and a linear
// check costs milliseconds, so a generous bound separates them even under heavy machine load.
// The bound is the spec's 10 kB rate (50 ms) scaled linearly; the 10 kB case itself is in the guards file.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const MATCH_ONLY = { clearPiiAttributes: false };
const SPEC_EMAIL = 'ann@x.co';
const NEAR_MISS = 'xann@x.co ';
const LARGE_REPEATS = 20_000;
const LARGE_BOUND_MS = 1_000;
const LARGE_TIMEOUT_MS = 120_000;

function specIdentity(): { email: string; userId: string } {
  return { email: SPEC_EMAIL, userId: randomUUID() };
}

function timeMatchOnlyScrub(text: string): { elapsedMs: number; scrubbed: unknown } {
  const started = performance.now();
  const scrubbed = scrubPurchasePayload({ near: text }, specIdentity(), MATCH_ONLY);
  return { elapsedMs: performance.now() - started, scrubbed };
}

describe('scrubPurchasePayload linear boundary check in match-only mode (B-59.11)', () => {
  it(
    'keeps about 200 kB of repeated near-miss occurrences in under a second',
    () => {
      const text = NEAR_MISS.repeat(LARGE_REPEATS);

      const { elapsedMs, scrubbed } = timeMatchOnlyScrub(text);

      expect(scrubbed).toStrictEqual({ near: text });
      expect(elapsedMs).toBeLessThan(LARGE_BOUND_MS);
    },
    LARGE_TIMEOUT_MS,
  );
});
