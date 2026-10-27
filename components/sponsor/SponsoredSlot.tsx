// The fixed-height box every sponsored card renders in, from the card's first frame (decision 15). While
// a feed is pending, SponsoredSlotPlaceholder fills it with an empty frame that carries only the Sponsored
// label; the filled card replaces it at the same height. So a card that fills late never moves Retry,
// Menu, or the track groups under the user's finger, which AdMob's policy against accidental taps asks
// for. The slot clips, so no card (a two-line headline, say) can draw past it. The placeholder is hidden
// from screen readers: it has nothing to announce until content arrives.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SPONSOR_LABEL_MIN_HEIGHT, SPONSOR_SLOT_HEIGHT } from '../../constants/sponsor';
import type { SponsorPlacement } from '../../services/sponsor/types/SponsorPlacement';

import { SPONSOR_CLASSES } from './SponsoredCardFrame';

const SLOT_SPACING: Record<SponsorPlacement, string> = {
  results: 'mt-6 w-full max-w-xs',
  tracks: 'mb-6 w-full',
};

type SponsoredSlotProps = { children: ReactNode; placement: SponsorPlacement };

export function SponsoredSlot({ children, placement }: SponsoredSlotProps) {
  return (
    <View
      testID="sponsored-slot"
      className={SLOT_SPACING[placement]}
      style={{ height: SPONSOR_SLOT_HEIGHT, overflow: 'hidden' }}
    >
      {children}
    </View>
  );
}

export function SponsoredSlotPlaceholder() {
  return (
    <View testID="sponsored-card-placeholder" aria-hidden className={SPONSOR_CLASSES.frame}>
      <Text className={SPONSOR_CLASSES.label} style={{ minHeight: SPONSOR_LABEL_MIN_HEIGHT }}>
        Sponsored
      </Text>
    </View>
  );
}
