// The house or direct sponsor card, used by every feed's fallback: it reports ad_shown once after it
// first renders, and its button reports ad_clicked and then opens the Pro sheet (house card) or the
// sponsor's https link (direct sponsor).
import { useEffect, useState } from 'react';

import { Linking } from 'react-native';

import { SponsorContentCard } from './SponsoredCardFrame';
import { SponsorProSheetHost } from './SponsorProSheetHost';
import type { SponsorContentState } from './useSponsorContent';

export function SponsorContentSlot({ sponsor }: { sponsor: SponsorContentState }) {
  const { content, onClicked, onShown } = sponsor;
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    onShown(content.source);
  }, [content, onShown]);

  function handlePress() {
    onClicked(content.source);
    if (content.source === 'house') setIsSheetOpen(true);
    else if (content.href !== undefined) void Linking.openURL(content.href);
  }

  return (
    <>
      <SponsorContentCard content={content} onPress={handlePress} />
      {isSheetOpen ? <SponsorProSheetHost onClose={() => setIsSheetOpen(false)} /> : null}
    </>
  );
}
