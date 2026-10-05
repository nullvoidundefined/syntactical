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

  it('serves from the root when EXPO_BASE_URL is empty', () => {
    const emptyConfig = loadAppConfig('');
    expect(readContentBaseUrl(emptyConfig)).toBe(LIVE_CONTENT_URL);
    expect(emptyConfig.experiments?.baseUrl).toBe('');
  });

  it('accepts a multi-segment lowercase sub-path', () => {
    const nestedConfig = loadAppConfig('/a/b-2');
    expect(readContentBaseUrl(nestedConfig)).toBe('https://syntactical.dev/a/b-2/content/');
    expect(nestedConfig.experiments?.baseUrl).toBe('/a/b-2');
  });

  it.each([
    ['a protocol-relative host', '//evil.example'],
    ['an absolute https URL', 'https://evil.example'],
    ['an absolute URL with a path', 'https://evil.example/preview'],
    ['a path without a leading slash', 'preview'],
    ['a trailing slash', '/preview/'],
    ['a bare slash', '/'],
    ['a parent segment', '/../x'],
    ['a current segment', '/./x'],
    ['uppercase', '/Preview'],
    ['whitespace', '/pre view'],
    ['a backslash', '/\\evil.example'],
    ['a query', '/preview?x=1'],
    ['a fragment', '/preview#x'],
    ['a segment starting with a hyphen', '/-x'],
    ['an empty middle segment', '/a//b'],
  ])('rejects %s at config load without echoing the value', (_label, badValue) => {
    let thrown: unknown;
    try {
      loadAppConfig(badValue);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('EXPO_BASE_URL');
    expect((thrown as Error).message).not.toContain(badValue);
  });
});
