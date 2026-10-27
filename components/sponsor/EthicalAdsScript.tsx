// The EthicalAds client script for app/+html.tsx: deferred, and present only when a publisher id is
// configured, so a build without one loads no third-party script.
import { readExtraString } from '../../config/readExtraString';
import { ETHICAL_ADS_SCRIPT_URL } from '../../constants/sponsor';

export function EthicalAdsScript() {
  if (readExtraString('ethicalAdsPublisher') === null) return null;
  return <script defer src={ETHICAL_ADS_SCRIPT_URL} />;
}
