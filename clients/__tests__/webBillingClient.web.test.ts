// The Web Billing client wraps @revenuecat/purchases-js: it configures one
// instance per signed-in user with the public rcb_ key from extra (never with
// a missing or other key), closes the old instance before configuring for
// another user or on reset, and buys the package whose Web Billing product
// identifier is the bank's product id, reporting 'purchased', 'cancelled'
// (the SDK's user-cancelled error), or 'unavailable'.
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
  purchase: jest.Mock;
};

type PurchasesJsMock = {
  Purchases: { configure: jest.Mock; getSharedInstance: jest.Mock; isConfigured: jest.Mock };
  ErrorCode: { UnknownError: number; UserCancelledError: number };
  PurchasesError: new (errorCode: number, message?: string) => Error & { errorCode: number };
  mockState: {
    instances: FakeInstance[];
    shared: FakeInstance | null;
    packages: FakePackage[];
    purchaseOutcome: { kind: 'resolve' } | { kind: 'reject'; error: unknown };
  };
};

jest.mock('@revenuecat/purchases-js', () => {
  // Mirrors the SDK's numeric ErrorCode enum and its PurchasesError shape.
  const ErrorCode = { UnknownError: 0, UserCancelledError: 1 };
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
    purchaseOutcome: { kind: 'resolve' },
  };
  function buildInstance(appUserId: string): FakeInstance {
    const instance: FakeInstance = {
      appUserId,
      close: jest.fn(() => {
        if (mockState.shared === instance) {
          mockState.shared = null;
        }
      }),
      getOfferings: jest.fn(() =>
        Promise.resolve({
          all: {},
          current: { identifier: 'default', availablePackages: mockState.packages },
        }),
      ),
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
// test starts with nothing configured and reads this test's extra key.
function loadClient(webBillingKey: string | undefined): Loaded {
  mockConstants.expoConfig.extra = webBillingKey === undefined ? {} : { revenueCatWebBillingKey: webBillingKey };
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

function buildKey(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function buildProductId(): string {
  return `syntactical.${randomBytes(3).toString('hex')}.bank-${randomBytes(2).toString('hex')}`;
}

function buildPackage(productId: string): FakePackage {
  return { identifier: `$rc_${randomBytes(3).toString('hex')}`, webBillingProduct: { identifier: productId } };
}

describe('webBillingClient', () => {
  describe('configureWebBilling', () => {
    it('configures purchases-js with the rcb_ key from extra and the user id as appUserId', () => {
      const key = buildKey('rcb');
      const userId = randomUUID();
      const { client, sdk } = loadClient(key);

      client.configureWebBilling(userId);

      expect(sdk.Purchases.configure).toHaveBeenCalledTimes(1);
      const [configArg] = sdk.Purchases.configure.mock.calls[0] as [Record<string, unknown>];
      expect(configArg).toHaveProperty('apiKey', key);
      expect(configArg).toHaveProperty('appUserId', userId);
      expect(sdk.mockState.shared?.appUserId).toBe(userId);
    });

    it('configures nothing and later purchases are unavailable when extra has no key', async () => {
      const { client, sdk } = loadClient(undefined);

      client.configureWebBilling(randomUUID());
      const outcome = await client.purchaseWebBillingProduct(buildProductId());

      expect(sdk.Purchases.configure).not.toHaveBeenCalled();
      expect(sdk.mockState.instances).toHaveLength(0);
      expect(outcome).toBe('unavailable');
    });

    it.each([
      ['an Apple key', () => buildKey('appl')],
      ['a Google key', () => buildKey('goog')],
      ['a secret key', () => buildKey(['s', 'k'].join(''))],
      ['a bare rcb_ prefix', () => 'rcb_'],
    ])('configures nothing when the extra key is %s', async (_label, buildValue) => {
      const { client, sdk } = loadClient(buildValue());

      client.configureWebBilling(randomUUID());
      const outcome = await client.purchaseWebBillingProduct(buildProductId());

      expect(sdk.Purchases.configure).not.toHaveBeenCalled();
      expect(outcome).toBe('unavailable');
    });

    it('closes the previous instance before configuring for a different user', () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      const firstUserId = randomUUID();
      const secondUserId = randomUUID();

      client.configureWebBilling(firstUserId);
      client.configureWebBilling(secondUserId);

      const [first, second] = sdk.mockState.instances;
      expect(sdk.mockState.instances.map((instance) => instance.appUserId)).toEqual([firstUserId, secondUserId]);
      expect(first.close).toHaveBeenCalled();
      expect(first.close.mock.invocationCallOrder[0]).toBeLessThan(sdk.Purchases.configure.mock.invocationCallOrder[1]);
      expect(second.close).not.toHaveBeenCalled();
      expect(sdk.mockState.shared).toBe(second);
    });
  });

  describe('resetWebBilling', () => {
    it('closes the configured instance, and a later purchase is unavailable without reaching the SDK', async () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      const productId = buildProductId();
      sdk.mockState.packages = [buildPackage(productId)];
      client.configureWebBilling(randomUUID());
      const [instance] = sdk.mockState.instances;

      client.resetWebBilling();
      const outcome = await client.purchaseWebBillingProduct(productId);

      expect(instance.close).toHaveBeenCalled();
      expect(outcome).toBe('unavailable');
      expect(instance.purchase).not.toHaveBeenCalled();
    });
  });

  describe('purchaseWebBillingProduct', () => {
    it('buys the package whose webBillingProduct.identifier is the product id, not another package', async () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      const productId = buildProductId();
      const otherPackage = buildPackage(buildProductId());
      const matchingPackage = buildPackage(productId);
      const laterPackage = buildPackage(buildProductId());
      sdk.mockState.packages = [otherPackage, matchingPackage, laterPackage];
      client.configureWebBilling(randomUUID());
      const [instance] = sdk.mockState.instances;

      const outcome = await client.purchaseWebBillingProduct(productId);

      expect(outcome).toBe('purchased');
      expect(instance.purchase).toHaveBeenCalledTimes(1);
      expect(instance.purchase).toHaveBeenCalledWith(expect.objectContaining({ rcPackage: matchingPackage }));
    });

    it('returns unavailable and buys nothing when no package carries the product id', async () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      sdk.mockState.packages = [buildPackage(buildProductId()), buildPackage(buildProductId())];
      client.configureWebBilling(randomUUID());
      const [instance] = sdk.mockState.instances;

      const outcome = await client.purchaseWebBillingProduct(buildProductId());

      expect(outcome).toBe('unavailable');
      expect(instance.purchase).not.toHaveBeenCalled();
    });

    it('returns unavailable and reaches no SDK instance when never configured', async () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      const productId = buildProductId();
      sdk.mockState.packages = [buildPackage(productId)];

      const outcome = await client.purchaseWebBillingProduct(productId);

      expect(outcome).toBe('unavailable');
      expect(sdk.mockState.instances).toHaveLength(0);
      expect(sdk.Purchases.configure).not.toHaveBeenCalled();
    });

    it('returns cancelled when the SDK rejects with the user-cancelled error', async () => {
      const { client, sdk } = loadClient(buildKey('rcb'));
      const productId = buildProductId();
      sdk.mockState.packages = [buildPackage(productId)];
      sdk.mockState.purchaseOutcome = {
        kind: 'reject',
        error: new sdk.PurchasesError(sdk.ErrorCode.UserCancelledError, 'user cancelled'),
      };
      client.configureWebBilling(randomUUID());

      const outcome = await client.purchaseWebBillingProduct(productId);

      expect(outcome).toBe('cancelled');
    });
  });
});
