// Reads the AdMob settings app.config.ts put in extra.admob for this platform. It never imports the SDK, so
// the web bundle and SponsorProvider stay free of it; the native card turns { isTest: true } into
// TestIds.NATIVE. A test build always gets the test unit; outside one, a placement with no unit id means the
// house card.
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

// Test mode wins: a test build requests Google's test unit even if a real unit id reached it, so an internal
// build never serves a live ad (clicking one's own live ads is the invalid traffic AdMob suspends for).
export function readAdMobPlacement(placement: SponsorPlacement): { adUnitId: string } | { isTest: true } | null {
  const admob = readAdMobExtra();
  if (admob === null) return null;
  if (admob.isTestAds === true) return { isTest: true };
  const adUnitId = readUnitId(placement === 'results' ? admob.resultsAdUnitId : admob.tracksAdUnitId);
  return adUnitId === null ? null : { adUnitId };
}

export function isAdMobConfigured(): boolean {
  return readAdMobPlacement('results') !== null || readAdMobPlacement('tracks') !== null;
}

export function readConsentDebugDeviceId(): string | null {
  const id = readAdMobExtra()?.consentDebugDeviceId;
  return typeof id === 'string' && id !== '' ? id : null;
}
