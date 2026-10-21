// The expo-constants stand-in jest.setup.ts installs: the default extra carries
// the content base URL, setExpoExtra replaces the whole extra for the suite, and
// the replacement survives a module reset the way a re-run factory did.
import Constants from 'expo-constants';

import { expoConstantsMock, setExpoExtra } from '../expoConstantsMock';

describe('expoConstantsMock', () => {
  it('is what expo-constants resolves to, with the content base URL by default', () => {
    expect(Constants).toBe(expoConstantsMock);
    expect(Constants.expoConfig?.extra).toEqual({ contentBaseUrl: 'https://example.test/content/' });
  });

  it('setExpoExtra replaces the whole extra and the change survives jest.resetModules', () => {
    setExpoExtra({ apiBaseUrl: 'https://api.example.test/v1/' });
    expect(Constants.expoConfig?.extra).toEqual({ apiBaseUrl: 'https://api.example.test/v1/' });

    jest.resetModules();
    const fresh = jest.requireMock<typeof Constants>('expo-constants');
    expect(fresh.expoConfig?.extra).toEqual({ apiBaseUrl: 'https://api.example.test/v1/' });
  });
});
