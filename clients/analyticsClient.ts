// The one module that talks to PostHog, so tests can mock it. Events come from
// the fixed registry in constants/analyticsEvents.ts. Persistence is 'memory':
// no cookie and no AsyncStorage key is ever written, so a guest is anonymous
// and cookieless; a signed-in user is identified again on each launch.
// With no public key configured every call is a no-op. In development a name
// outside the registry or a property named email, code, or token throws; in
// production the event is dropped with a warning, so analytics never breaks a
// round.
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

import {
  ANALYTICS_EVENTS,
  FORBIDDEN_ANALYTICS_PROPERTIES,
  type AnalyticsEventName,
} from '../constants/analyticsEvents';

import { logWarning } from './logClient';

type AnalyticsProperties = Record<string, string | number | boolean>;

let client: PostHog | null | undefined;

function readClient(): PostHog | null {
  if (client !== undefined) return client;
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const { posthogHost, posthogKey } = extra ?? {};
  if (typeof posthogKey !== 'string' || posthogKey === '') {
    client = null;
    return client;
  }
  try {
    client = new PostHog(posthogKey, {
      captureAppLifecycleEvents: false,
      disableGeoip: true,
      ...(typeof posthogHost === 'string' && posthogHost !== '' ? { host: posthogHost } : {}),
      persistence: 'memory',
    });
  } catch (err) {
    // A failed construction is not retried on every event: analytics stays off.
    logWarning({ err }, 'analytics client failed to start');
    client = null;
  }
  return client;
}

function findProblem(name: string, properties: AnalyticsProperties): string | null {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(name))
    return 'analytics event is not in the registry';
  const isForbidden = Object.keys(properties).some((key) =>
    FORBIDDEN_ANALYTICS_PROPERTIES.some((forbidden) => key.toLowerCase().includes(forbidden)),
  );
  return isForbidden ? 'analytics event has a forbidden property' : null;
}

export function trackEvent(name: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  const problem = findProblem(name, properties);
  if (problem !== null) {
    if (__DEV__) throw new Error(`${problem}: ${name}`);
    logWarning({ event: String(name) }, problem);
    return;
  }
  try {
    readClient()?.capture(name, properties);
  } catch (err) {
    logWarning({ err }, 'analytics capture failed');
  }
}

// After sign-in: ties later events to the server user id (never the email).
export function identifyAnalyticsUser(userId: string): void {
  try {
    readClient()?.identify(userId);
  } catch (err) {
    logWarning({ err }, 'analytics identify failed');
  }
}

// After sign-out: the next events belong to a fresh anonymous id.
export function resetAnalyticsUser(): void {
  try {
    readClient()?.reset();
  } catch (err) {
    logWarning({ err }, 'analytics reset failed');
  }
}
