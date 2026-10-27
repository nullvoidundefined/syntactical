// clients/__tests__/purchaseStoreClientPlay.test.ts
// The native store against the offering RevenueCat returns on Android, where the annual
// subscription's store product identifier carries its base plan (syntactical.pro.annual:yearly):
// prices key the annual by its Pro product id, buying that id purchases the suffixed package, an
// unsuffixed package is still found by its exact id, and an id no package matches is unavailable.
import { buyStoreProduct, readStorePrices } from '../purchaseStoreClient';

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
  },
}));

const ANDROID_ANNUAL = {
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: { identifier: 'syntactical.pro.annual:yearly', priceString: '$19.99' },
};
const ANDROID_LIFETIME = {
  identifier: '$rc_lifetime',
  packageType: 'LIFETIME',
  product: { identifier: 'syntactical.pro.lifetime', priceString: '$39.99' },
};

beforeEach(() => {
  const offering = { availablePackages: [ANDROID_ANNUAL, ANDROID_LIFETIME], identifier: 'default' };
  mockGetOfferings.mockReset().mockResolvedValue({ all: { default: offering }, current: offering });
  mockPurchasePackage.mockReset().mockResolvedValue({ productIdentifier: 'syntactical.pro.annual:yearly' });
});

describe('purchaseStoreClient with a Google Play base plan', () => {
  it("keys the annual's price by the Pro product id", async () => {
    const prices = await readStorePrices();
    expect(prices['syntactical.pro.annual']).toBe('$19.99');
    expect(prices).toEqual({ 'syntactical.pro.annual': '$19.99', 'syntactical.pro.lifetime': '$39.99' });
  });

  it('buys the base-plan package for syntactical.pro.annual', async () => {
    await expect(buyStoreProduct('syntactical.pro.annual')).resolves.toBe('purchased');
    expect(mockPurchasePackage).toHaveBeenCalledWith(ANDROID_ANNUAL);
  });

  it('still buys an unsuffixed package by its exact id', async () => {
    await expect(buyStoreProduct('syntactical.pro.lifetime')).resolves.toBe('purchased');
    expect(mockPurchasePackage).toHaveBeenCalledWith(ANDROID_LIFETIME);
  });

  it('is unavailable for an id no package matches, without a purchase', async () => {
    await expect(buyStoreProduct('syntactical.pro')).resolves.toBe('unavailable');
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });
});
