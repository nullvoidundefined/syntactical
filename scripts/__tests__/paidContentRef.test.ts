// The API image stages the private paid banks at the exact commit in content/paid-content.ref, so
// the file must exist and hold one 40 character lowercase hex commit sha.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('content/paid-content.ref', () => {
  it('holds exactly one 40 character lowercase hex commit sha', () => {
    const text = readFileSync(join(__dirname, '..', '..', 'content', 'paid-content.ref'), 'utf8');

    expect(text).toMatch(/^[0-9a-f]{40}\n?$/);
  });
});
