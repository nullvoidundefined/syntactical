// components/sponsor/__tests__/useSponsorNativeAd.test.tsx
// The app owns the native ad's lifecycle: one request per mount once enabled, the ad kept until unmount and
// then destroyed, an ad that arrives after unmount destroyed at once with no state update (Review Focus 20),
// and no fill reported as an error. When the effects re-run with state kept (Fast Refresh; Activity hidden
// then visible here), the destroyed ad is dropped and a fresh one requested, and an ad from the old request
// is destroyed when it lands. The shared mock fakes only NativeAd.createForAdRequest.
import { act, render, renderHook } from '@testing-library/react-native';
import { Activity } from 'react';

import { useSponsorNativeAd, type SponsorNativeAdState } from '../useSponsorNativeAd';

import { buildFakeNativeAd, deliverAd, mobileAdsControl, resetMobileAds } from './mobileAdsMock';

const UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
const OPTIONS = { adChoicesPlacement: 1, requestNonPersonalizedAdsOnly: true };

beforeEach(() => resetMobileAds());

type ActivityMode = 'hidden' | 'visible';

// Hiding an Activity runs every effect cleanup and keeps state; showing it runs the effects again.
async function renderInActivity() {
  const result: { current: SponsorNativeAdState | null } = { current: null };
  function Probe() {
    result.current = useSponsorNativeAd(UNIT_ID, OPTIONS, true);
    return null;
  }
  function Host({ mode }: { mode: ActivityMode }) {
    return (
      <Activity mode={mode}>
        <Probe />
      </Activity>
    );
  }
  const view = await render(<Host mode="visible" />);
  return { result, setMode: (mode: ActivityMode) => view.rerender(<Host mode={mode} />) };
}

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

  it('drops the destroyed ad and requests a fresh one when its effects re-run with state kept', async () => {
    const { result, setMode } = await renderInActivity();
    const first = buildFakeNativeAd();
    await act(async () => deliverAd(first));
    expect(result.current?.nativeAd).toBe(first);
    await setMode('hidden');
    expect(first.destroy).toHaveBeenCalledTimes(1);
    await setMode('visible');
    expect(result.current).toEqual({ error: null, nativeAd: null });
    expect(mobileAdsControl.requests).toHaveLength(2);
    const second = buildFakeNativeAd();
    await act(async () => deliverAd(second));
    expect(result.current?.nativeAd).toBe(second);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it('destroys an ad from the request before the effects re-ran, and keeps the fresh one', async () => {
    const { result, setMode } = await renderInActivity();
    await setMode('hidden');
    await setMode('visible');
    expect(mobileAdsControl.requests).toHaveLength(2);
    const stale = buildFakeNativeAd();
    await act(async () => deliverAd(stale));
    expect(stale.destroy).toHaveBeenCalledTimes(1);
    expect(result.current?.nativeAd).toBeNull();
    const fresh = buildFakeNativeAd();
    await act(async () => deliverAd(fresh));
    expect(result.current?.nativeAd).toBe(fresh);
    expect(fresh.destroy).not.toHaveBeenCalled();
  });
});
