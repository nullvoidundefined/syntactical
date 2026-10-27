// The content one mounted sponsored card shows and its two analytics reports. Only SponsoredCard decides
// whether a card may render; this hook runs inside a card that already may. It gives the live direct
// sponsor SponsorProvider loaded, or the house card until one loads or when there is none. A feed that
// renders its own ad (AdMob, EthicalAds) passes its source to onShown and onClicked. ad_shown and the
// host's onHostShown (the results cadence) run once per mount, whatever the card shows first; ad_clicked
// runs on every press.
import { useCallback, useRef } from 'react';

import { trackEvent } from '../../clients/analyticsClient';
import { HOUSE_CARD } from '../../constants/sponsor';
import type { SponsorContent, SponsorSource } from '../../services/sponsor/types/SponsorContent';
import type { SponsorPlacement } from '../../services/sponsor/types/SponsorPlacement';
import { useSponsor } from '../../state/SponsorProvider';

export type SponsorContentState = {
  content: SponsorContent;
  onClicked: (source?: SponsorSource) => void;
  onShown: (source?: SponsorSource) => void;
};

export function useSponsorContent(placement: SponsorPlacement, onHostShown?: () => void): SponsorContentState {
  const hasReportedShown = useRef(false);
  const hostShownRef = useRef(onHostShown);
  hostShownRef.current = onHostShown;
  const content = useSponsor().directSponsor ?? HOUSE_CARD;
  const contentSource = content.source;

  const onShown = useCallback(
    (source: SponsorSource = contentSource) => {
      if (hasReportedShown.current) return;
      hasReportedShown.current = true;
      trackEvent('ad_shown', { placement, source });
      hostShownRef.current?.();
    },
    [contentSource, placement],
  );

  const onClicked = useCallback(
    (source: SponsorSource = contentSource) => trackEvent('ad_clicked', { placement, source }),
    [contentSource, placement],
  );

  return { content, onClicked, onShown };
}
