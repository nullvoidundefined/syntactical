// Shared fakes for the Pro purchase suites. The purchase SDKs are faked at their wrapper
// boundaries: react-native-purchases on native, clients/webBillingClient on the web. The server is
// a routed fetch stub whose GET me answers with fakeServer.pro, so Pro shows only when the server
// says so. The native SDK's own customer info always claims both products are active: a client
// that trusts the SDK's result instead of /me shows it.
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  cloneBundledManifest,
  stubFetchRoutes,
  type FetchRoute,
} from '../../../services/content/__tests__/fixtures/contentFixtures';
import { buildExpoRouterMock } from '../../../config/buildExpoRouterMock';

export { CONTENT_BASE_URL, MANIFEST_URL };

export const API_BASE = 'https://api.syntactical.dev/v1/';
export const ME_URL = `${API_BASE}me`;
export const ANNUAL_PRODUCT = 'syntactical.pro.annual';
export const LIFETIME_PRODUCT = 'syntactical.pro.lifetime';
export const SIGNED_IN_USER = 'a6f1d1c2-0000-4000-8000-00000000000a';
// Noon UTC, so the date is the same in every time zone a CI runner uses.
export const ANNUAL_EXPIRES_AT = '2027-10-27T12:00:00.000Z';

// Localized store prices, deliberately not the US list prices ($19.99, $39.99), so a hard-coded
// price cannot pass.
export const NATIVE_PRICES: Record<string, string> = {
  [ANNUAL_PRODUCT]: '€21,99',
  [LIFETIME_PRODUCT]: '€43,99',
};
export const WEB_PRICES: Record<string, string> = {
  [ANNUAL_PRODUCT]: '£17.49',
  [LIFETIME_PRODUCT]: '£34.99',
};

export type FakePro = { expiresAt: string | null; isActive: boolean; product: 'annual' | 'lifetime' | null };

export const FREE_PRO: FakePro = { expiresAt: null, isActive: false, product: null };

// What GET me says once the webhook for this product reached the server.
export function buildActivePro(productId: string): FakePro {
  return productId === LIFETIME_PRODUCT
    ? { expiresAt: null, isActive: true, product: 'lifetime' }
    : { expiresAt: ANNUAL_EXPIRES_AT, isActive: true, product: 'annual' };
}

// The server's view: the Pro status GET me returns, and an ordered log of SDK calls and GET me
// requests. While meGate is set, every GET me answer waits for it (see holdMe).
export const fakeServer: { events: string[]; meGate: Promise<void> | null; pro: FakePro } = {
  events: [],
  meGate: null,
  pro: FREE_PRO,
};

// Holds every GET me answer until the returned release function is called.
export function holdMe(): () => void {
  let release: () => void = () => undefined;
  fakeServer.meGate = new Promise<void>((resolve) => {
    release = () => {
      fakeServer.meGate = null;
      resolve();
    };
  });
  return release;
}

// The signed-in user, or null for a guest.
export const fakeAuth: { userId: string | null } = { userId: null };

// Every navigation the screen asked expo-router for.
export const fakeNavigation: { calls: unknown[] } = { calls: [] };

export type NativePurchaseBehavior = 'webhook-grants' | 'no-grant' | 'cancel' | 'fail';
// no-grant: the store restores, but the server's GET me still says free.
export type NativeRestoreBehavior = 'webhook-grants' | 'no-grant' | 'fail';

// While customerInfoError is set, getCustomerInfo rejects with it.
export const nativeSdk: {
  customerInfoError: Error | null;
  managementUrl: string | null;
  offeringsError: Error | null;
  purchaseBehavior: NativePurchaseBehavior;
  purchasedProductIds: string[];
  restoreBehavior: NativeRestoreBehavior;
  restoreCount: number;
} = {
  customerInfoError: null,
  managementUrl: null,
  offeringsError: null,
  purchaseBehavior: 'webhook-grants',
  purchasedProductIds: [],
  restoreBehavior: 'webhook-grants',
  restoreCount: 0,
};

export type WebPurchaseBehavior = 'purchased' | 'cancelled' | 'unavailable';

// While purchaseGate is set, purchaseWebBillingProduct stays in flight until it resolves.
export const webBilling: {
  managementUrl: string | null;
  purchaseBehavior: WebPurchaseBehavior;
  purchaseGate: Promise<void> | null;
  purchasedProductIds: string[];
} = {
  managementUrl: null,
  purchaseBehavior: 'purchased',
  purchaseGate: null,
  purchasedProductIds: [],
};

export function resetFakes(): void {
  fakeServer.events = [];
  fakeServer.meGate = null;
  fakeServer.pro = FREE_PRO;
  fakeAuth.userId = null;
  fakeNavigation.calls = [];
  nativeSdk.customerInfoError = null;
  nativeSdk.managementUrl = null;
  nativeSdk.offeringsError = null;
  nativeSdk.purchaseBehavior = 'webhook-grants';
  nativeSdk.purchasedProductIds = [];
  nativeSdk.restoreBehavior = 'webhook-grants';
  nativeSdk.restoreCount = 0;
  webBilling.managementUrl = null;
  webBilling.purchaseBehavior = 'purchased';
  webBilling.purchaseGate = null;
  webBilling.purchasedProductIds = [];
}

// The state/AuthProvider stand-in: a hydrated guest or signed-in user.
export function buildAuthModule() {
  function useAuth() {
    const userId = fakeAuth.userId;
    return {
      completeGuestClaim: () => undefined,
      guestClaimUserId: null,
      isHydrated: true,
      isSignedIn: userId !== null,
      requestCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
      signOut: () => Promise.resolve(),
      user: userId === null ? null : { id: userId },
      verifyCode: () => Promise.resolve({ isOk: false, reason: 'unavailable' }),
    };
  }
  return {
    AuthProvider: ({ children }: { children: unknown }) => children,
    useAuth,
    useSignedInUserId: () => fakeAuth.userId,
  };
}

// The expo-router stand-in: navigation is recorded, never performed.
export function buildRouterModule(readParams: () => Record<string, string | string[] | undefined>) {
  return buildExpoRouterMock({
    readParams,
    record: (href: unknown) => {
      fakeNavigation.calls.push(href);
    },
  });
}

// An href passed to expo-router (a string or { pathname, params }) as a URL.
export function toUrl(href: unknown): URL {
  if (typeof href === 'string') return new URL(href, 'https://app.test');
  const { params = {}, pathname } = href as {
    params?: Record<string, unknown>;
    pathname: string;
  };
  const url = new URL(pathname, 'https://app.test');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

export function listNavigatedUrls(): URL[] {
  return fakeNavigation.calls.map(toUrl);
}

function buildCustomerInfo() {
  // The SDK claims both products are active; the client must not believe it.
  const active = Object.fromEntries(
    Object.keys(NATIVE_PRICES).map((productId) => [
      productId,
      { identifier: productId, isActive: true, productIdentifier: productId },
    ]),
  );
  return {
    activeSubscriptions: [ANNUAL_PRODUCT],
    allPurchasedProductIdentifiers: Object.keys(NATIVE_PRICES),
    entitlements: { active, all: active },
    managementURL: nativeSdk.managementUrl,
    nonSubscriptionTransactions: [{ productIdentifier: LIFETIME_PRODUCT }],
    originalAppUserId: SIGNED_IN_USER,
  };
}

function buildStoreError(code: string, isCancelled: boolean): Error {
  return Object.assign(new Error(isCancelled ? 'Purchase was cancelled.' : 'Store problem.'), {
    code,
    userCancelled: isCancelled,
  });
}

type NativePackage = {
  identifier: string;
  offeringIdentifier: string;
  packageType: string;
  product: {
    currencyCode: string;
    identifier: string;
    price: number;
    priceString: string;
    title: string;
  };
};

// The RevenueCat offering: $rc_annual and $rc_lifetime, as docs/store/in-app-purchases.md sets it up.
function buildNativePackages(): NativePackage[] {
  return [
    { identifier: '$rc_annual', packageType: 'ANNUAL', productId: ANNUAL_PRODUCT },
    { identifier: '$rc_lifetime', packageType: 'LIFETIME', productId: LIFETIME_PRODUCT },
  ].map(({ identifier, packageType, productId }) => {
    const priceString = NATIVE_PRICES[productId];
    return {
      identifier,
      offeringIdentifier: 'default',
      packageType,
      product: {
        currencyCode: 'EUR',
        identifier: productId,
        price: Number(priceString.replace(/[^0-9,]/g, '').replace(',', '.')),
        priceString,
        title: productId,
      },
    };
  });
}

// The react-native-purchases stand-in. purchasePackage and restorePurchases model the store:
// 'webhook-grants' means RevenueCat's webhook reached the server, so the next GET me says Pro.
// A restore that grants restores a lifetime purchase made on another install.
export function buildNativePurchasesModule() {
  const offering = {
    availablePackages: buildNativePackages(),
    identifier: 'default',
    metadata: {},
    serverDescription: '',
  };
  const Purchases = {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(() =>
      nativeSdk.customerInfoError ? Promise.reject(nativeSdk.customerInfoError) : Promise.resolve(buildCustomerInfo()),
    ),
    getOfferings: jest.fn(() =>
      nativeSdk.offeringsError
        ? Promise.reject(nativeSdk.offeringsError)
        : Promise.resolve({ all: { default: offering }, current: offering }),
    ),
    isConfigured: jest.fn(() => Promise.resolve(true)),
    logIn: jest.fn(() => Promise.resolve({ created: false, customerInfo: buildCustomerInfo() })),
    logOut: jest.fn(() => Promise.resolve(buildCustomerInfo())),
    purchasePackage: jest.fn((rcPackage: NativePackage) => {
      const productId = rcPackage?.product?.identifier;
      fakeServer.events.push(`purchasePackage ${productId}`);
      nativeSdk.purchasedProductIds.push(productId);
      const behavior = nativeSdk.purchaseBehavior;
      if (behavior === 'cancel') return Promise.reject(buildStoreError('1', true));
      if (behavior === 'fail') return Promise.reject(buildStoreError('2', false));
      if (behavior === 'webhook-grants') fakeServer.pro = buildActivePro(productId);
      return Promise.resolve({ customerInfo: buildCustomerInfo(), productIdentifier: productId });
    }),
    restorePurchases: jest.fn(() => {
      fakeServer.events.push('restorePurchases');
      nativeSdk.restoreCount += 1;
      if (nativeSdk.restoreBehavior === 'fail') return Promise.reject(buildStoreError('2', false));
      if (nativeSdk.restoreBehavior === 'webhook-grants') fakeServer.pro = buildActivePro(LIFETIME_PRODUCT);
      return Promise.resolve(buildCustomerInfo());
    }),
  };
  return {
    __esModule: true,
    default: Purchases,
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
      STORE_PROBLEM_ERROR: '2',
      UNKNOWN_ERROR: '0',
    },
  };
}

// The clients/webBillingClient stand-in: product id to the offering's localized price, and a
// purchase that never grants by itself (purchase-complete confirms checkout's return through /me).
export function buildWebBillingModule() {
  return {
    configureWebBilling: jest.fn(),
    purchaseWebBillingProduct: jest.fn((productId: string) => {
      fakeServer.events.push(`purchaseWebBillingProduct ${productId}`);
      webBilling.purchasedProductIds.push(productId);
      const gate = webBilling.purchaseGate ?? Promise.resolve();
      return gate.then(() => webBilling.purchaseBehavior);
    }),
    readWebBillingPrices: jest.fn(() => Promise.resolve({ ...WEB_PRICES })),
    readWebBillingManagementUrl: jest.fn(() => Promise.resolve(webBilling.managementUrl)),
    resetWebBilling: jest.fn(),
  };
}

function meRoute(): FetchRoute {
  return async () => {
    fakeServer.events.push('GET me');
    await fakeServer.meGate;
    return JSON.stringify({
      data: { dailyGoal: 20, dayStreak: 0, pro: fakeServer.pro, timezone: null, xpToday: 0, xpTotal: 0 },
    });
  };
}

// Serves the bundled manifest and GET me; every other request fails like an offline request.
export function serveApp(): jest.Mock {
  return stubFetchRoutes(
    {
      [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(cloneBundledManifest())),
      [ME_URL]: meRoute(),
    },
    { shouldRejectUnrouted: true },
  );
}

export function countMeRequests(): number {
  return fakeServer.events.filter((event) => event === 'GET me').length;
}
