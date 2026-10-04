// Expo configuration. The web base path and the content URL depend on the
// build target, so the pre-cutover preview build can live under
// /syntactical/preview without touching the live site.
import type { ExpoConfig } from 'expo/config';

const CONTENT_ORIGIN = 'https://nullvoidundefined.github.io';
const DEFAULT_API_BASE_URL = 'https://api.syntactical.dev/v1/';

function readBaseUrl(): string {
  return process.env.EXPO_BASE_URL ?? '/syntactical';
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

// A staging build points at its own API through API_BASE_URL; it must be an https URL that ends in a slash.
// The error names the variable, never the value.
function readApiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  if (value === undefined || value === '') return DEFAULT_API_BASE_URL;
  if (!value.startsWith('https://') || !value.endsWith('/')) {
    throw new Error('API_BASE_URL must be an https URL that ends with a slash');
  }
  return value;
}

const BASE_URL = readBaseUrl();
const CONTENT_BASE_URL = new URL(`${BASE_URL}/content/`, CONTENT_ORIGIN).href;

const config: ExpoConfig = {
  android: { package: 'dev.nullvoidundefined.syntactical' },
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: {
    apiBaseUrl: readApiBaseUrl(),
    contentBaseUrl: CONTENT_BASE_URL,
    posthogHost: readPostHogHost(),
    posthogKey: readPublicKey('POSTHOG_KEY', 'phc', 'PostHog'),
    revenueCatAppleKey: readPublicKey('REVENUECAT_APPLE_KEY', 'appl'),
    revenueCatGoogleKey: readPublicKey('REVENUECAT_GOOGLE_KEY', 'goog'),
    revenueCatWebBillingKey: readPublicKey('REVENUECAT_WEB_BILLING_KEY', 'rcb'),
  },
  ios: { bundleIdentifier: 'dev.nullvoidundefined.syntactical', supportsTablet: true },
  name: 'Syntactical',
  orientation: 'portrait',
  plugins: ['expo-router'],
  scheme: 'syntactical',
  slug: 'syntactical',
  userInterfaceStyle: 'dark',
  version: '1.0.0',
  web: { bundler: 'metro', output: 'single' },
};

export default config;
