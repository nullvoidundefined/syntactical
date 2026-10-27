// The house or direct sponsor card, used by every feed's fallback. Until the direct sponsor request
// settles it holds the empty placeholder and reports nothing, so a cold start never shows (or counts) the
// house card a direct sponsor then replaces. Once the content is known it reports ad_shown once, and its
// button reports ad_clicked and then opens the Pro sheet (house card) or the sponsor's https link (direct
// sponsor).
import { useEffect, useState } from 'react';

import { Linking } from 'react-native';

import { SponsorContentCard } from './SponsoredCardFrame';
import { SponsoredSlotPlaceholder } from './SponsoredSlot';
import { SponsorProSheetHost } from './SponsorProSheetHost';
import type { SponsorContentState } from './useSponsorContent';

export function SponsorContentSlot({ sponsor }: { sponsor: SponsorContentState }) {
  const { content, isSettled, onClicked, onShown } = sponsor;
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    if (isSettled) onShown(content.source);
  }, [content, isSettled, onShown]);

  function handlePress() {
    onClicked(content.source);
    if (content.source === 'house') setIsSheetOpen(true);
    else if (content.href !== undefined) void Linking.openURL(content.href);
  }

  if (!isSettled) return <SponsoredSlotPlaceholder />;
  return (
    <>
      <SponsorContentCard content={content} onPress={handlePress} />
      {isSheetOpen ? <SponsorProSheetHost onClose={() => setIsSheetOpen(false)} /> : null}
    </>
  );
}
