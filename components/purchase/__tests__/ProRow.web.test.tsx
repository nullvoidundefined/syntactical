// components/purchase/__tests__/ProRow.web.test.tsx
// The Settings Pro row on the web: an annual subscriber who bought through Web Billing reads "Pro
// until <date>" and gets a "Manage subscription" link to the managementURL Web Billing reports, so
// a web subscription can be cancelled where it was sold; with no managementURL there is no link; a
// free user's "Go Pro" is a keyboard-reachable button that opens the dialog named "Syntactical
// Pro", and the open dialog has no axe violations (color-contrast off: jsdom computes no colors).
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { ProRow } from '../ProRow';

import {
  ANNUAL_EXPIRES_AT,
  ANNUAL_PRODUCT,
  SIGNED_IN_USER,
  buildActivePro,
  fakeAuth,
  fakeServer,
  resetFakes,
  serveApp,
  webBilling,
} from './purchaseFlowFakes';

expect.extend(toHaveNoViolations);

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' });
jest.mock('../../../clients/webBillingClient', () => require('./purchaseFlowFakes').buildWebBillingModule());
jest.mock('../../../state/AuthProvider', () => require('./purchaseFlowFakes').buildAuthModule());
jest.mock('expo-router', () => require('./purchaseFlowFakes').buildRouterModule(() => ({})));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => true }));
jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };
const WEB_BILLING_MANAGEMENT_URL = 'https://billing.example.test/manage/subscription';
const PRO_UNTIL = `Pro until ${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(ANNUAL_EXPIRES_AT))}`;

let queryClient: QueryClient;

async function renderRow() {
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <ProRow />
    </QueryClientProvider>,
  );
  await settle();
  return rendered;
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  serveApp();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('ProRow on the web', () => {
  it('links an annual Web Billing subscriber to the managementURL Web Billing reports', async () => {
    fakeServer.pro = buildActivePro(ANNUAL_PRODUCT);
    webBilling.managementUrl = WEB_BILLING_MANAGEMENT_URL;
    await renderRow();
    expect(await screen.findByText(PRO_UNTIL)).toBeTruthy();
    const link = await screen.findByRole('link', { name: 'Manage subscription' });
    expect(link.getAttribute('href')).toBe(WEB_BILLING_MANAGEMENT_URL);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows no Manage subscription link when Web Billing reports no managementURL', async () => {
    fakeServer.pro = buildActivePro(ANNUAL_PRODUCT);
    await renderRow();
    expect(await screen.findByText(PRO_UNTIL)).toBeTruthy();
    await settle();
    expect(screen.queryByRole('link', { name: 'Manage subscription' })).toBeNull();
  });

  it('opens the Pro dialog from a keyboard-reachable Go Pro button, with no axe violations', async () => {
    await renderRow();
    const goPro = await screen.findByRole('button', { name: 'Go Pro' });
    expect(goPro.getAttribute('tabindex')).not.toBe('-1');
    await act(async () => {
      fireEvent.click(goPro);
    });
    await settle();
    expect(screen.getByRole('dialog', { name: 'Syntactical Pro' })).toBeTruthy();
    expect(await axe(document.body, AXE_OPTIONS)).toHaveNoViolations();
  });
});
