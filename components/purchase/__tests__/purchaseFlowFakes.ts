// Shared fakes for the Task 3.18 purchase flow suites (B-42, B-43, B-64,
// Review Focus 3). The purchase SDKs are faked at their wrapper boundaries:
// react-native-purchases on native, clients/webBillingClient on the web. The
// server is a routed fetch stub whose GET me answers with fakeServer.entitlements,
// so a bank unlocks only when the server says so. The native SDK's own
// customer info always claims every product is active: a client that unlocks
// from the SDK's result instead of /me shows it.
import type { Manifest } from '@syntactical/content-schema';

import {
    CONTENT_BASE_URL,
    MANIFEST_URL,
    buildBankText,
    cloneBundledManifest,
    hashUtf8Hex,
    stubFetchRoutes,
    type FetchRoute,
} from '../../../services/content/__tests__/fixtures/contentFixtures';

export { CONTENT_BASE_URL, MANIFEST_URL };

export const API_BASE = 'https://api.syntactical.dev/v1/';
export const ME_URL = `${API_BASE}me`;
export const MEDIUM_PRODUCT = 'syntactical.python.medium';
export const HARD_PRODUCT = 'syntactical.python.hard';
export const SIGNED_IN_USER = 'a6f1d1c2-0000-4000-8000-00000000000a';

// Localized store prices, deliberately not the $5 list price, so a hard-coded
// price cannot pass.
export const NATIVE_PRICES: Record<string, string> = {
    [MEDIUM_PRODUCT]: '€5,49',
    [HARD_PRODUCT]: '€6,99',
};
export const WEB_PRICES: Record<string, string> = {
    [MEDIUM_PRODUCT]: '£4.79',
    [HARD_PRODUCT]: '£5.29',
};

// The server's view: the entitlements GET me returns, and an ordered log of
// SDK calls and GET me requests.
export const fakeServer: { entitlements: string[]; events: string[] } = {
    entitlements: [],
    events: [],
};

// The signed-in user, or null for a guest.
export const fakeAuth: { userId: string | null } = { userId: null };

// Every navigation the screen asked expo-router for.
export const fakeNavigation: { calls: unknown[] } = { calls: [] };

export type NativePurchaseBehavior = 'webhook-grants' | 'no-grant' | 'cancel' | 'fail';
export type NativeRestoreBehavior = 'webhook-grants' | 'fail';

export const nativeSdk: {
    offeringsError: Error | null;
    purchaseBehavior: NativePurchaseBehavior;
    purchasedProductIds: string[];
    restoreBehavior: NativeRestoreBehavior;
    restoreCount: number;
} = {
    offeringsError: null,
    purchaseBehavior: 'webhook-grants',
    purchasedProductIds: [],
    restoreBehavior: 'webhook-grants',
    restoreCount: 0,
};

export type WebPurchaseBehavior = 'purchased' | 'cancelled' | 'unavailable';

export const webBilling: {
    purchaseBehavior: WebPurchaseBehavior;
    purchasedProductIds: string[];
} = {
    purchaseBehavior: 'purchased',
    purchasedProductIds: [],
};

export function resetFakes(): void {
    fakeServer.entitlements = [];
    fakeServer.events = [];
    fakeAuth.userId = null;
    fakeNavigation.calls = [];
    nativeSdk.offeringsError = null;
    nativeSdk.purchaseBehavior = 'webhook-grants';
    nativeSdk.purchasedProductIds = [];
    nativeSdk.restoreBehavior = 'webhook-grants';
    nativeSdk.restoreCount = 0;
    webBilling.purchaseBehavior = 'purchased';
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
    function record(...args: unknown[]) {
        fakeNavigation.calls.push(args[0]);
    }
    const router = { back: () => undefined, navigate: record, push: record, replace: record };
    return {
        ...jest.requireActual('expo-router'),
        router,
        useGlobalSearchParams: readParams,
        useLocalSearchParams: readParams,
        useRouter: () => router,
    };
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
    // The SDK claims every product is active; the client must not believe it.
    const active = Object.fromEntries(
        Object.keys(NATIVE_PRICES).map((productId) => [
            productId,
            { identifier: productId, isActive: true, productIdentifier: productId },
        ]),
    );
    return {
        activeSubscriptions: [],
        allPurchasedProductIdentifiers: Object.keys(NATIVE_PRICES),
        entitlements: { active, all: active },
        nonSubscriptionTransactions: Object.keys(NATIVE_PRICES).map((productIdentifier) => ({
            productIdentifier,
        })),
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

function buildNativePackages(): NativePackage[] {
    return Object.entries(NATIVE_PRICES).map(([productId, priceString]) => ({
        identifier: `$rc_custom_${productId}`,
        offeringIdentifier: 'default',
        packageType: 'CUSTOM',
        product: {
            currencyCode: 'EUR',
            identifier: productId,
            price: Number(priceString.replace(/[^0-9,]/g, '').replace(',', '.')),
            priceString,
            title: productId,
        },
    }));
}

// The react-native-purchases stand-in. purchasePackage and restorePurchases
// model the store: 'webhook-grants' means RevenueCat's webhook reached the
// server, so the next GET me lists the entitlement.
export function buildNativePurchasesModule() {
    const offering = {
        availablePackages: buildNativePackages(),
        identifier: 'default',
        metadata: {},
        serverDescription: '',
    };
    const Purchases = {
        configure: jest.fn(),
        getCustomerInfo: jest.fn(() => Promise.resolve(buildCustomerInfo())),
        getOfferings: jest.fn(() =>
            nativeSdk.offeringsError
                ? Promise.reject(nativeSdk.offeringsError)
                : Promise.resolve({ all: { default: offering }, current: offering }),
        ),
        isConfigured: jest.fn(() => Promise.resolve(true)),
        logIn: jest.fn(() =>
            Promise.resolve({ created: false, customerInfo: buildCustomerInfo() }),
        ),
        logOut: jest.fn(() => Promise.resolve(buildCustomerInfo())),
        purchasePackage: jest.fn((rcPackage: NativePackage) => {
            const productId = rcPackage?.product?.identifier;
            fakeServer.events.push(`purchasePackage ${productId}`);
            nativeSdk.purchasedProductIds.push(productId);
            const behavior = nativeSdk.purchaseBehavior;
            if (behavior === 'cancel') return Promise.reject(buildStoreError('1', true));
            if (behavior === 'fail') return Promise.reject(buildStoreError('2', false));
            if (behavior === 'webhook-grants')
                fakeServer.entitlements = [...fakeServer.entitlements, productId];
            return Promise.resolve({
                customerInfo: buildCustomerInfo(),
                productIdentifier: productId,
            });
        }),
        restorePurchases: jest.fn(() => {
            fakeServer.events.push('restorePurchases');
            nativeSdk.restoreCount += 1;
            if (nativeSdk.restoreBehavior === 'fail')
                return Promise.reject(buildStoreError('2', false));
            fakeServer.entitlements = Object.keys(NATIVE_PRICES);
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

// The clients/webBillingClient stand-in. readWebBillingPrices is the new
// export the implementation adds: product id to the offering's localized price.
export function buildWebBillingModule() {
    return {
        configureWebBilling: jest.fn(),
        purchaseWebBillingProduct: jest.fn((productId: string) => {
            fakeServer.events.push(`purchaseWebBillingProduct ${productId}`);
            webBilling.purchasedProductIds.push(productId);
            return Promise.resolve(webBilling.purchaseBehavior);
        }),
        readWebBillingPrices: jest.fn(() => Promise.resolve({ ...WEB_PRICES })),
        resetWebBilling: jest.fn(),
    };
}

function meRoute(): FetchRoute {
    return () => {
        fakeServer.events.push('GET me');
        return Promise.resolve(
            JSON.stringify({
                data: {
                    dailyGoal: 20,
                    dayStreak: 0,
                    entitlements: fakeServer.entitlements,
                    timezone: null,
                    xpToday: 0,
                    xpTotal: 0,
                },
            }),
        );
    };
}

// The python medium bank's manifest hash no longer matches the bundled copy,
// so no local copy exists (as after the private content split).
function buildManifestWithoutLocalMedium(): Manifest {
    const manifest = cloneBundledManifest();
    const python = manifest.languages.find(({ id }) => id === 'python')!;
    python.banks.medium = { ...python.banks.medium!, hash: hashUtf8Hex(buildBankText(['paid-1'])) };
    return manifest;
}

// Serves the manifest and GET me; every other request fails like an offline
// request. With hasLocalMedium false, python medium has no local copy.
export function serveApp({ hasLocalMedium = true }: { hasLocalMedium?: boolean } = {}): jest.Mock {
    const manifest = hasLocalMedium ? cloneBundledManifest() : buildManifestWithoutLocalMedium();
    return stubFetchRoutes(
        {
            [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(manifest)),
            [ME_URL]: meRoute(),
        },
        { shouldRejectUnrouted: true },
    );
}

export function countMeRequests(): number {
    return fakeServer.events.filter((event) => event === 'GET me').length;
}
