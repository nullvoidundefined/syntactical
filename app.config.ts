// Expo configuration. The web app is a static export (one HTML page per route) served from the root of
// https://syntactical.dev (B-55) by Cloudflare Pages, which is same-site with the API so the SameSite=Lax session
// cookie works. EXPO_BASE_URL may only be a lowercase sub-path such as /preview, and the content URL follows it.
import type { ExpoConfig } from 'expo/config';

const CONTENT_ORIGIN = 'https://syntactical.dev';
const DEFAULT_API_BASE_URL = 'https://api.syntactical.dev/v1/';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Google's sample AdMob app ids. The SDK will not start without an app id, so a development, preview, or
// local build with no real one carries these; it requests ads only in a test build or for unit ids it was
// given. A production build refuses them (readAdMobId).
const ADMOB_SAMPLE_APP_IDS = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
} as const;
// Every Google sample app id and test ad unit id belongs to this publisher.
const ADMOB_GOOGLE_SAMPLE_PUBLISHER = 'ca-app-pub-3940256099942544';
const ADMOB_APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;
const ADMOB_UNIT_ID = /^ca-app-pub-\d{16}\/\d{10}$/;
const CONSENT_DEBUG_DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
// The SKAdNetwork ids Google asks iOS apps to declare, copied in full and in order from the guide of
// react-native-google-mobile-ads 17.4.0 (docs/installation/expo.mdx, "skAdNetworkItems"; its README carries no
// list), Google's own id first. The config test pins the count, so a shortened list fails.
const ADMOB_SKADNETWORK_ITEMS = [
  'cstr6suwn9.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  'ydx93a7ass.skadnetwork',
  'p78axxw29g.skadnetwork',
  'v72qych5uu.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'cp8zw746q7.skadnetwork',
  '3sh42y64q3.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  's39g8k73mm.skadnetwork',
  'wg4vff78zm.skadnetwork',
  '3qy4746246.skadnetwork',
  'f38h382jlk.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'su67r6k2v3.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  't38b2kh725.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'vutu7akeur.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'n38lu8286q.skadnetwork',
  '47vhws6wlr.skadnetwork',
  'kbd757ywx3.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  '22mmun2rn5.skadnetwork',
  '44jx6755aq.skadnetwork',
  'k674qkevps.skadnetwork',
  '4468km3ulz.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '8s468mfl3y.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'uw77j35x4d.skadnetwork',
  '578prtvx9j.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '97r2b46745.skadnetwork',
  '3qcr597p9d.skadnetwork',
];

// The base URL must be empty or a lowercase sub-path; the error names the variable, never the value.
function readBaseUrl(): string {
  const value = process.env.EXPO_BASE_URL;
  if (value === undefined || value === '') return '';
  if (!/^(\/[a-z0-9][a-z0-9-]*)+$/.test(value)) {
    throw new Error('EXPO_BASE_URL must be empty or a lowercase path such as /preview');
  }
  return value;
}

// A vendor key reaches the bundle only when it carries its public prefix, so
// a secret or Stripe key can never be built in. The error names the variable,
// never the value.
function readPublicKey(envName: string, prefix: string, vendor = 'RevenueCat'): string | undefined {
  const value = process.env[envName];
  if (value === undefined || value === '') return undefined;
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_.-]+$`).test(value)) {
    throw new Error(`${envName} must be a public ${vendor} key`);
  }
  return value;
}

// The analytics host must be an https URL; the error names the variable, never the value.
function readPostHogHost(): string | undefined {
  const value = process.env.POSTHOG_HOST;
  if (value === undefined || value === '') return undefined;
  if (!value.startsWith('https://')) throw new Error('POSTHOG_HOST must start with https://');
  return value;
}

// An EthicalAds publisher id is a lowercase slug; the error names the variable, never the value.
function readEthicalAdsPublisher(): string | undefined {
  const value = process.env.ETHICALADS_PUBLISHER;
  if (value === undefined || value === '') return undefined;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error('ETHICALADS_PUBLISHER must be a lowercase slug');
  return value;
}

// An AdMob id is public but must have its kind's shape. A production EAS build must carry every id, and
// none may be one of Google's sample or test ids, so a store build never ships them; development, preview,
// and local builds may leave an id unset. Errors name the variable, never the value.
function readAdMobId(envName: string, kind: 'app' | 'ad unit', isProduction: boolean): string | undefined {
  const value = process.env[envName];
  if (value === undefined || value === '') {
    if (isProduction) throw new Error(`${envName} must be set in a production build`);
    return undefined;
  }
  if (!(kind === 'app' ? ADMOB_APP_ID : ADMOB_UNIT_ID).test(value)) {
    throw new Error(`${envName} must be an AdMob ${kind} id`);
  }
  if (isProduction && value.startsWith(ADMOB_GOOGLE_SAMPLE_PUBLISHER)) {
    throw new Error(`${envName} must not be a Google sample or test id in a production build`);
  }
  return value;
}

// A test build (ADMOB_USE_TEST_IDS=true, the development and preview profiles) serves Google's test native
// ads and may force the EEA consent form on one device; any other build requests ads only for its unit ids.
// EAS sets EAS_BUILD_PROFILE; a production build may not serve test ads.
function readAdMobConfig() {
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
  const isTestAds = process.env.ADMOB_USE_TEST_IDS === 'true';
  if (isProduction && isTestAds) throw new Error('ADMOB_USE_TEST_IDS must not be true in a production build');
  const debugDevice = process.env.ADMOB_CONSENT_DEBUG_DEVICE_ID;
  const hasDebugDevice = isTestAds && debugDevice !== undefined && CONSENT_DEBUG_DEVICE_ID.test(debugDevice);
  return {
    androidAppId: readAdMobId('ADMOB_ANDROID_APP_ID', 'app', isProduction) ?? ADMOB_SAMPLE_APP_IDS.android,
    iosAppId: readAdMobId('ADMOB_IOS_APP_ID', 'app', isProduction) ?? ADMOB_SAMPLE_APP_IDS.ios,
    isTestAds,
    ...(hasDebugDevice ? { consentDebugDeviceId: debugDevice } : {}),
    resultsAdUnitId: {
      android: readAdMobId('ADMOB_ANDROID_RESULTS_UNIT_ID', 'ad unit', isProduction),
      ios: readAdMobId('ADMOB_IOS_RESULTS_UNIT_ID', 'ad unit', isProduction),
    },
    tracksAdUnitId: {
      android: readAdMobId('ADMOB_ANDROID_TRACKS_UNIT_ID', 'ad unit', isProduction),
      ios: readAdMobId('ADMOB_IOS_TRACKS_UNIT_ID', 'ad unit', isProduction),
    },
  };
}

// The e2e build (E2E_API_BASE_URL, E2E_CONTENT_BASE_URL) points the app at servers on this machine.
// Only an http URL on a loopback host is accepted, so a real build cannot be redirected by these;
// the error names the variable, never the value.
function readLoopbackUrl(envName: string, fallback: string): string {
  const value = process.env[envName];
  if (value === undefined || value === '') return fallback;
  const isLoopback =
    URL.canParse(value) && new URL(value).protocol === 'http:' && LOOPBACK_HOSTS.has(new URL(value).hostname);
  if (!isLoopback) throw new Error(`${envName} must be an http URL on a loopback host`);
  return value;
}

// A staging build points at its own API through API_BASE_URL; it must be an https URL that ends in a slash.
// The error names the variable, never the value.
function readApiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  if (value === undefined || value === '') return DEFAULT_API_BASE_URL;
  if (!/^https:\/\/[^/\s]+\/(\S*\/)?$/.test(value)) {
    throw new Error('API_BASE_URL must be an https URL that ends with a slash');
  }
  return value;
}

const BASE_URL = readBaseUrl();
const ADMOB = readAdMobConfig();
const CONTENT_BASE_URL = readLoopbackUrl('E2E_CONTENT_BASE_URL', new URL(`${BASE_URL}/content/`, CONTENT_ORIGIN).href);

const config: ExpoConfig = {
  android: { package: 'dev.nullvoidundefined.syntactical' },
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: {
    admob: ADMOB,
    apiBaseUrl: readLoopbackUrl('E2E_API_BASE_URL', readApiBaseUrl()),
    contentBaseUrl: CONTENT_BASE_URL,
    // Links EAS builds to the Expo project @nullvoidundefined/syntactical (created 2026-10-06).
    eas: { projectId: 'a6a0d002-f2b6-49ac-91d6-d83150e7fa2d' },
    ethicalAdsPublisher: readEthicalAdsPublisher(),
    posthogHost: readPostHogHost(),
    posthogKey: readPublicKey('POSTHOG_KEY', 'phc', 'PostHog'),
    revenueCatAppleKey: readPublicKey('REVENUECAT_APPLE_KEY', 'appl'),
    revenueCatGoogleKey: readPublicKey('REVENUECAT_GOOGLE_KEY', 'goog'),
    revenueCatWebBillingKey: readPublicKey('REVENUECAT_WEB_BILLING_KEY', 'rcb'),
  },
  ios: {
    bundleIdentifier: 'dev.nullvoidundefined.syntactical',
    // The app uses only the platform's HTTPS and SHA-256 hashing, which are exempt from export documentation.
    config: { usesNonExemptEncryption: false },
    supportsTablet: true,
  },
  name: 'Syntactical',
  orientation: 'portrait',
  plugins: [
    'expo-router',
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: ADMOB.androidAppId,
        delayAppMeasurementInit: true,
        iosAppId: ADMOB.iosAppId,
        skAdNetworkItems: ADMOB_SKADNETWORK_ITEMS,
      },
    ],
  ],
  scheme: 'syntactical',
  slug: 'syntactical',
  userInterfaceStyle: 'dark',
  version: '1.0.0',
  web: { bundler: 'metro', output: 'static' },
};

export default config;
