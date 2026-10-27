// components/sponsor/__tests__/SponsoredCard.web.test.tsx
// The web sponsored card: with a publisher id and the EthicalAds client, a manual text placement inside the
// card's fixed-height slot, load() once on mount, and the client's own answer deciding the fill: ad_shown
// with source ethicalads when it reports the placement filled, the house card when it reports none. The
// 5 second ceiling decides only when the client has not answered, from the placement's content. The page
// carries no EthicalAds script of its own: an eligible card with a publisher id injects the client (async,
// once per page) and waits for window.ethicalads within the same ceiling, so a Pro viewer or a build
// without a publisher never contacts EthicalAds. A script that fails or never loads falls back to the
// house card, which shows as soon as sponsor.json answers (404 here) when there is no publisher. window.ethicalads is a fake;
// whether the real load() returns a promise is checked on the deployed site (see Open questions).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { SponsorProvider } from '../../../state/SponsorProvider';
import type { ProStatusState } from '../../../state/useProStatus';
import { SponsoredCard } from '../SponsoredCard';

expect.extend(toHaveNoViolations);

const mockTrackEvent = jest.fn();

const mockProStatus: { current: ProStatusState } = { current: { status: 'guest' } };

jest.mock('../../../state/useProStatus', () => ({ useProStatus: () => mockProStatus.current }));
jest.mock('../../../state/AuthProvider', () => ({
  useAuth: () => ({ isHydrated: true }),
  useSignedInUserId: () => null,
}));
jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: (...args: unknown[]) => mockTrackEvent(...args) }));
jest.mock('../../../state/usePurchases', () => ({
  usePurchases: () => ({ buy: jest.fn(), confirm: jest.fn(), prices: {}, restore: jest.fn() }),
}));
jest.mock('../../purchase/ProSheet', () => ({ ProSheet: () => null }));
jest.mock('expo-router', () => ({
  ...require('../../../config/buildExpoRouterMock').buildExpoRouterMock(),
  usePathname: () => '/',
}));

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };
const CONTENT_BASE_URL = 'https://example.test/content/';
const SLOT_HEIGHT = '160px';
const SCRIPT_SELECTOR = 'script[src="https://media.ethicalads.io/media/client/ethicalads.min.js"]';

type FakeClient = { load: jest.Mock };
// What the fake load() returns: nothing, a promise that answers with the filled placements, an empty list,
// a list holding null for the placement it did not fill, or a promise that never settles.
type LoadAnswer = 'none' | 'filled' | 'empty' | 'unfilled' | 'pending';

// Fills the placement the way the EthicalAds client does when isFilling is true, and answers as told.
function installClient(isFilling: boolean, answer: LoadAnswer): FakeClient {
  const load = jest.fn(() => {
    const placement = document.querySelector('[data-ea-publisher]');
    if (isFilling) {
      placement?.insertAdjacentHTML(
        'beforeend',
        '<div class="ea-content"><a href="https://ethicalads.io">A text ad</a></div>',
      );
    }
    if (answer === 'none') return undefined;
    if (answer === 'pending') return new Promise(() => undefined);
    if (answer === 'unfilled') return Promise.resolve([null]);
    return Promise.resolve(answer === 'filled' ? [placement] : []);
  });
  (window as unknown as { ethicalads?: FakeClient }).ethicalads = { load };
  return { load };
}

function Card() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider>
        <SponsoredCard placement="results" />
      </SponsorProvider>
    </QueryClientProvider>
  );
}

// Both placements on one page, as the track list and a results screen can be in one session.
function TwoCards() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider>
        <SponsoredCard placement="results" />
        <SponsoredCard placement="tracks" />
      </SponsorProvider>
    </QueryClientProvider>
  );
}

function injectedScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR));
}

// The injected script finishes: it loaded (after the client defines window.ethicalads) or failed.
async function finishScript(event: 'error' | 'load') {
  await act(async () => {
    injectedScripts()[0]?.dispatchEvent(new Event(event));
    await Promise.resolve();
  });
}

async function flushClientAnswer() {
  await act(async () => {
    await Promise.resolve();
  });
}

function advancePastCeiling() {
  act(() => {
    jest.advanceTimersByTime(5000);
  });
}

beforeEach(() => {
  mockProStatus.current = { status: 'guest' };
  jest.useFakeTimers();
  setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL, ethicalAdsPublisher: 'syntactical' });
  // No direct sponsor: SponsorProvider's sponsor.json request answers 404, so a fallback is the house card.
  global.fetch = jest.fn((url: unknown) =>
    Promise.resolve({
      headers: { get: () => null },
      ok: false,
      redirected: false,
      status: 404,
      text: () => Promise.resolve(''),
      url: String(url),
    }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as unknown as { ethicalads?: FakeClient }).ethicalads;
  for (const script of injectedScripts()) script.remove();
  setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL });
});

describe('SponsoredCard on the web with EthicalAds', () => {
  it('renders one manual text placement inside the card, in the fixed-height slot, and loads it once', () => {
    const client = installClient(true, 'pending');
    render(<Card />);
    const placement = document.querySelector('[data-ea-publisher]');
    expect(placement?.getAttribute('data-ea-publisher')).toBe('syntactical');
    expect(placement?.getAttribute('data-ea-type')).toBe('text');
    expect(placement?.getAttribute('data-ea-manual')).toBe('true');
    expect(placement?.className).toBe('dark flat');
    expect(screen.getByRole('group', { name: 'Sponsored: EthicalAds' }).contains(placement)).toBe(true);
    expect(screen.getByTestId('sponsored-slot').style.height).toBe(SLOT_HEIGHT);
    expect(client.load).toHaveBeenCalledTimes(1);
  });

  it("reports ad_shown with source ethicalads as soon as the client's answer says the placement filled", async () => {
    installClient(true, 'filled');
    const { container } = render(<Card />);
    await flushClientAnswer();
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'ethicalads' }]]);
    expect(screen.queryByText('Syntactical Pro')).toBeNull();
    fireEvent.click(screen.getByText('A text ad'));
    expect(mockTrackEvent).toHaveBeenLastCalledWith('ad_clicked', { placement: 'results', source: 'ethicalads' });
    jest.useRealTimers();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("falls back to the house card as soon as the client's answer says nothing filled, in the same slot", async () => {
    installClient(false, 'empty');
    const { container } = render(<Card />);
    await flushClientAnswer();
    await settle();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(document.querySelector('[data-ea-publisher]')).toBeNull();
    expect(screen.getByTestId('sponsored-slot').style.height).toBe(SLOT_HEIGHT);
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'house' }]]);
    jest.useRealTimers();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('reports ad_clicked only for a press on the ad link, not on the placement around it', async () => {
    installClient(true, 'filled');
    render(<Card />);
    await flushClientAnswer();
    const placement = document.querySelector('[data-ea-publisher]') as HTMLElement;
    fireEvent.click(placement);
    fireEvent.click(placement.querySelector('.ea-content') as HTMLElement);
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'ethicalads' }]]);
    fireEvent.click(screen.getByText('A text ad'));
    expect(mockTrackEvent).toHaveBeenLastCalledWith('ad_clicked', { placement: 'results', source: 'ethicalads' });
  });

  it('reports no ad_clicked for a press before the fill is decided', () => {
    installClient(true, 'pending');
    render(<Card />);
    fireEvent.click(screen.getByText('A text ad'));
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('falls back to the house card when the answer lists the placement as null', async () => {
    installClient(false, 'unfilled');
    render(<Card />);
    await flushClientAnswer();
    await settle();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'house' }]]);
  });

  it('falls back to the house card when the answer names the placement but nothing rendered in it', async () => {
    installClient(false, 'filled');
    render(<Card />);
    await flushClientAnswer();
    await settle();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'house' }]]);
  });

  it('keeps waiting for a slow answer until the ceiling, then counts an ad that rendered as a fill', () => {
    installClient(true, 'pending');
    render(<Card />);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockTrackEvent).not.toHaveBeenCalled();
    advancePastCeiling();
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'ethicalads' }]]);
  });

  it('falls back at the ceiling when load() gives no answer and nothing rendered', async () => {
    installClient(false, 'none');
    render(<Card />);
    await settle();
    expect(screen.queryByText('Syntactical Pro')).toBeNull();
    advancePastCeiling();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
  });

  it('injects the client script into the head once, async, for an eligible card with a publisher id', () => {
    render(<TwoCards />);
    const scripts = injectedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].parentElement).toBe(document.head);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].defer).toBe(false);
  });

  it('loads the placement once the injected script has defined the client', async () => {
    render(<Card />);
    const client = installClient(true, 'filled');
    expect(client.load).not.toHaveBeenCalled();
    await finishScript('load');
    await flushClientAnswer();
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'ethicalads' }]]);
  });

  it('falls back to the house card when the injected script fails to load', async () => {
    render(<Card />);
    await finishScript('error');
    await settle();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(document.querySelector('[data-ea-publisher]')).toBeNull();
  });

  it('falls back to the house card at the ceiling when the injected script never loads', async () => {
    render(<Card />);
    await settle();
    expect(screen.queryByText('Syntactical Pro')).toBeNull();
    advancePastCeiling();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
  });

  it('injects no script for a Pro viewer', async () => {
    mockProStatus.current = { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' };
    render(<Card />);
    await settle();
    expect(injectedScripts()).toHaveLength(0);
  });

  it('shows the house card once sponsor.json answers and never loads without a publisher id', async () => {
    setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL });
    const client = installClient(true, 'filled');
    render(<Card />);
    await settle();
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(client.load).not.toHaveBeenCalled();
    expect(injectedScripts()).toHaveLength(0);
  });
});
