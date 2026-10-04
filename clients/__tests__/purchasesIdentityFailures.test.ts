// Native purchaser identity (B-38c): a logIn that never settles cannot hold a
// later sign-out's logOut back for more than 10 seconds, so a hung SDK call
// never leaves the next user's purchases attributed to the previous user; the
// sign-in after that sign-out then logs the next user in, in order, and no
// user id reaches the console.
import { randomBytes, randomUUID } from 'node:crypto';

type SdkEvent = { kind: 'configure'; key: unknown } | { kind: 'logIn'; userId: string } | { kind: 'logOut' };

type Deferred = { promise: Promise<unknown>; resolve(value?: unknown): void; reject(error: unknown): void };

type NativePurchasesMock = {
  default: { configure: jest.Mock; isConfigured: jest.Mock; logIn: jest.Mock; logOut: jest.Mock };
  mockEvents: SdkEvent[];
  mockState: {
    isConfigured: boolean;
    // 'hold' leaves the call pending on a deferred the test settles (or never does).
    logIn: { kind: 'resolve' } | { kind: 'reject'; error: Error } | { kind: 'hold'; deferred: Deferred };
    logOut: { kind: 'resolve' } | { kind: 'reject'; error: Error };
  };
};

const mockConstants: { expoConfig: { extra: Record<string, unknown> } } = { expoConfig: { extra: {} } };

jest.mock('expo-constants', () => mockConstants);

jest.mock('react-native-purchases', () => {
  const mockEvents: SdkEvent[] = [];
  const mockState: NativePurchasesMock['mockState'] = {
    isConfigured: false,
    logIn: { kind: 'resolve' },
    logOut: { kind: 'resolve' },
  };
  const Purchases = {
    configure: jest.fn((configuration: Record<string, unknown>) => {
      mockEvents.push({ kind: 'configure', key: configuration['apiKey'] });
      mockState.isConfigured = true;
    }),
    isConfigured: jest.fn(() => Promise.resolve(mockState.isConfigured)),
    logIn: jest.fn((userId: string) => {
      if (!mockState.isConfigured) return Promise.reject(new Error('not configured'));
      mockEvents.push({ kind: 'logIn', userId });
      const behaviour = mockState.logIn;
      if (behaviour.kind === 'reject') return Promise.reject(behaviour.error);
      if (behaviour.kind === 'hold') return behaviour.deferred.promise;
      return Promise.resolve({ customerInfo: {}, created: false });
    }),
    logOut: jest.fn(() => {
      if (!mockState.isConfigured) return Promise.reject(new Error('not configured'));
      mockEvents.push({ kind: 'logOut' });
      const behaviour = mockState.logOut;
      if (behaviour.kind === 'reject') return Promise.reject(behaviour.error);
      return Promise.resolve({});
    }),
  };
  return { __esModule: true, default: Purchases, mockEvents, mockState };
});

type IdentityModule = typeof import('../purchasesIdentity');

type Loaded = { identity: IdentityModule; sdk: NativePurchasesMock };

function buildKey(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function buildDeferred(): Deferred {
  let resolve: (value?: unknown) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// Loads the identity module, the SDK mock, and react-native from one fresh
// registry, so each test starts unconfigured with an empty call queue, on the
// given platform, with the given extra keys.
function loadIdentity(platform: 'ios' | 'android', extra: Record<string, unknown>): Loaded {
  mockConstants.expoConfig.extra = extra;
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    // The module reads Platform.OS at call time; only Platform is replaced.
    jest.doMock('react-native', () => {
      const actual = jest.requireActual('react-native') as Record<string, unknown> & { Platform: object };
      const platformModule = { ...actual.Platform, OS: platform };
      return new Proxy(actual, {
        get: (target, property) => (property === 'Platform' ? platformModule : target[property as string]),
      });
    });
    const sdk = require('react-native-purchases') as NativePurchasesMock;
    const identity = require('../purchasesIdentity') as IdentityModule;
    loaded = { identity, sdk };
  });
  if (!loaded) throw new Error('expected the purchaser identity module to load');
  return loaded;
}

function bothKeys(): Record<string, string> {
  return { revenueCatAppleKey: buildKey('appl'), revenueCatGoogleKey: buildKey('goog') };
}

// Lets queued promise callbacks run without moving any clock.
async function drain(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await Promise.resolve();
  }
}

function eventKinds(sdk: NativePurchasesMock): string[] {
  return sdk.mockEvents.map((event) => (event.kind === 'logIn' ? `logIn:${event.userId}` : event.kind));
}

function captureWarnings(): { messages(): string[]; serialised(): string; restore(): void } {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((name) => jest.spyOn(console, name).mockImplementation(() => undefined));
  const warnSpy = spies[methods.indexOf('warn')];
  function render(arg: unknown): string {
    if (arg instanceof Error) return `${arg.name} ${arg.message} ${arg.stack ?? ''}`;
    return typeof arg === 'string' ? arg : JSON.stringify(arg);
  }
  return {
    messages: () => warnSpy.mock.calls.map((args) => args.map(render).join(' ')),
    serialised: () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(render).join(' '))).join('\n'),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

describe('native purchaser identity: a logIn that never settles', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets a later sign-out log out within 10 seconds when logIn never settles, and a following sign-in then logs the next user in', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const { identity, sdk } = loadIdentity('ios', bothKeys());
    const first = randomUUID();
    const second = randomUUID();
    sdk.mockState.logIn = { kind: 'hold', deferred: buildDeferred() };
    const consoleCapture = captureWarnings();
    try {
      void identity.identifyPurchaser(first);
      await drain();
      expect(eventKinds(sdk)).toEqual(['configure', `logIn:${first}`]);

      let isResetSettled = false;
      void identity.resetPurchaser().then(() => {
        isResetSettled = true;
      });
      await drain();

      await jest.advanceTimersByTimeAsync(10_000);
      await drain();

      expect(eventKinds(sdk)).toEqual(['configure', `logIn:${first}`, 'logOut']);
      expect(isResetSettled).toBe(true);

      sdk.mockState.logIn = { kind: 'resolve' };
      void identity.identifyPurchaser(second);
      await drain();
      await jest.advanceTimersByTimeAsync(10_000);
      await drain();

      expect(eventKinds(sdk)).toEqual(['configure', `logIn:${first}`, 'logOut', `logIn:${second}`]);
      expect(consoleCapture.serialised()).not.toContain(first);
      expect(consoleCapture.serialised()).not.toContain(second);
    } finally {
      consoleCapture.restore();
    }
  });
});
