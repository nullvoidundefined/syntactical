// Jest setup: AsyncStorage's in-memory mock, a fetch that never resolves
// unless a test replaces it (so no test reaches the network), and an
// expo-constants stand-in (config/expoConstantsMock.ts) that supplies the content base URL, and the
// worklets mock reanimated 4 needs under Jest. expo-crypto's native
// randomUUID is absent under Jest, so Node's own UUID v4 stands in for it.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

jest.mock('expo-constants', () => require('./config/expoConstantsMock').expoConstantsMock);

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

// PostHog stays inert under Jest; no analytics key is configured, so the client
// never constructs it. Suites that exercise the client install their own mock.
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// react-dom/server, which the static-render suites import, needs TextEncoder, TextDecoder, and MessageChannel;
// Jest's jsdom environment lacks them. Node's own stand in, only where the environment has none.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}
// Node's own MessageChannel would hold an open handle once react-dom/server listens on it, so a single-suite run
// never exits. renderToString never posts to it; this stand-in delivers a posted message on a timer.
if (typeof globalThis.MessageChannel === 'undefined') {
  class TestMessagePort {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    peer: TestMessagePort | null = null;
    close() {}
    postMessage(data: unknown) {
      setTimeout(() => this.peer?.onmessage?.({ data }), 0);
    }
    start() {}
  }
  class TestMessageChannel {
    port1 = new TestMessagePort();
    port2 = new TestMessagePort();
    constructor() {
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  }
  globalThis.MessageChannel = TestMessageChannel as unknown as typeof globalThis.MessageChannel;
}
