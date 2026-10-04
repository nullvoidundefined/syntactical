// B-59.9 guards (pass today, unlocked): the apostrophe change is confined to match-only mode. The
// default mode (`clearPiiAttributes: true`, the deleted user's own and unlinked rows) still scrubs
// `o'ann@x.co` and `'ann@x.co'` under B-59.7, and match-only mode still scrubs a double-quoted or
// space-separated email, whose preceding character is not a local-part character.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';
const MATCH_ONLY = { clearPiiAttributes: false };
const SPEC_EMAIL = 'ann@x.co';

function specIdentity(): { email: string; userId: string } {
  return { email: SPEC_EMAIL, userId: randomUUID() };
}

describe('scrubPurchasePayload apostrophe guards (B-59.9)', () => {
  it("scrubs o'ann@x.co and 'ann@x.co' in the default mode, as values and keys", () => {
    const payload = { apostrophe: "o'ann@x.co", quoted: "'ann@x.co'", keys: { "o'ann@x.co": 1, "'ann@x.co'": 2 } };

    const scrubbed = scrubPurchasePayload(payload, specIdentity());

    expect(scrubbed).toMatchObject({ apostrophe: DELETED, quoted: DELETED });
    expect(JSON.stringify(scrubbed)).not.toContain(SPEC_EMAIL);
  });

  it('scrubs a double-quoted or space-separated email in match-only mode', () => {
    const payload = { doubleQuoted: '"ann@x.co"', spaced: 'contact ann@x.co today', kept: 'x' };

    expect(scrubPurchasePayload(payload, specIdentity(), MATCH_ONLY)).toStrictEqual({
      doubleQuoted: DELETED,
      spaced: DELETED,
      kept: 'x',
    });
  });
});
