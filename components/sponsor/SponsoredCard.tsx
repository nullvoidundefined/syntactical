// The sponsored card on iOS and Android (the web build uses SponsoredCard.web.tsx). The one place that
// reads eligibility: nothing renders unless SponsorProvider allows cards, so a Pro user never gets even
// the reserved slot. Otherwise the house card or a direct sponsor, inside the fixed-height SponsoredSlot.
// onShown tells the host the card was shown, once (the results screen counts it toward the cadence).
import type { SponsorPlacement } from '../../services/sponsor/types/SponsorPlacement';
import { useSponsor } from '../../state/SponsorProvider';

import { SponsorContentSlot } from './SponsorContentSlot';
import { SponsoredSlot } from './SponsoredSlot';
import { useSponsorContent } from './useSponsorContent';

export type SponsoredCardProps = { onShown?: () => void; placement: SponsorPlacement };

function SponsoredCardBody({ onShown, placement }: SponsoredCardProps) {
  const sponsor = useSponsorContent(placement, onShown);
  return <SponsorContentSlot sponsor={sponsor} />;
}

export function SponsoredCard(props: SponsoredCardProps) {
  const { eligibility } = useSponsor();
  if (eligibility === 'hidden') return null;
  return (
    <SponsoredSlot placement={props.placement}>
      <SponsoredCardBody {...props} />
    </SponsoredSlot>
  );
}
