// The web build serves no AdMob ads, and EthicalAds sets no cookies, so there is nothing to ask for consent
// about: ads are never requested through this seam and no form exists.
import type { AdsConsentResult } from './adsConsentClient';

export async function gatherConsentAndInitialize(_options: {
  debugDeviceId: string | null;
}): Promise<AdsConsentResult> {
  return { canRequestAds: false, privacyOptionsRequired: false };
}

export async function showAdsPrivacyOptions(): Promise<AdsConsentResult | null> {
  return null;
}
