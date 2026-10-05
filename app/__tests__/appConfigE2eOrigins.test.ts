// The e2e build points the app at a loopback API and content host through E2E_API_BASE_URL and
// E2E_CONTENT_BASE_URL. Both accept only an http URL on a loopback host, so a build for a real
// environment can never be redirected by them; a bad value fails the load without echoing it.
import type { ExpoConfig } from 'expo/config';

const NAMES = ['E2E_API_BASE_URL', 'E2E_CONTENT_BASE_URL'] as const;
const originals = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

function loadExtra(): Record<string, unknown> {
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config').default as ExpoConfig;
  });
  return (config?.extra ?? {}) as Record<string, unknown>;
}

function readLoadError(): string {
  try {
    loadExtra();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('app.config e2e origins', () => {
  afterEach(() => {
    for (const name of NAMES) {
      const original = originals[name];
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  });

  it('keeps the production API and content URLs when the variables are unset', () => {
    for (const name of NAMES) delete process.env[name];
    const extra = loadExtra();
    expect(extra.apiBaseUrl).toBe('https://api.syntactical.dev/v1/');
    expect(extra.contentBaseUrl).toBe('https://syntactical.dev/content/');
  });

  it('uses loopback URLs from the variables', () => {
    process.env.E2E_API_BASE_URL = 'http://127.0.0.1:4101/v1/';
    process.env.E2E_CONTENT_BASE_URL = 'http://127.0.0.1:4100/content/';
    const extra = loadExtra();
    expect(extra.apiBaseUrl).toBe('http://127.0.0.1:4101/v1/');
    expect(extra.contentBaseUrl).toBe('http://127.0.0.1:4100/content/');
  });

  it.each([
    ['E2E_API_BASE_URL', 'https://api.example.com/v1/'],
    ['E2E_API_BASE_URL', 'http://example.com/v1/'],
    ['E2E_API_BASE_URL', 'http://127.0.0.1.example.com/v1/'],
    ['E2E_CONTENT_BASE_URL', 'http://evil.example/content/'],
    ['E2E_CONTENT_BASE_URL', 'not a url'],
  ])('refuses %s=%s without echoing it', (name, value) => {
    for (const key of NAMES) delete process.env[key];
    process.env[name] = value;
    const message = readLoadError();
    expect(message).toBe(`${name} must be an http URL on a loopback host`);
    expect(message).not.toContain(value);
  });
});
