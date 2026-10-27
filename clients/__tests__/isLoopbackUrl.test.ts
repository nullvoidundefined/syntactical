// clients/__tests__/isLoopbackUrl.test.ts
// The guard that picks the fixture purchase store: true only for an http URL on a loopback host
// (any port), which only the e2e build's API base URL can be; false for https, other hosts,
// lookalikes, user-info tricks, and text that is not a URL. Its host list matches app.config.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOOPBACK_HOSTS, isLoopbackUrl } from '../isLoopbackUrl';

describe('isLoopbackUrl', () => {
  it.each([
    'http://127.0.0.1:4711/v1/',
    'http://localhost:4711/v1/',
    'http://[::1]:4711/v1/',
    'http://LOCALHOST/v1/',
    'http://127.0.0.1/',
    'http://localhost',
  ])('is true for %s', (value) => {
    expect(isLoopbackUrl(value)).toBe(true);
  });

  it.each([
    ['https on loopback', 'https://127.0.0.1:4711/v1/'],
    ['the production API', 'https://api.syntactical.dev/v1/'],
    ['a lookalike host', 'http://localhost.evil.example/v1/'],
    ['a loopback name as user info', 'http://localhost@evil.example/v1/'],
    ['another private address', 'http://10.0.0.2:4711/v1/'],
    ['a relative path', '/v1/'],
    ['an empty string', ''],
    ['no value', null],
  ])('is false for %s', (_label, value) => {
    expect(isLoopbackUrl(value)).toBe(false);
  });

  it('accepts exactly the loopback hosts app.config.ts accepts for E2E_API_BASE_URL', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'app.config.ts'), 'utf8');
    const line = /const LOOPBACK_HOSTS = new Set\((\[.*\])\);/.exec(config)?.[1] ?? '';
    const configHosts = [...line.matchAll(/'([^']+)'/g)].map(([, host]) => host);
    expect([...LOOPBACK_HOSTS].sort()).toEqual(configHosts.sort());
    expect(configHosts).toHaveLength(3);
  });
});
