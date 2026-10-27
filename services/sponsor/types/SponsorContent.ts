// One sponsored card's content, whatever fed it: an AdMob native ad, an EthicalAds text ad, the house
// Pro card, or a direct sponsor from content/sponsor.json.
export type SponsorSource = 'admob' | 'ethicalads' | 'house' | 'direct';

export type SponsorContent = {
  body: string;
  callToAction: string;
  headline: string;
  href?: string;
  iconUri?: string;
  source: SponsorSource;
};
