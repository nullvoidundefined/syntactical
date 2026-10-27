// components/sponsor/__tests__/useSponsorNativeAd.test.tsx
// The app owns the native ad's lifecycle: one request per mount once enabled, the ad kept until unmount and
// then destroyed, an ad that arrives after unmount destroyed at once with no state update (Review Focus 20),
// and no fill reported as an error. The shared mock fakes only NativeAd.createForAdRequest.
import { act, renderHook } from '@testing-library/react-native';

import { useSponsorNativeAd } from '../useSponsorNativeAd';

import { buildFakeNativeAd, deliverAd, mobileAdsControl, resetMobileAds } from './mobileAdsMock';

const UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
const OPTIONS = { adChoicesPlacement: 1, requestNonPersonalizedAdsOnly: true };

beforeEach(() => resetMobileAds());

describe('useSponsorNativeAd', () => {
  it('requests nothing while disabled, then one ad once enabled', async () => {
    const { rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useSponsorNativeAd(UNIT_ID, OPTIONS, enabled),
      {
        initialProps: { enabled: false },
      },
    );
    expect(mobileAdsControl.requests).toEqual([]);
    await rerender({ enabled: true });
    await rerender({ enabled: true });
    expect(mobileAdsControl.requests).toEqual([{ adUnitId: UNIT_ID, options: OPTIONS }]);
  });

  it('returns the ad once it arrives, and destroys it on unmount', async () => {
    const { result, unmount } = await renderHook(() => useSponsorNativeAd(UNIT_ID, OPTIONS, true));
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    expect(result.current).toEqual({ error: null, nativeAd: ad });
    expect(ad.destroy).not.toHaveBeenCalled();
    await unmount();
    expect(ad.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys an ad that arrives after unmount, with no state update', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = await renderHook(() => useSponsorNativeAd(UNIT_ID, OPTIONS, true));
    await unmount();
    const ad = buildFakeNativeAd();
    await act(async () => deliverAd(ad));
    expect(ad.destroy).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('reports no fill as an error', async () => {
    const { result } = await renderHook(() => useSponsorNativeAd(UNIT_ID, OPTIONS, true));
    await act(async () => deliverAd(new Error('No fill')));
    expect(result.current.nativeAd).toBeNull();
    expect(result.current.error?.message).toBe('No fill');
  });
});
