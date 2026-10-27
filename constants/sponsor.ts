// Sponsored cards: the house card shown when no other sponsor fills a slot, the results card cadence,
// the attribution label's minimum height, and the fixed height every card slot reserves.
import type { SponsorContent } from '../services/sponsor/types/SponsorContent';

export const HOUSE_CARD: SponsorContent = {
  body: 'No sponsored cards. 20 asks a day.',
  callToAction: 'See Pro',
  headline: 'Syntactical Pro',
  source: 'house',
};

// The results card shows once ROUNDS_BETWEEN rounds have completed since the last card (or since the first
// launch), so the first one lands on the third round's results and then every third round.
export const SPONSOR = { ROUNDS_BETWEEN: 3 } as const;

// AdMob's attribution rule: the "Sponsored" label is at least 15 points high, at the top of the card.
export const SPONSOR_LABEL_MIN_HEIGHT = 15;

// Every card slot is this tall from its first frame, empty or filled, so a feed that fills late never
// moves Retry, Menu, or the track list (AdMob's rule against placements that invite accidental taps).
export const SPONSOR_SLOT_HEIGHT = 160;
