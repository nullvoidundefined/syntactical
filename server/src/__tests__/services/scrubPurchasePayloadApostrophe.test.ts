// B-59.9: the apostrophe is a local-part character (the app's zod `z.email()` accepts it in a local
// part), so in match-only mode (`clearPiiAttributes: false`, rows linked to another user) an email
// with an apostrophe directly before it names another address and is kept, as a value and as a key,
// raw or percent-encoded. A quoted `'ann@x.co'` is kept too: the quote itself sits directly before
// the email. The default mode still scrubs both under B-59.7 (guards file).
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const MATCH_ONLY = { clearPiiAttributes: false };
const SPEC_EMAIL = 'ann@x.co';

function specIdentity(): { email: string; userId: string } {
  return { email: SPEC_EMAIL, userId: randomUUID() };
}

describe('scrubPurchasePayload apostrophe before the email in match-only mode (B-59.9)', () => {
  it("keeps o'ann@x.co as a value", () => {
    const payload = { event: { subscriber: "o'ann@x.co", kept: 'x' } };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      event: { subscriber: "o'ann@x.co", kept: 'x' },
    });
  });

  it("keeps o'ann@x.co as a key", () => {
    const payload = { aliases: { "o'ann@x.co": 1 } };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      aliases: { "o'ann@x.co": 1 },
    });
  });

  it("keeps a single-quoted 'ann@x.co' as a value and as a key", () => {
    const payload = { quoted: "'ann@x.co'", keys: { "'ann@x.co'": 2 } };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      quoted: "'ann@x.co'",
      keys: { "'ann@x.co'": 2 },
    });
  });

  it('keeps the percent-encoded o%27ann%40x.co as a value', () => {
    const payload = { encoded: 'o%27ann%40x.co' };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({ encoded: 'o%27ann%40x.co' });
  });
});
