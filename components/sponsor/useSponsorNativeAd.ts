// The native ad one sponsored card shows, with its lifecycle held here in app code rather than in the SDK
// (decision 16): one NativeAd.createForAdRequest per card mount, the first time the card may request; the
// loaded ad kept until unmount and then destroyed; an ad that arrives after unmount destroyed at once, with
// no state update and so no report (Review Focus 20). A failed request (no fill) is an error the card falls
// back on.
import { useEffect, useRef, useState } from 'react';

import { NativeAd, type NativeAdRequestOptions } from 'react-native-google-mobile-ads';

export type SponsorNativeAdState = { error: Error | null; nativeAd: NativeAd | null };

const EMPTY: SponsorNativeAdState = { error: null, nativeAd: null };

export function useSponsorNativeAd(
  adUnitId: string,
  options: NativeAdRequestOptions,
  enabled: boolean,
): SponsorNativeAdState {
  const [state, setState] = useState<SponsorNativeAdState>(EMPTY);
  const isMounted = useRef(true);
  const heldAd = useRef<NativeAd | null>(null);
  const hasRequested = useRef(false);
  // The request reads the options of the render that enabled it; a new object later never re-requests.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      heldAd.current?.destroy();
      heldAd.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || hasRequested.current) return;
    hasRequested.current = true;
    void NativeAd.createForAdRequest(adUnitId, optionsRef.current).then(
      (ad) => {
        if (!isMounted.current) {
          ad.destroy();
          return;
        }
        heldAd.current = ad;
        setState({ error: null, nativeAd: ad });
      },
      (error: unknown) => {
        if (!isMounted.current) return;
        setState({ error: error instanceof Error ? error : new Error('native ad request failed'), nativeAd: null });
      },
    );
  }, [adUnitId, enabled]);

  return state;
}
