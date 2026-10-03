// B-3.4 (B-28): the session cookie is Secure in every environment except NODE_ENV=test
// (owner policy 2026-10-03), so a development server never trains a client on an insecure cookie.
import { describe, expect, it } from 'vitest';

import { isCookieSecure } from '../../config/isCookieSecure.js';

describe('isCookieSecure', () => {
  it('is true in production and development', () => {
    expect(isCookieSecure('production')).toBe(true);
    expect(isCookieSecure('development')).toBe(true);
  });

  it('is false only under test', () => {
    expect(isCookieSecure('test')).toBe(false);
  });
});
