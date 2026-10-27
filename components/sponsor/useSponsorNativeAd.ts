// The native ad one sponsored card shows, with its lifecycle held here in app code rather than in the SDK
// (decision 16): one NativeAd.createForAdRequest per card mount, the first time the card may request; the
// loaded ad kept until unmount and then destroyed; an ad that arrives after unmount destroyed at once, with
// no state update and so no report (Review Focus 20). When Fast Refresh re-runs the effects, the destroyed
// ad leaves state and a fresh one is requested. A failed request (no fill) is an error the card falls back
// on.
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
  const heldAd = useRef<NativeAd | null>(null);
  const hasRequested = useRef(false);
  // Moves on at every cleanup, so a request made before it knows its ad is stale and destroys it on arrival.
  const generation = useRef(0);
  // The request reads the options of the render that enabled it; a new object later never re-requests.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // The cleanup runs on unmount, and also when Fast Refresh re-runs the effects with state kept: then the
  // destroyed ad must leave state and the request effect, running again, must make a fresh request.
  useEffect(
    () => () => {
      generation.current += 1;
      heldAd.current?.destroy();
      heldAd.current = null;
      hasRequested.current = false;
      setState(EMPTY);
    },
    [],
  );

  useEffect(() => {
    if (!enabled || hasRequested.current) return;
    hasRequested.current = true;
    const requestGeneration = generation.current;
    const isStale = () => generation.current !== requestGeneration;
    void NativeAd.createForAdRequest(adUnitId, optionsRef.current).then(
      (ad) => {
        if (isStale()) {
          ad.destroy();
          return;
        }
        heldAd.current = ad;
        setState({ error: null, nativeAd: ad });
      },
      (error: unknown) => {
        if (isStale()) return;
        setState({ error: error instanceof Error ? error : new Error('native ad request failed'), nativeAd: null });
      },
    );
  }, [adUnitId, enabled]);

  return state;
}
