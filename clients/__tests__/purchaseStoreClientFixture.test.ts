// clients/__tests__/purchaseStoreClientFixture.test.ts
// The fixture purchase store for the e2e build: fixed prices; a purchase posts a synthetic
// RevenueCat event for the signed-in user to the test-mode POST test/webhook (INITIAL_PURCHASE
// with a one-year expiry for the annual, NON_RENEWING_PURCHASE with none for the lifetime, a fresh
// id each time, store APP_STORE) and reports purchased only on a 200; a restore finishes with
// nothing to add and no request, leaving GET me to decide.
import { apiFetch } from '../apiClient';
import { buyStoreProduct, readStorePrices, restoreStorePurchases } from '../purchaseStoreClient.fixture';

jest.mock('../apiClient', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);
const USER_ID = 'a6f1d1c2-0000-4000-8000-00000000000b';
const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type PostedEvent = Record<string, unknown>;

function readPostedEvents(): PostedEvent[] {
  return mockApiFetch.mock.calls.map(([, init]) => (init?.body as { event: PostedEvent }).event);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockApiFetch.mockResolvedValue({ body: { data: { status: 'recorded' } }, status: 200 });
});

afterEach(() => {
  jest.useRealTimers();
  mockApiFetch.mockReset();
});

describe('the fixture purchase store', () => {
  it('lists fixed prices for both Pro products', async () => {
    await expect(readStorePrices()).resolves.toEqual({
      'syntactical.pro.annual': '$19.99',
      'syntactical.pro.lifetime': '$39.99',
    });
  });

  it('posts INITIAL_PURCHASE with a one-year expiry for the annual and reports purchased', async () => {
    await expect(buyStoreProduct('syntactical.pro.annual', USER_ID)).resolves.toBe('purchased');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('test/webhook');
    expect(mockApiFetch.mock.calls[0][1]?.method).toBe('POST');
    expect(readPostedEvents()[0]).toEqual({
      app_user_id: USER_ID,
      event_timestamp_ms: NOW,
      expiration_at_ms: NOW + ONE_YEAR_MS,
      id: expect.stringMatching(/^fixture-[0-9a-f-]{36}$/),
      product_id: 'syntactical.pro.annual',
      store: 'APP_STORE',
      type: 'INITIAL_PURCHASE',
    });
  });

  it('posts NON_RENEWING_PURCHASE with no expiry for the lifetime', async () => {
    await expect(buyStoreProduct('syntactical.pro.lifetime', USER_ID)).resolves.toBe('purchased');
    const [event] = readPostedEvents();
    expect(event).toMatchObject({ product_id: 'syntactical.pro.lifetime', type: 'NON_RENEWING_PURCHASE' });
    expect(event).not.toHaveProperty('expiration_at_ms');
  });

  it('gives each purchase its own event id', async () => {
    await buyStoreProduct('syntactical.pro.annual', USER_ID);
    await buyStoreProduct('syntactical.pro.annual', USER_ID);
    const [first, second] = readPostedEvents();
    expect(first.id).not.toBe(second.id);
  });

  it.each([
    ['a refused webhook', () => mockApiFetch.mockResolvedValueOnce({ body: null, status: 404 })],
    ['a server error', () => mockApiFetch.mockResolvedValueOnce({ body: null, status: 500 })],
    ['an unreachable API', () => mockApiFetch.mockRejectedValueOnce(new Error('API request failed'))],
  ])('reports unavailable on %s', async (_label, arrange) => {
    arrange();
    await expect(buyStoreProduct('syntactical.pro.annual', USER_ID)).resolves.toBe('unavailable');
  });

  it.each([
    ['a guest', 'syntactical.pro.annual', null],
    ['a product that is not Pro', 'syntactical.python.medium', USER_ID],
  ])('reports unavailable with no request for %s', async (_label, productId, userId) => {
    await expect(buyStoreProduct(productId, userId)).resolves.toBe('unavailable');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('finishes a restore with nothing to add and no request', async () => {
    await expect(restoreStorePurchases()).resolves.toBe(true);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
