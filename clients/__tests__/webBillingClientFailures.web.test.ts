// Web Billing purchases under failure (B-38c): a getOfferings rejection, or a
// purchase rejection that is not the user-cancelled error (another
// PurchasesError or a plain Error), resolves 'unavailable' and writes exactly
// one warning carrying no product id, no user id, and none of the SDK's own
// message; and a purchase whose getOfferings is still pending when Web Billing
// is reset, or reconfigured for another user, resolves 'unavailable' without
// ever calling purchase on the closed instance.
import { randomBytes, randomUUID } from 'node:crypto';

const mockConstants: { expoConfig: { extra: Record<string, unknown> } } = {
  expoConfig: { extra: {} },
};

jest.mock('expo-constants', () => mockConstants);

type FakePackage = { identifier: string; webBillingProduct: { identifier: string } };

type FakeInstance = {
  appUserId: string;
  close: jest.Mock;
  getOfferings: jest.Mock;
  isClosed: boolean;
  purchase: jest.Mock;
};

type Deferred = { promise: Promise<unknown>; resolve(value: unknown): void };

type PurchasesJsMock = {
  Purchases: { configure: jest.Mock; getSharedInstance: jest.Mock; isConfigured: jest.Mock };
  ErrorCode: { UnknownError: number; UserCancelledError: number; NetworkError: number };
  PurchasesError: new (errorCode: number, message?: string) => Error & { errorCode: number };
  mockState: {
    instances: FakeInstance[];
    shared: FakeInstance | null;
    packages: FakePackage[];
    offeringsOutcome: { kind: 'resolve' } | { kind: 'reject'; error: unknown } | { kind: 'hold'; deferred: Deferred };
    purchaseOutcome: { kind: 'resolve' } | { kind: 'reject'; error: unknown };
  };
};

jest.mock('@revenuecat/purchases-js', () => {
  // Mirrors the SDK's numeric ErrorCode enum and its PurchasesError shape.
  const ErrorCode = { UnknownError: 0, UserCancelledError: 1, NetworkError: 35 };
  class PurchasesError extends Error {
    errorCode: number;
    constructor(errorCode: number, message = 'purchases error') {
      super(message);
      this.name = 'PurchasesError';
      this.errorCode = errorCode;
    }
  }
  const mockState: PurchasesJsMock['mockState'] = {
    instances: [],
    shared: null,
    packages: [],
    offeringsOutcome: { kind: 'resolve' },
    purchaseOutcome: { kind: 'resolve' },
  };
  function buildOfferings() {
    return { all: {}, current: { identifier: 'default', availablePackages: mockState.packages } };
  }
  function buildInstance(appUserId: string): FakeInstance {
    const instance: FakeInstance = {
      appUserId,
      isClosed: false,
      close: jest.fn(() => {
        instance.isClosed = true;
        if (mockState.shared === instance) {
          mockState.shared = null;
        }
      }),
      getOfferings: jest.fn(() => {
        const outcome = mockState.offeringsOutcome;
        if (outcome.kind === 'reject') return Promise.reject(outcome.error);
        if (outcome.kind === 'hold') return outcome.deferred.promise;
        return Promise.resolve(buildOfferings());
      }),
      purchase: jest.fn(() =>
        mockState.purchaseOutcome.kind === 'resolve'
          ? Promise.resolve({ customerInfo: {}, redemptionInfo: null, operationSessionId: 'op' })
          : Promise.reject(mockState.purchaseOutcome.error),
      ),
    };
    return instance;
  }
  const Purchases = {
    configure: jest.fn((config: { appUserId: string }) => {
      const instance = buildInstance(config.appUserId);
      mockState.instances.push(instance);
      mockState.shared = instance;
      return instance;
    }),
    getSharedInstance: jest.fn(() => {
      if (mockState.shared === null) {
        throw new Error('Purchases must be configured before calling getSharedInstance');
      }
      return mockState.shared;
    }),
    isConfigured: jest.fn(() => mockState.shared !== null),
  };
  return { __esModule: true, ErrorCode, Purchases, PurchasesError, mockState };
});

type WebBillingModule = typeof import('../webBillingClient');

type Loaded = { client: WebBillingModule; sdk: PurchasesJsMock };

// Loads the client and the SDK mock from one fresh module registry, so each
// test starts with nothing configured.
function loadClient(): Loaded {
  mockConstants.expoConfig.extra = { revenueCatWebBillingKey: `rcb_${randomBytes(12).toString('hex')}` };
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    const sdk = require('@revenuecat/purchases-js') as PurchasesJsMock;
    const client = require('../webBillingClient') as WebBillingModule;
    loaded = { client, sdk };
  });
  if (!loaded) {
    throw new Error('expected the Web Billing client to load');
  }
  return loaded;
}

function buildProductId(): string {
  return `syntactical.${randomBytes(3).toString('hex')}.bank-${randomBytes(2).toString('hex')}`;
}

function buildPackage(productId: string): FakePackage {
  return { identifier: `$rc_${randomBytes(3).toString('hex')}`, webBillingProduct: { identifier: productId } };
}

function buildDeferred(): Deferred {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

// Silences and records every console call; warnCount counts console.warn alone.
function captureConsole(): { warnCount(): number; serialised(): string; restore(): void } {
  const spies = CONSOLE_METHODS.map((name) => jest.spyOn(console, name).mockImplementation(() => undefined));
  function render(arg: unknown): string {
    if (arg instanceof Error) return `${arg.name} ${arg.message} ${arg.stack ?? ''}`;
    return typeof arg === 'string' ? arg : JSON.stringify(arg);
  }
  return {
    warnCount: () => spies[CONSOLE_METHODS.indexOf('warn')].mock.calls.length,
    serialised: () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(render).join(' '))).join('\n'),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

// An SDK message carrying the product id, the user id, and a marker of its
// own, so logging the raw error or its message would show up.
function buildSdkMessage(productId: string, userId: string): { marker: string; message: string } {
  const marker = `sdk-detail-${randomBytes(6).toString('hex')}`;
  return { marker, message: `${marker}: purchase of ${productId} failed for app user ${userId}` };
}

type FailureCase = {
  label: string;
  arrange(sdk: PurchasesJsMock, message: string): void;
};

const NON_CANCEL_FAILURES: FailureCase[] = [
  {
    label: 'getOfferings rejects',
    arrange: (sdk, message) => {
      sdk.mockState.offeringsOutcome = { kind: 'reject', error: new sdk.PurchasesError(sdk.ErrorCode.NetworkError, message) };
    },
  },
  {
    label: 'purchase rejects with a PurchasesError that is not the user-cancelled error',
    arrange: (sdk, message) => {
      sdk.mockState.purchaseOutcome = { kind: 'reject', error: new sdk.PurchasesError(sdk.ErrorCode.UnknownError, message) };
    },
  },
  {
    label: 'purchase rejects with a plain Error',
    arrange: (sdk, message) => {
      sdk.mockState.purchaseOutcome = { kind: 'reject', error: new Error(message) };
    },
  },
];

describe('webBillingClient purchase failures', () => {
  it.each(NON_CANCEL_FAILURES)(
    'resolves unavailable and writes exactly one value-free warning when $label',
    async ({ arrange }) => {
      const { client, sdk } = loadClient();
      const productId = buildProductId();
      const userId = randomUUID();
      const { marker, message } = buildSdkMessage(productId, userId);
      sdk.mockState.packages = [buildPackage(productId)];
      arrange(sdk, message);
      client.configureWebBilling(userId);
      const consoleCapture = captureConsole();
      try {
        const outcome = await client.purchaseWebBillingProduct(productId);

        expect(outcome).toBe('unavailable');
        expect(consoleCapture.warnCount()).toBe(1);
        const output = consoleCapture.serialised();
        expect(output).not.toContain(productId);
        expect(output).not.toContain(userId);
        expect(output).not.toContain(marker);
      } finally {
        consoleCapture.restore();
      }
    },
  );

  it.each([
    ['resetWebBilling runs', (client: WebBillingModule) => client.resetWebBilling()],
    ['Web Billing is configured for another user', (client: WebBillingModule) => client.configureWebBilling(randomUUID())],
  ])(
    'resolves unavailable and never purchases on the closed instance when %s while getOfferings is pending',
    async (_label, interrupt) => {
      const { client, sdk } = loadClient();
      const productId = buildProductId();
      const deferred = buildDeferred();
      sdk.mockState.packages = [buildPackage(productId)];
      sdk.mockState.offeringsOutcome = { kind: 'hold', deferred };
      client.configureWebBilling(randomUUID());
      const [firstInstance] = sdk.mockState.instances;
      const consoleCapture = captureConsole();
      try {
        const pending = client.purchaseWebBillingProduct(productId);
        await Promise.resolve();
        expect(firstInstance.getOfferings).toHaveBeenCalledTimes(1);

        interrupt(client);
        expect(firstInstance.isClosed).toBe(true);
        deferred.resolve({
          all: {},
          current: { identifier: 'default', availablePackages: sdk.mockState.packages },
        });
        const outcome = await pending;

        expect(outcome).toBe('unavailable');
        expect(firstInstance.purchase).not.toHaveBeenCalled();
        for (const instance of sdk.mockState.instances) {
          expect(instance.purchase).not.toHaveBeenCalled();
        }
      } finally {
        consoleCapture.restore();
      }
    },
  );
});
