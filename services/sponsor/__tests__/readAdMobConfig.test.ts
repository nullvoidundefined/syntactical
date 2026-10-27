// services/sponsor/__tests__/readAdMobConfig.test.ts
// The native card's ad unit for a placement on this platform (iOS under the native Jest preset): Google's
// test unit in a test build, whatever else is configured (test mode wins, so an internal build never
// requests a live ad); otherwise the configured unit, or none (the house card).
import { setExpoExtra } from '../../../config/expoConstantsMock';
import { isAdMobConfigured, readAdMobPlacement, readConsentDebugDeviceId } from '../readAdMobConfig';

const UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
const BASE = { androidAppId: 'a', iosAppId: 'i', isTestAds: false, resultsAdUnitId: {}, tracksAdUnitId: {} };

function setAdMob(admob: Record<string, unknown> | undefined) {
  setExpoExtra({ contentBaseUrl: 'https://example.test/content/', ...(admob ? { admob } : {}) });
}

afterEach(() => setAdMob(undefined));

describe('readAdMobConfig', () => {
  it('reads the iOS unit id for a placement', () => {
    setAdMob({ ...BASE, resultsAdUnitId: { android: 'other', ios: UNIT_ID } });
    expect(readAdMobPlacement('results')).toEqual({ adUnitId: UNIT_ID });
    expect(readAdMobPlacement('tracks')).toBeNull();
    expect(isAdMobConfigured()).toBe(true);
  });

  it('uses the test unit in a test build even when a unit id is configured', () => {
    setAdMob({ ...BASE, isTestAds: true, resultsAdUnitId: { ios: UNIT_ID }, tracksAdUnitId: { ios: UNIT_ID } });
    expect(readAdMobPlacement('results')).toEqual({ isTest: true });
    expect(readAdMobPlacement('tracks')).toEqual({ isTest: true });
  });

  it('uses the test unit in a test build without unit ids', () => {
    setAdMob({ ...BASE, consentDebugDeviceId: 'DEVICE-1234', isTestAds: true });
    expect(readAdMobPlacement('tracks')).toEqual({ isTest: true });
    expect(isAdMobConfigured()).toBe(true);
    expect(readConsentDebugDeviceId()).toBe('DEVICE-1234');
  });

  it('is unconfigured with no unit ids, no test ads, or no admob extra at all', () => {
    setAdMob(BASE);
    expect(readAdMobPlacement('results')).toBeNull();
    expect(isAdMobConfigured()).toBe(false);
    setAdMob(undefined);
    expect(isAdMobConfigured()).toBe(false);
    expect(readConsentDebugDeviceId()).toBeNull();
  });
});
