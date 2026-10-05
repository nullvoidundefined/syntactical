import type { ExpoConfig } from 'expo/config';

const LIVE_CONTENT_URL = 'https://syntactical.dev/content/';
const PREVIEW_CONTENT_URL = 'https://syntactical.dev/preview/content/';
const originalBaseUrl = process.env.EXPO_BASE_URL;

function setBaseUrl(baseUrl: string | undefined): void {
  if (baseUrl === undefined) {
    delete process.env.EXPO_BASE_URL;
    return;
  }
  process.env.EXPO_BASE_URL = baseUrl;
}

function loadAppConfig(baseUrl: string | undefined): ExpoConfig {
  setBaseUrl(baseUrl);
  let loadedConfig: ExpoConfig | undefined;
  jest.isolateModules(() => {
    loadedConfig = require('../../app.config').default as ExpoConfig;
  });
  return loadedConfig as ExpoConfig;
}

function readContentBaseUrl(config: ExpoConfig): unknown {
  return (config.extra as Record<string, unknown> | undefined)?.contentBaseUrl;
}

describe('app.config content base URL', () => {
  afterEach(() => {
    setBaseUrl(originalBaseUrl);
  });

  it('serves from the root with the production content URL when EXPO_BASE_URL is unset', () => {
    const defaultConfig = loadAppConfig(undefined);
    expect(readContentBaseUrl(defaultConfig)).toBe(LIVE_CONTENT_URL);
    expect(defaultConfig.experiments?.baseUrl).toBe('');
    expect((defaultConfig.extra as Record<string, unknown>).apiBaseUrl).toBe('https://api.syntactical.dev/v1/');
  });

  it('uses the preview content URL for /preview', () => {
    const previewConfig = loadAppConfig('/preview');
    expect(readContentBaseUrl(previewConfig)).toBe(PREVIEW_CONTENT_URL);
    expect(previewConfig.experiments?.baseUrl).toBe('/preview');
  });
});
