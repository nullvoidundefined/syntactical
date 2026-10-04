import type { ExpoConfig } from 'expo/config';

const LIVE_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/content/';
const PREVIEW_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/preview/content/';
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

  it('uses the live content URL when EXPO_BASE_URL is unset or /syntactical', () => {
    const defaultConfig = loadAppConfig(undefined);
    expect(readContentBaseUrl(defaultConfig)).toBe(LIVE_CONTENT_URL);
    expect(defaultConfig.experiments?.baseUrl).toBe('/syntactical');

    const explicitConfig = loadAppConfig('/syntactical');
    expect(readContentBaseUrl(explicitConfig)).toBe(LIVE_CONTENT_URL);
    expect(explicitConfig.experiments?.baseUrl).toBe('/syntactical');
  });

  it('uses the preview content URL for /syntactical/preview', () => {
    const previewConfig = loadAppConfig('/syntactical/preview');
    expect(readContentBaseUrl(previewConfig)).toBe(PREVIEW_CONTENT_URL);
    expect(previewConfig.experiments?.baseUrl).toBe('/syntactical/preview');
  });
});
