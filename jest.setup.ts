// Jest setup: AsyncStorage's in-memory mock, a fetch that never resolves
// unless a test replaces it (so no test reaches the network), and an
// expo-constants stand-in that supplies the content base URL, and the
// worklets mock reanimated 4 needs under Jest. expo-crypto's native
// randomUUID is absent under Jest, so Node's own UUID v4 stands in for it.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { contentBaseUrl: 'https://example.test/content/' } },
}));

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => require('node:crypto').randomUUID(),
}));

// NetInfo's native module is absent under Jest; its official mock stands in.
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

// The RevenueCat SDKs are absent or ESM-only under Jest; inert stand-ins keep
// AuthProvider importable. Suites that exercise them install their own mocks.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    isConfigured: jest.fn(() => Promise.resolve(false)),
    logIn: jest.fn(() => Promise.resolve({})),
    logOut: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('@revenuecat/purchases-js', () => ({
  __esModule: true,
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: jest.fn(), getSharedInstance: jest.fn(), isConfigured: jest.fn(() => false) },
  PurchasesError: class PurchasesError extends Error {},
}));
