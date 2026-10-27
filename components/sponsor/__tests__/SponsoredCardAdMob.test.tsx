// components/sponsor/__tests__/SponsoredCardAdMob.test.tsx
// The native sponsored card with AdMob: a non-personalised native ad request with AdChoices top right, made
// only once consent allows; the empty Sponsored frame in the fixed-height slot while it loads, and the same
// slot height once the ad fills; each asset a bare Text or Image inside its matching NativeAsset; ad_shown
// only after the ad renders; the house card on no fill, without ids, or when ads are unavailable; and an ad
// that arrives after the results screen unmounted is destroyed with no report and no state update (Review
// Focus 12).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { createQueryClient } from '../../../config/queryClient';
import { settle } from '../../../config/settle';
import { SPONSOR_SLOT_HEIGHT } from '../../../constants/sponsor';
import { SponsoredCard } from '../SponsoredCard';

import {
  NativeAdChoicesPlacement,
  NativeAdEventType,
  NativeAssetType,
  TestIds,
  buildFakeNativeAd,
  deliverAd,
  mobileAdsControl,
  resetMobileAds,
} from './mobileAdsMock';

const mockTrackEvent = jest.fn();
const mockSponsor: { current: Record<string, unknown> } = { current: {} };

jest.mock('../../../state/SponsorProvider', () => ({ useSponsor: () => mockSponsor.current }));
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

const CONTENT_BASE_URL = 'https://example.test/content/';
const UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
const BASE_ADMOB = { androidAppId: 'a', iosAppId: 'i', isTestAds: false, resultsAdUnitId: {}, tracksAdUnitId: {} };

function setSponsor(adsStatus: 'pending' | 'ready' | 'unavailable') {
  mockSponsor.current = {
    adsStatus,
    directSponsor: null,
    eligibility: 'eligible',
    isReady: adsStatus === 'ready',
    privacyOptionsRequired: false,
    showPrivacyOptions: () => Promise.resolve(),
  };
}

function setAdMob(admob: Record<string, unknown>) {
  setExpoExtra({ admob, contentBaseUrl: CONTENT_BASE_URL });
}

const queryClient = createQueryClient();

function Card({ onShown }: { onShown?: () => void }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SponsoredCard placement="results" onShown={onShown} />
    </QueryClientProvider>
  );
}

function hostDescendants(node: ReactTestInstance): string[] {
  return node
    .findAll((candidate: ReactTestInstance) => candidate !== node && typeof candidate.type === 'string')
    .map((candidate) => candidate.type as string);
}

function readPlaceholder() {
  return screen.queryByTestId('sponsored-card-placeholder', { includeHiddenElements: true });
}

beforeEach(() => {
  resetMobileAds();
  queryClient.clear();
  setSponsor('ready');
  setAdMob({ ...BASE_ADMOB, resultsAdUnitId: { ios: UNIT_ID } });
});

afterAll(() => setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL }));

describe('SponsoredCard with AdMob on native', () => {
  it('requests one non-personalised native ad with AdChoices top right and shows the empty frame while it loads', async () => {
    await render(<Card />);
    expect(mobileAdsControl.requests).toEqual([
      {
        adUnitId: UNIT_ID,
        options: { adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT, requestNonPersonalizedAdsOnly: true },
      },
    ]);
    expect(readPlaceholder()).not.toBeNull();
    expect(screen.queryByText('Syntactical Pro')).toBeNull();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('keeps the slot height when the ad fills, so nothing around it moves', async () => {
    await render(<Card />);
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
    await act(async () => deliverAd(buildFakeNativeAd()));
    expect(readPlaceholder()).toBeNull();
    expect(screen.getByTestId('native-ad-view')).toBeTruthy();
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
  });

  it('wraps each asset, and only that view, in the matching NativeAsset', async () => {
    await render(<Card />);
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    expect(screen.getByTestId('native-ad-view')).toBeTruthy();
    for (const [assetType, text] of [
      [NativeAssetType.HEADLINE, ad.headline],
      [NativeAssetType.BODY, ad.body],
      [NativeAssetType.CALL_TO_ACTION, ad.callToAction],
    ]) {
      const asset = screen.getByTestId(`native-asset-${assetType}`);
      expect(hostDescendants(asset)).toEqual(['Text']);
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(hostDescendants(screen.getByTestId(`native-asset-${NativeAssetType.ICON}`))).toEqual(['Image']);
    expect(screen.getByText(ad.body).props.numberOfLines).toBe(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: `Sponsored: ${ad.headline}. Install` })).toBeTruthy();
  });

  it('keeps the Sponsored label first in the card', async () => {
    await render(<Card />);
    await act(async () => deliverAd(buildFakeNativeAd()));
    const card = screen.getByTestId('sponsored-card');
    const firstHost = card.findAll((node: ReactTestInstance) => node !== card && typeof node.type === 'string')[0];
    expect(firstHost).toBe(screen.getByText('Sponsored'));
  });

  it('reports ad_shown with source admob once the ad has rendered, and tells the host once', async () => {
    const onShown = jest.fn();
    await render(<Card onShown={onShown} />);
    expect(onShown).not.toHaveBeenCalled();
    await act(async () => deliverAd(buildFakeNativeAd()));
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'admob' }]]);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('reports ad_clicked with source admob when the SDK reports a click', async () => {
    await render(<Card />);
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    await act(async () => ad.listeners.get(NativeAdEventType.CLICKED)?.());
    expect(mockTrackEvent).toHaveBeenLastCalledWith('ad_clicked', { placement: 'results', source: 'admob' });
  });

  it('leaves out the icon asset when the ad has no icon', async () => {
    await render(<Card />);
    await act(async () => deliverAd(buildFakeNativeAd({ icon: undefined })));
    expect(screen.queryByTestId(`native-asset-${NativeAssetType.ICON}`)).toBeNull();
  });

  it('shows the house card in the same slot when no ad is served', async () => {
    await render(<Card />);
    await act(async () => deliverAd(new Error('No fill')));
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'results', source: 'house' }]]);
  });

  it('shows the house card at once and requests nothing when ads are unavailable', async () => {
    setSponsor('unavailable');
    await render(<Card />);
    expect(mobileAdsControl.requests).toEqual([]);
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
  });

  it('waits for consent before requesting, holding the empty frame, then requests once', async () => {
    setSponsor('pending');
    const view = await render(<Card />);
    expect(mobileAdsControl.requests).toEqual([]);
    expect(readPlaceholder()).not.toBeNull();
    setSponsor('ready');
    view.rerender(<Card />);
    await settle();
    expect(mobileAdsControl.requests).toHaveLength(1);
  });

  it('destroys an ad that arrives after unmount, reports nothing, and updates no state', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = await render(<Card />);
    view.unmount();
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    expect(ad.destroy).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('destroys a shown ad when the card unmounts', async () => {
    const view = await render(<Card />);
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    view.unmount();
    expect(ad.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses Google's test unit in a test build, even with a unit id configured", async () => {
    setAdMob({ ...BASE_ADMOB, isTestAds: true, resultsAdUnitId: { ios: UNIT_ID } });
    await render(<Card />);
    expect(mobileAdsControl.requests[0]?.adUnitId).toBe(TestIds.NATIVE);
  });

  it('shows the house card and requests nothing without unit ids outside a test build', async () => {
    setAdMob(BASE_ADMOB);
    await render(<Card />);
    expect(mobileAdsControl.requests).toEqual([]);
    expect(screen.getByText('Syntactical Pro')).toBeTruthy();
  });
});
