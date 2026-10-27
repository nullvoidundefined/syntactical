// Reads the AdMob settings app.config.ts put in extra.admob for this platform. It never imports the SDK, so
// the web bundle and SponsorProvider stay free of it; the native card turns { isTest: true } into
// TestIds.NATIVE. A test build always gets the test unit, and so does every dev build (__DEV__): a dev client
// reads extra.admob from the local Metro server, built from the developer's shell, so the development
// profile's ADMOB_USE_TEST_IDS never reaches it. Outside a test or dev build, a placement with no unit id
// means the house card.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { SponsorPlacement } from './types/SponsorPlacement';

type UnitIds = { android?: string; ios?: string };
type AdMobExtra = {
  consentDebugDeviceId?: string;
  isTestAds?: boolean;
  resultsAdUnitId?: UnitIds;
  tracksAdUnitId?: UnitIds;
};

function readAdMobExtra(): AdMobExtra | null {
  const admob = (Constants.expoConfig?.extra as { admob?: unknown } | undefined)?.admob;
  return typeof admob === 'object' && admob !== null ? (admob as AdMobExtra) : null;
}

function readUnitId(units: UnitIds | undefined): string | null {
  const id = Platform.OS === 'ios' ? units?.ios : Platform.OS === 'android' ? units?.android : undefined;
  return typeof id === 'string' && id !== '' ? id : null;
}

// Test mode wins: a test or dev build requests Google's test unit even if a real unit id reached it, so an
// internal build never serves a live ad (clicking one's own live ads is the invalid traffic AdMob suspends
// for). isDev is injectable for tests, since Jest runs with __DEV__ true.
export function readAdMobPlacement(
  placement: SponsorPlacement,
  isDev: boolean = __DEV__,
): { adUnitId: string } | { isTest: true } | null {
  const admob = readAdMobExtra();
  if (admob === null) return null;
  if (admob.isTestAds === true || isDev) return { isTest: true };
  const adUnitId = readUnitId(placement === 'results' ? admob.resultsAdUnitId : admob.tracksAdUnitId);
  return adUnitId === null ? null : { adUnitId };
}

export function isAdMobConfigured(isDev: boolean = __DEV__): boolean {
  return readAdMobPlacement('results', isDev) !== null || readAdMobPlacement('tracks', isDev) !== null;
}

export function readConsentDebugDeviceId(): string | null {
  const id = readAdMobExtra()?.consentDebugDeviceId;
  return typeof id === 'string' && id !== '' ? id : null;
}
