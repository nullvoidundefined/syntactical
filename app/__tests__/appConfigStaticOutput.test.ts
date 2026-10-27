// app/__tests__/appConfigStaticOutput.test.ts
// The web build is a static export bundled by Metro: expo export writes one HTML page per route (the dynamic routes
// expanded by generateStaticParams) instead of a single index.html.
import type { ExpoConfig } from 'expo/config';

function loadAppConfig(): ExpoConfig {
  let loadedConfig: ExpoConfig | undefined;
  jest.isolateModules(() => {
    loadedConfig = require('../../app.config').default as ExpoConfig;
  });
  return loadedConfig as ExpoConfig;
}

describe('app.config web output', () => {
  it('exports a static page per route, bundled by Metro', () => {
    expect(loadAppConfig().web).toEqual({ bundler: 'metro', output: 'static' });
  });
});
