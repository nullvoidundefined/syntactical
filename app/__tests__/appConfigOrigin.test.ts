import type { ExpoConfig } from 'expo/config';

const LIVE_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/content/';
const PREVIEW_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/preview/content/';
const REJECTED_BASE_PATHS = [
  '@evil.example',
  '.evil.example',
  ':8443/x',
  'syntactical',
  '/Syntactical',
  '/syntactical/../x',
  '',
];

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

describe('app.config content origin pin', () => {
  afterEach(() => {
    setBaseUrl(originalBaseUrl);
  });

  it.each(REJECTED_BASE_PATHS)('throws at config load for EXPO_BASE_URL %j', (baseUrl) => {
    expect(() => loadAppConfig(baseUrl)).toThrow(/EXPO_BASE_URL/);
  });

  it('pins an unset and an explicit /syntactical to the live content URL, and throws for /syntactical/', () => {
    const defaultConfig = loadAppConfig(undefined);
    expect(readContentBaseUrl(defaultConfig)).toBe(LIVE_CONTENT_URL);
    expect(defaultConfig.experiments?.baseUrl).toBe('/syntactical');

    const explicitConfig = loadAppConfig('/syntactical');
    expect(readContentBaseUrl(explicitConfig)).toBe(LIVE_CONTENT_URL);
    expect(explicitConfig.experiments?.baseUrl).toBe('/syntactical');

    expect(() => loadAppConfig('/syntactical/')).toThrow(/EXPO_BASE_URL/);
  });

  it('pins /syntactical/preview to the preview content URL, and throws for /syntactical/preview/../x', () => {
    const previewConfig = loadAppConfig('/syntactical/preview');
    expect(readContentBaseUrl(previewConfig)).toBe(PREVIEW_CONTENT_URL);
    expect(previewConfig.experiments?.baseUrl).toBe('/syntactical/preview');

    expect(() => loadAppConfig('/syntactical/preview/../x')).toThrow(/EXPO_BASE_URL/);
  });
});
