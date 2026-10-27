// clients/__tests__/readWebBillingManagementUrl.web.test.ts
// Web Billing's subscription page comes from the configured instance's CustomerInfo: its
// managementURL when RevenueCat gives one, and null when it gives none or Web Billing is not
// configured. A failed read rejects, so the caller's query can try again instead of caching null.
import { readWebBillingManagementUrl } from '../webBillingClient/readWebBillingManagementUrl';
import { webBillingState } from '../webBillingClient/webBillingState';

jest.mock('../logClient', () => ({ logWarning: jest.fn() }));

const MANAGEMENT_URL = 'https://billing.example.test/manage/subscription';

function configure(getCustomerInfo: () => Promise<unknown>): void {
  webBillingState.current = {
    instance: { getCustomerInfo } as unknown as NonNullable<typeof webBillingState.current>['instance'],
    userId: 'a6f1d1c2-0000-4000-8000-00000000000a',
  };
}

afterEach(() => {
  webBillingState.current = null;
});

describe('readWebBillingManagementUrl', () => {
  it("answers the customer's managementURL", async () => {
    configure(() => Promise.resolve({ managementURL: MANAGEMENT_URL }));
    await expect(readWebBillingManagementUrl()).resolves.toBe(MANAGEMENT_URL);
  });

  it('answers null when RevenueCat gives no managementURL', async () => {
    configure(() => Promise.resolve({ managementURL: null }));
    await expect(readWebBillingManagementUrl()).resolves.toBeNull();
  });

  it('answers null when Web Billing is not configured', async () => {
    await expect(readWebBillingManagementUrl()).resolves.toBeNull();
  });

  it('rejects when the read fails', async () => {
    configure(() => Promise.reject(new Error('network')));
    await expect(readWebBillingManagementUrl()).rejects.toThrow();
  });
});
