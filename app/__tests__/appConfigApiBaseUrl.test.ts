// The API base URL is the production host unless API_BASE_URL (a staging build) overrides it with an
// https URL ending in a slash; a bad value fails the load without echoing it.
import type { ExpoConfig } from 'expo/config';

const originalValue = process.env.API_BASE_URL;

function loadApiBaseUrl(): unknown {
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config').default as ExpoConfig;
  });
  return (config?.extra as Record<string, unknown> | undefined)?.apiBaseUrl;
}

describe('app.config API base URL', () => {
  afterEach(() => {
    if (originalValue === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalValue;
  });

  it('defaults to the production API', () => {
    delete process.env.API_BASE_URL;
    expect(loadApiBaseUrl()).toBe('https://api.syntactical.dev/v1/');
  });

  it('uses API_BASE_URL for a staging build', () => {
    process.env.API_BASE_URL = 'https://staging-api.example.test/v1/';
    expect(loadApiBaseUrl()).toBe('https://staging-api.example.test/v1/');
  });

  it('falls back to the production API when API_BASE_URL is empty', () => {
    process.env.API_BASE_URL = '';
    expect(loadApiBaseUrl()).toBe('https://api.syntactical.dev/v1/');
  });

  it.each(['http://api.example.test/v1/', 'https://api.example.test/v1', 'https://'])(
    'refuses %s without echoing it',
    (value) => {
      process.env.API_BASE_URL = value;
      let message = '';
      try {
        loadApiBaseUrl();
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toBe('API_BASE_URL must be an https URL that ends with a slash');
      expect(message).not.toContain(value);
    },
  );

  it('declares that the app uses no non-exempt encryption', () => {
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
      config = require('../../app.config').default as ExpoConfig;
    });
    expect(config?.ios?.config?.usesNonExemptEncryption).toBe(false);
  });
});
