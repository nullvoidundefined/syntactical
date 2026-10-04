// Expo configuration. The web base path and the content URL depend on the
// build target, so the pre-cutover preview build can live under
// /syntactical/preview without touching the live site. Only the two known base
// paths are accepted, so the content URL can never leave the pinned origin.
import type { ExpoConfig } from 'expo/config';

const CONTENT_ORIGIN = 'https://nullvoidundefined.github.io';
const API_BASE_URL = 'https://api.syntactical.dev/v1/';
const ALLOWED_BASE_URLS = ['/syntactical', '/syntactical/preview'];

function readBaseUrl(): string {
  const { EXPO_BASE_URL: baseUrl = '/syntactical' } = process.env;
  if (!ALLOWED_BASE_URLS.includes(baseUrl)) {
    throw new Error(`EXPO_BASE_URL must be one of ${ALLOWED_BASE_URLS.join(', ')}`);
  }
  return baseUrl;
}

const BASE_URL = readBaseUrl();
const CONTENT_BASE_URL = new URL(`${BASE_URL}/content/`, CONTENT_ORIGIN).href;

const config: ExpoConfig = {
  android: { package: 'dev.nullvoidundefined.syntactical' },
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: { apiBaseUrl: API_BASE_URL, contentBaseUrl: CONTENT_BASE_URL },
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
