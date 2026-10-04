// The PostHog project key reaches the bundle only from POSTHOG_KEY, and only
// with its public prefix (phc_); an unset key stays undefined (analytics is then
// a no-op), and a bad value fails the load without echoing it. Keys are built
// at run time so no credential-shaped literal sits in source.
import { randomBytes } from 'node:crypto';

import type { ExpoConfig } from 'expo/config';

const originalKey = process.env.POSTHOG_KEY;
const originalHost = process.env.POSTHOG_HOST;

function loadExtra(): Record<string, unknown> {
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config').default as ExpoConfig;
  });
  return (config?.extra ?? {}) as Record<string, unknown>;
}

describe('app.config PostHog key', () => {
  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_KEY;
    else process.env.POSTHOG_KEY = originalKey;
    if (originalHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalHost;
  });

  it('carries a public-prefixed key in extra', () => {
    const key = `phc_${randomBytes(12).toString('hex')}`;
    process.env.POSTHOG_KEY = key;
    expect(loadExtra().posthogKey).toBe(key);
  });

  it('leaves the key undefined when unset', () => {
    delete process.env.POSTHOG_KEY;
    expect(loadExtra().posthogKey).toBeUndefined();
  });

  it('refuses a personal API key shape without echoing it', () => {
    const value = `phx_${randomBytes(12).toString('hex')}`;
    process.env.POSTHOG_KEY = value;
    let error: unknown = null;
    try {
      loadExtra();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('POSTHOG_KEY');
    expect((error as Error).message).not.toContain(value);
  });

  it('carries an https host and leaves an unset host undefined', () => {
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
    expect(loadExtra().posthogHost).toBe('https://eu.i.posthog.com');
    delete process.env.POSTHOG_HOST;
    expect(loadExtra().posthogHost).toBeUndefined();
  });

  it.each(['http://insecure.example.test', 'eu.i.posthog.com', 'ftp://example.test'])(
    'refuses a non-https host without echoing it: %s',
    (value) => {
      process.env.POSTHOG_HOST = value;
      let error: unknown = null;
      try {
        loadExtra();
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('POSTHOG_HOST');
      expect((error as Error).message).not.toContain(value);
    },
  );
});
