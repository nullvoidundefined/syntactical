// The sponsored card on the web (iOS and Android use SponsoredCard.tsx), and the only place on the web that
// reads eligibility: nothing renders unless SponsorProvider allows cards, and otherwise the card sits in its
// fixed-height SponsoredSlot. With an EthicalAds publisher id and the client script loaded, the card holds
// one manual text placement inside the frame, and ethicalads.load() runs once the placement is in the DOM.
// The client's answer decides the fill: when load() returns a promise, a non-empty list of placements is a
// fill and an empty one is no fill. ETHICAL_ADS_FILL_CEILING_MS is only a ceiling: a card still undecided
// then (a slow answer, or a client that returns none) counts a placement with a child element as a fill.
// No fill shows the direct sponsor or the house card, as no publisher id or no client does. Nothing reloads
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
import { useSponsorContent, type SponsorContentState } from './useSponsorContent';

type EthicalAdsClient = { load: () => unknown };

function readEthicalAdsClient(): EthicalAdsClient | null {
  if (typeof window === 'undefined') return null;
  const client = (window as { ethicalads?: Partial<EthicalAdsClient> }).ethicalads;
  return typeof client?.load === 'function' ? (client as EthicalAdsClient) : null;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

// The client renders its ad (a .ea-content element) inside the placement; any child element counts.
function hasFill(placement: HTMLElement | null): boolean {
  return placement !== null && placement.childElementCount > 0;
}

type EthicalAdsPlacementProps = {
  client: EthicalAdsClient;
  onEmpty: () => void;
  publisher: string;
  sponsor: SponsorContentState;
};

function EthicalAdsPlacement({ client, onEmpty, publisher, sponsor }: EthicalAdsPlacementProps) {
  const placementRef = useRef<HTMLDivElement>(null);
  // Callbacks are read through a ref so a new identity (the direct sponsor arriving) never restarts the
  // load; the effect depends only on the client.
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
    const answer = client.load();
    if (isThenable(answer)) {
      void answer.then(
        (placements) => decide(Array.isArray(placements) ? placements.length > 0 : hasFill(placementRef.current)),
        () => decide(false),
      );
    }
    const ceiling = setTimeout(() => decide(hasFill(placementRef.current)), ETHICAL_ADS_FILL_CEILING_MS);
    return () => {
      isDecided = true;
      clearTimeout(ceiling);
    };
  }, [client]);

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
  const [client] = useState(readEthicalAdsClient);
  const [isEmpty, setIsEmpty] = useState(publisher === null || client === null);
  const markEmpty = useRef(() => setIsEmpty(true)).current;
  if (isEmpty || publisher === null || client === null) return <SponsorContentSlot sponsor={sponsor} />;
  return <EthicalAdsPlacement client={client} onEmpty={markEmpty} publisher={publisher} sponsor={sponsor} />;
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
