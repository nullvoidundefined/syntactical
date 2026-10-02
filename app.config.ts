// Expo configuration. The web base path and the content URL depend on the
// build target, so the pre-cutover preview build can live under
// /syntactical/preview without touching the live site.
import type { ExpoConfig } from 'expo/config';

const BASE_URL = process.env.EXPO_BASE_URL ?? '/syntactical';
const CONTENT_BASE_URL = `https://nullvoidundefined.github.io${BASE_URL}/content/`;

const config: ExpoConfig = {
  name: 'Syntactical',
  slug: 'syntactical',
  scheme: 'syntactical',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: { bundleIdentifier: 'dev.nullvoidundefined.syntactical', supportsTablet: true },
  android: { package: 'dev.nullvoidundefined.syntactical' },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router'],
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: { contentBaseUrl: CONTENT_BASE_URL },
};

export default config;
