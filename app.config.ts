// Expo configuration. The web base path and the content URL depend on the
// build target, so the pre-cutover preview build can live under
// /syntactical/preview without touching the live site.
import type { ExpoConfig } from 'expo/config';

const BASE_URL = process.env.EXPO_BASE_URL ?? '/syntactical';
const CONTENT_BASE_URL = `https://nullvoidundefined.github.io${BASE_URL}/content/`;

const config: ExpoConfig = {
  android: { package: 'dev.nullvoidundefined.syntactical' },
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: { contentBaseUrl: CONTENT_BASE_URL },
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
