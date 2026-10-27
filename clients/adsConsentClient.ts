// The one module that talks to Google's consent (UMP) and Mobile Ads SDKs on iOS and Android, so
// SponsorProvider has one seam (the web build uses adsConsentClient.web.ts). It asks for consent where the
// user's region needs it, then initialises the SDK whatever the answer: requests are non-personalised, so a
// declined form still allows limited ads (Review Focus 21). Every failure is logged and swallowed; the result
// says whether ads may be requested and whether Settings must offer the privacy options form.
import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';

import { logWarning } from './logClient';

export type AdsConsentResult = { canRequestAds: boolean; privacyOptionsRequired: boolean };

type ConsentInfo = Awaited<ReturnType<typeof AdsConsent.getConsentInfo>>;

function toResult(info: ConsentInfo | null): AdsConsentResult {
  return {
    canRequestAds: info?.canRequestAds === true,
    privacyOptionsRequired:
      info?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  };
}

export async function gatherConsentAndInitialize({
  debugDeviceId,
}: {
  debugDeviceId: string | null;
}): Promise<AdsConsentResult> {
  try {
    await AdsConsent.requestInfoUpdate(
      debugDeviceId === null
        ? undefined
        : { debugGeography: AdsConsentDebugGeography.EEA, testDeviceIdentifiers: [debugDeviceId] },
    );
    await AdsConsent.loadAndShowConsentFormIfRequired();
  } catch (err) {
    logWarning({ err }, 'ads consent flow failed');
  }
  const info = await AdsConsent.getConsentInfo().catch((err: unknown) => {
    logWarning({ err }, 'ads consent info unavailable');
    return null;
  });
  try {
    await mobileAds().initialize();
  } catch (err) {
    logWarning({ err }, 'ads SDK failed to initialise');
    return { canRequestAds: false, privacyOptionsRequired: false };
  }
  return toResult(info);
}

export async function showAdsPrivacyOptions(): Promise<AdsConsentResult | null> {
  try {
    return toResult(await AdsConsent.showPrivacyOptionsForm());
  } catch (err) {
    logWarning({ err }, 'ads privacy options form failed');
    return null;
  }
}
