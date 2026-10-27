// Hosts the Pro sheet the house card opens (source house_card), next to the card, so no screen that shows
// a card has to host it. A signed-in user gets area 4's ProOffer, the same buy flow as Settings and
// Ask (its messages, the pending re-check, the web redirect to /purchase-complete). ProOffer serves no
// guest, so a guest gets the bare sheet with no prices (usePurchases has none for a guest either), and its
// Buy sends them to sign in and back to this route.
import { router, usePathname } from 'expo-router';

import { useSignedInUserId } from '../../state/AuthProvider';
import { ProOffer } from '../purchase/ProOffer';
import { ProSheet } from '../purchase/ProSheet';

const GUEST_PRICES: Readonly<Record<string, string>> = {};

export function SponsorProSheetHost({ onClose }: { onClose: () => void }) {
  const userId = useSignedInUserId();
  const pathname = usePathname();

  function sendGuestToSignIn() {
    onClose();
    router.push({ params: { returnTo: pathname }, pathname: '/sign-in' });
  }

  if (userId !== null) return <ProOffer onClose={onClose} source="house_card" />;
  return (
    <ProSheet
      isBuying={false}
      message={null}
      onBuy={sendGuestToSignIn}
      onClose={onClose}
      prices={GUEST_PRICES}
      source="house_card"
    />
  );
}
