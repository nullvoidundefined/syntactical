// packages/content-schema/src/__tests__/validateSponsor.test.ts
// content/sponsor.json, the direct sponsor: a headline, one body line, an https link, an optional icon path
// under content/, and inclusive start and end dates. An expired sponsor is valid (the app skips it at run
// time); a malformed one is rejected with the first rule it breaks.
import { describe, expect, it } from 'vitest';

import * as schema from '../index.js';
import { validateSponsor } from '../validateSponsor.js';

function buildSponsor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    body: 'Managed Postgres with branching for every pull request.',
    endsOn: '2026-12-31',
    headline: 'Neon',
    href: 'https://neon.tech',
    iconPath: 'sponsor/neon.png',
    startsOn: '2026-11-01',
    ...overrides,
  };
}

describe('validateSponsor', () => {
  it('is exported from the package', () => {
    expect(schema).toHaveProperty('validateSponsor');
  });

  it('accepts a full sponsor, unchanged', () => {
    const input = buildSponsor();
    expect(validateSponsor(input)).toEqual({ isValid: true, sponsor: input });
  });

  it('accepts a sponsor without an icon, and one that has already ended', () => {
    const { iconPath: _icon, ...withoutIcon } = buildSponsor({ endsOn: '2020-01-31', startsOn: '2020-01-01' });
    expect(validateSponsor(withoutIcon)).toEqual({ isValid: true, sponsor: withoutIcon });
  });

  it('accepts a one-day sponsor', () => {
    expect(validateSponsor(buildSponsor({ endsOn: '2026-11-01' })).isValid).toBe(true);
  });

  it.each([
    ['null', null, 'root shape is invalid'],
    ['an array', [], 'root shape is invalid'],
    ['an unknown key', buildSponsor({ productId: 'x' }), 'productId is not allowed'],
    ['a missing headline', buildSponsor({ headline: undefined }), 'headline is invalid'],
    ['an empty headline', buildSponsor({ headline: '' }), 'headline is invalid'],
    ['a long headline', buildSponsor({ headline: 'h'.repeat(121) }), 'headline is invalid'],
    ['a long body', buildSponsor({ body: 'b'.repeat(121) }), 'body is invalid'],
    ['an http link', buildSponsor({ href: 'http://neon.tech' }), 'href is invalid'],
    ['a javascript link', buildSponsor({ href: 'javascript:alert(1)' }), 'href is invalid'],
    ['an icon outside content', buildSponsor({ iconPath: '../secret.png' }), 'iconPath is invalid'],
    ['an absolute icon URL', buildSponsor({ iconPath: 'https://evil.test/a.png' }), 'iconPath is invalid'],
    ['an svg icon', buildSponsor({ iconPath: 'sponsor/neon.svg' }), 'iconPath is invalid'],
    ['a timestamp start', buildSponsor({ startsOn: '2026-11-01T00:00:00Z' }), 'startsOn is invalid'],
    ['an impossible start', buildSponsor({ startsOn: '2026-02-30' }), 'startsOn is invalid'],
    ['a missing end', buildSponsor({ endsOn: undefined }), 'endsOn is invalid'],
    ['an end before the start', buildSponsor({ endsOn: '2026-10-31' }), 'endsOn is before startsOn'],
  ])('rejects %s', (_name, input, rule) => {
    const cleaned =
      input && typeof input === 'object' && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : input;
    expect(validateSponsor(cleaned)).toEqual({ isValid: false, rule });
  });
});
