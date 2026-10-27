// app/__tests__/appConfigEthicalAds.test.ts
// The EthicalAds publisher id reaches extra only as a lowercase slug; unset leaves it undefined, and any
// other value stops the config from loading without echoing the value.
import type { ExpoConfig } from 'expo/config';

const ORIGINAL = process.env.ETHICALADS_PUBLISHER;

function loadExtra(): Record<string, unknown> {
  let loaded: ExpoConfig | undefined;
  jest.isolateModules(() => {
    loaded = require('../../app.config').default as ExpoConfig;
  });
  return (loaded?.extra ?? {}) as Record<string, unknown>;
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ETHICALADS_PUBLISHER;
  else process.env.ETHICALADS_PUBLISHER = ORIGINAL;
});

describe('app.config EthicalAds publisher', () => {
  it('leaves the publisher undefined when unset or empty', () => {
    delete process.env.ETHICALADS_PUBLISHER;
    expect(loadExtra().ethicalAdsPublisher).toBeUndefined();
    process.env.ETHICALADS_PUBLISHER = '';
    expect(loadExtra().ethicalAdsPublisher).toBeUndefined();
  });

  it('carries a slug publisher id', () => {
    process.env.ETHICALADS_PUBLISHER = 'syntactical-dev';
    expect(loadExtra().ethicalAdsPublisher).toBe('syntactical-dev');
  });

  it.each([['Syntactical'], ['syntactical dev'], ['"><script>'], ['-leading'], ['a'.repeat(65)]])(
    'refuses %j without echoing it',
    (value) => {
      process.env.ETHICALADS_PUBLISHER = value;
      let error: unknown = null;
      try {
        loadExtra();
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('ETHICALADS_PUBLISHER must be a lowercase slug');
    },
  );
});
