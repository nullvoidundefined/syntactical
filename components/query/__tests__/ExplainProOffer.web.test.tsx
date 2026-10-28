// The Pro sheet opened from "See Pro" when "Explain my mistake" meets the free Ask limit, on the
// web, behaves as it does from Ask (AskProOffer.web.test), with the real QueryDrawer, AskPanel,
// ProOffer, and ProSheet; the explain request, Web Billing, the server, auth, the router, and
// analytics are fakes. The sheet is a top-level dialog, never stacked over the drawer's Modal: See
// Pro closes the drawer, then the sheet opens with focus inside it, Tab and Shift+Tab stay in it,
// and Escape closes only the sheet, returning focus to the control that opened the drawer. It
// opens from ask_limit, since an explanation counts against the Ask limit.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { requestAskAnswer, requestMistakeExplanation } from '../../../services/ask/requestAskAnswer';
import {
  ANNUAL_PRODUCT,
  SIGNED_IN_USER,
  WEB_PRICES,
  fakeAuth,
  resetFakes,
  serveApp,
} from '../../purchase/__tests__/purchaseFlowFakes';
import { QueryDrawer } from '../QueryDrawer';

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' });
jest.mock('../../../services/ask/requestAskAnswer', () => ({
  requestAskAnswer: jest.fn(),
  requestMistakeExplanation: jest.fn(),
}));
jest.mock('../../../clients/webBillingClient', () =>
  require('../../purchase/__tests__/purchaseFlowFakes').buildWebBillingModule(),
);
jest.mock('../../../state/AuthProvider', () => require('../../purchase/__tests__/purchaseFlowFakes').buildAuthModule());
jest.mock('expo-router', () => require('../../purchase/__tests__/purchaseFlowFakes').buildRouterModule(() => ({})));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => true }));
jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: (...args: unknown[]) => mockTrack(...args) }));

const mockTrack = jest.fn();
const mockAsk = jest.mocked(requestAskAnswer);
const mockExplain = jest.mocked(requestMistakeExplanation);
const target = { bankKey: 'python/easy', choiceIndex: 1, questionId: 'py-easy-0' };
const query = { explanation: 'IEEE 754', title: 'NaN is never equal' };
const ANNUAL_BUTTON = `A year for ${WEB_PRICES[ANNUAL_PRODUCT]}`;

let queryClient: QueryClient;
let closeCount: number;

function RoundHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Pressable role="button" aria-label="Open query" onPress={() => setIsOpen(true)}>
        <Text>Open query</Text>
      </Pressable>
      <QueryDrawer
        askTarget={target}
        isAnswered
        isMistake
        isOpen={isOpen}
        query={query}
        grammar="plain"
        onClose={() => {
          closeCount += 1;
          setIsOpen(false);
        }}
      />
    </>
  );
}

async function openSheetFromExplainLimit(): Promise<HTMLElement> {
  render(
    <QueryClientProvider client={queryClient}>
      <RoundHarness />
    </QueryClientProvider>,
  );
  const opener = screen.getByRole('button', { name: 'Open query' });
  act(() => opener.focus());
  await act(async () => {
    fireEvent.click(opener);
  });
  await settle();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Explain my mistake' }));
  });
  await settle();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'See Pro' }));
  });
  await settle();
  await screen.findByRole('button', { name: ANNUAL_BUTTON });
  return screen.getByRole('dialog', { name: 'Syntactical Pro' });
}

function listSheetButtons(dialog: HTMLElement): HTMLElement[] {
  return within(dialog).getAllByRole('button');
}

beforeEach(() => {
  resetFakes();
  fakeAuth.userId = SIGNED_IN_USER;
  queryClient = createQueryClient();
  closeCount = 0;
  serveApp();
  mockExplain.mockResolvedValue({ limit: 5, proLimit: 20, reason: 'limit', status: 'failed', tier: 'free' });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  queryClient.clear();
  mockAsk.mockReset();
  mockExplain.mockReset();
  mockTrack.mockReset();
  jest.restoreAllMocks();
});

describe('the Pro sheet from the Explain my mistake limit on the web', () => {
  it('closes the drawer and opens the sheet from ask_limit as the only dialog, with focus inside it', async () => {
    const dialog = await openSheetFromExplainLimit();

    expect(mockExplain).toHaveBeenCalledWith(target);
    expect(mockAsk).not.toHaveBeenCalled();
    expect(screen.queryByTestId('query-modal')).toBeNull();
    expect(closeCount).toBe(1);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith('paywall_viewed', { source: 'ask_limit' });
  });

  it('keeps Tab and Shift+Tab inside the sheet', async () => {
    const dialog = await openSheetFromExplainLimit();
    const buttons = listSheetButtons(dialog);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    act(() => last.focus());
    await settle();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });
    await settle();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: true });
    await settle();
    expect(document.activeElement).toBe(last);
  });

  it('closes only the sheet on Escape and returns focus to what opened the drawer', async () => {
    await openSheetFromExplainLimit();
    const closesBeforeEscape = closeCount;

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.keyUp(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();

    expect(screen.queryByRole('dialog', { name: 'Syntactical Pro' })).toBeNull();
    expect(screen.queryByTestId('query-modal')).toBeNull();
    expect(closeCount).toBe(closesBeforeEscape);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open query' }));
  });
});
