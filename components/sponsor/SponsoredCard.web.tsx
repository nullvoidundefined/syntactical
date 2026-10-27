// The sponsored card on the web (iOS and Android use SponsoredCard.tsx), and the only place on the web that
// reads eligibility: nothing renders unless SponsorProvider allows cards, and otherwise the card sits in its
// fixed-height SponsoredSlot. With an EthicalAds publisher id the card holds one manual text placement
// inside the frame, injects the client script if the page has none yet (loadEthicalAdsClient), and runs
// ethicalads.load() once the client is there. The client's answer decides the fill: when load() returns a
// promise, a list holding at least one placement (not null) is a fill if the placement element has content
// too; an empty list, or one of nulls, is no fill.
// ETHICAL_ADS_FILL_CEILING_MS, counted from mount, is only a ceiling: a card still undecided then (a
// script that has not loaded, a slow answer, or a client that returns none) counts a placement with a
// child element as a fill. No fill, a script that fails to load, or no publisher id shows the direct
// sponsor or the house card. Nothing reloads
// on a route change: Slot swaps screens, so a card never outlives its route. EthicalAds sets no cookies, so
// the web asks for no consent.
import { createElement, useEffect, useRef, useState } from 'react';

import { readExtraString } from '../../config/readExtraString';
import { ETHICAL_ADS_FILL_CEILING_MS } from '../../constants/sponsor';
import { useSponsor } from '../../state/SponsorProvider';

import type { SponsoredCardProps } from './SponsoredCard';
import { SponsoredCardFrame } from './SponsoredCardFrame';
import { SponsorContentSlot } from './SponsorContentSlot';
import { SponsoredSlot } from './SponsoredSlot';
import { type EthicalAdsClient, loadEthicalAdsClient, readEthicalAdsClient } from './loadEthicalAdsClient';
import { useSponsorContent, type SponsorContentState } from './useSponsorContent';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

// The client renders its ad (a .ea-content element) inside the placement; any child element counts.
function hasFill(placement: HTMLElement | null): boolean {
  return placement !== null && placement.childElementCount > 0;
}

type EthicalAdsPlacementProps = {
  onEmpty: () => void;
  publisher: string;
  sponsor: SponsorContentState;
};

function EthicalAdsPlacement({ onEmpty, publisher, sponsor }: EthicalAdsPlacementProps) {
  const placementRef = useRef<HTMLDivElement>(null);
  // Callbacks are read through a ref so a new identity (the direct sponsor arriving) never restarts the
  // load; the effect runs once per mount.
  const latest = useRef({ onEmpty, onShown: sponsor.onShown });
  latest.current = { onEmpty, onShown: sponsor.onShown };
  const { onClicked } = sponsor;

  useEffect(() => {
    let isDecided = false;
    function decide(isFilled: boolean) {
      if (isDecided) return;
      isDecided = true;
      if (isFilled) latest.current.onShown('ethicalads');
      else latest.current.onEmpty();
    }
    function start(client: EthicalAdsClient | null) {
      if (isDecided) return;
      if (client === null) {
        decide(false);
        return;
      }
      const answer = client.load();
      if (isThenable(answer)) {
        void answer.then(
          (placements) =>
            decide((!Array.isArray(placements) || placements.some(Boolean)) && hasFill(placementRef.current)),
          () => decide(false),
        );
      }
    }
    // A client already on the page loads the placement in this effect; otherwise wait for the script.
    const present = readEthicalAdsClient();
    if (present === null) void loadEthicalAdsClient().then(start);
    else start(present);
    const ceiling = setTimeout(() => decide(hasFill(placementRef.current)), ETHICAL_ADS_FILL_CEILING_MS);
    return () => {
      isDecided = true;
      clearTimeout(ceiling);
    };
  }, []);

  return (
    <SponsoredCardFrame headline="EthicalAds">
      {createElement('div', {
        className: 'dark flat',
        'data-ea-manual': 'true',
        'data-ea-publisher': publisher,
        'data-ea-type': 'text',
        onClickCapture: () => onClicked('ethicalads'),
        ref: placementRef,
      })}
    </SponsoredCardFrame>
  );
}

function WebSponsoredCard({ onShown, placement }: SponsoredCardProps) {
  const sponsor = useSponsorContent(placement, onShown);
  const [publisher] = useState(() => readExtraString('ethicalAdsPublisher'));
  const [isEmpty, setIsEmpty] = useState(publisher === null);
  const markEmpty = useRef(() => setIsEmpty(true)).current;
  if (isEmpty || publisher === null) return <SponsorContentSlot sponsor={sponsor} />;
  return <EthicalAdsPlacement onEmpty={markEmpty} publisher={publisher} sponsor={sponsor} />;
}

export function SponsoredCard(props: SponsoredCardProps) {
  const { eligibility } = useSponsor();
  if (eligibility === 'hidden') return null;
  return (
    <SponsoredSlot placement={props.placement}>
      <WebSponsoredCard {...props} />
    </SponsoredSlot>
  );
}
