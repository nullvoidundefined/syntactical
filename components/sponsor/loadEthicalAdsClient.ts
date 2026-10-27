// The EthicalAds client for the web sponsored card. No page carries the client script: the first eligible
// card with a publisher id injects it into the head (async, so it never delays the app bundle), once per
// page, and every card waits on the same load. So a Pro viewer, or a build without a publisher id, never
// contacts EthicalAds. Resolves with window.ethicalads once the script has loaded, or null when the script
// fails to load or defines no client. The card bounds the wait with its fill ceiling.
import { ETHICAL_ADS_SCRIPT_URL } from '../../constants/sponsor';

export type EthicalAdsClient = { load: () => unknown };

const SCRIPT_SELECTOR = `script[src="${ETHICAL_ADS_SCRIPT_URL}"]`;
const loads = new WeakMap<HTMLScriptElement, Promise<EthicalAdsClient | null>>();

export function readEthicalAdsClient(): EthicalAdsClient | null {
  if (typeof window === 'undefined') return null;
  const client = (window as { ethicalads?: Partial<EthicalAdsClient> }).ethicalads;
  return typeof client?.load === 'function' ? (client as EthicalAdsClient) : null;
}

function injectScript(): HTMLScriptElement {
  const script = document.createElement('script');
  script.async = true;
  script.src = ETHICAL_ADS_SCRIPT_URL;
  document.head.appendChild(script);
  return script;
}

export function loadEthicalAdsClient(): Promise<EthicalAdsClient | null> {
  const present = readEthicalAdsClient();
  if (present !== null) return Promise.resolve(present);
  if (typeof document === 'undefined') return Promise.resolve(null);
  const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
  const pending = existing === null ? undefined : loads.get(existing);
  if (pending !== undefined) return pending;
  const script = existing ?? injectScript();
  const load = new Promise<EthicalAdsClient | null>((resolve) => {
    script.addEventListener('load', () => resolve(readEthicalAdsClient()), { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
  });
  loads.set(script, load);
  return load;
}
