// app/__tests__/purchaseCompleteStaticRender.web.test.tsx
// Web Billing checkout returns to /purchase-complete?product=..., but the static export renders the page at build time
// with no query. Until AuthProvider has read the stored identity the page says "Confirming your purchase" whatever
// the query, so the build-time HTML and the first client render of the return URL match. Once hydrated, a visit with
// no product says "Still processing, check back shortly", as before.
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import PurchaseCompleteScreen from '../purchase-complete';

const CONFIRMING = 'Confirming your purchase';
const STILL_PROCESSING = 'Still processing, check back shortly';
const RETURN_PARAMS = { product: 'syntactical.pro.annual' };

let mockParams: Record<string, string> = {};
let mockAuth = { isHydrated: false, isSignedIn: false };

jest.mock('expo-router', () => ({
  // A plain stand-in, so the server render needs no navigator for the link back to the menu. A require inside a
  // mock factory is not rewritten to react-native-web, so it names react-native-web itself.
  Link: ({ children }: { children: string }) =>
    require('react').createElement(require('react-native-web').Text, null, children),
  // Area 4's Done action may navigate with router; nothing here presses it.
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../state/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../../state/usePurchases', () => ({
  usePurchases: () => ({ confirm: () => new Promise<boolean>(() => {}) }),
}));

describe('purchase-complete in the static export', () => {
  it('says "Confirming your purchase" in the build-time render, which has no query', () => {
    mockAuth = { isHydrated: false, isSignedIn: false };
    mockParams = {};
    const html = renderToString(<PurchaseCompleteScreen />);
    expect(html).toContain(CONFIRMING);
    expect(html).not.toContain(STILL_PROCESSING);
  });

  it('renders the return URL before auth hydrates exactly as the build-time page', () => {
    mockAuth = { isHydrated: false, isSignedIn: false };
    mockParams = {};
    const staticHtml = renderToString(<PurchaseCompleteScreen />);
    mockParams = RETURN_PARAMS;
    expect(renderToString(<PurchaseCompleteScreen />)).toBe(staticHtml);
  });

  it('says "Still processing, check back shortly" once a guest with no product is hydrated', () => {
    mockAuth = { isHydrated: true, isSignedIn: false };
    mockParams = {};
    render(<PurchaseCompleteScreen />);
    expect(screen.getByText(STILL_PROCESSING)).toBeTruthy();
  });
});
