// app/__tests__/appConfigAdMob.test.ts
// AdMob ids are public but must have their kind's shape before they reach the bundle: app ids carry "~", ad
// unit ids "/". A development, preview, or local build without app ids carries Google's sample app ids so the
// SDK can start, and requests ads only in a test build or for the unit ids it was given. A production EAS
// build (EAS_BUILD_PROFILE=production) refuses to load unless all six ids are set and none is Google's sample
// or test id, and refuses test ads. The plugin delays app measurement and lists the SKAdNetwork ids. Errors
// name the variable, never the value.
import type { ExpoConfig } from 'expo/config';

const ENV_NAMES = [
  'ADMOB_ANDROID_APP_ID',
  'ADMOB_IOS_APP_ID',
  'ADMOB_ANDROID_RESULTS_UNIT_ID',
  'ADMOB_ANDROID_TRACKS_UNIT_ID',
  'ADMOB_IOS_RESULTS_UNIT_ID',
  'ADMOB_IOS_TRACKS_UNIT_ID',
  'ADMOB_USE_TEST_IDS',
  'ADMOB_CONSENT_DEBUG_DEVICE_ID',
  'EAS_BUILD_PROFILE',
] as const;
const ORIGINAL = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

const SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const APP_ID = 'ca-app-pub-1234567890123456~1234567890';
const UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
// Google's test native advanced units (Android, then iOS, which is also TestIds.NATIVE in the SDK).
const TEST_ANDROID_UNIT_ID = 'ca-app-pub-3940256099942544/2247696110';
const TEST_IOS_UNIT_ID = 'ca-app-pub-3940256099942544/3986624511';

// Step 0's count of the SKAdNetwork ids react-native-google-mobile-ads 17.4.0 documents. Its README carries no
// list, so the count is taken from the library's own Expo install guide at v17.4.0
// (docs/installation/expo.mdx, "Enable SKAdNetwork to track conversions"), which mirrors Google's page.
const ADMOB_SKADNETWORK_COUNT = 50;

const APP_ID_NAMES = ['ADMOB_ANDROID_APP_ID', 'ADMOB_IOS_APP_ID'] as const;
const UNIT_ID_NAMES = [
  'ADMOB_ANDROID_RESULTS_UNIT_ID',
  'ADMOB_ANDROID_TRACKS_UNIT_ID',
  'ADMOB_IOS_RESULTS_UNIT_ID',
  'ADMOB_IOS_TRACKS_UNIT_ID',
] as const;
type AdMobIdName = (typeof APP_ID_NAMES)[number] | (typeof UNIT_ID_NAMES)[number];

// A production EAS build with every id real, then the overrides (undefined removes a variable).
function setProductionBuild(overrides: Partial<Record<AdMobIdName, string | undefined>> = {}): void {
  process.env.EAS_BUILD_PROFILE = 'production';
  const ids: Record<string, string | undefined> = {
    ...Object.fromEntries(APP_ID_NAMES.map((name) => [name, APP_ID])),
    ...Object.fromEntries(UNIT_ID_NAMES.map((name) => [name, UNIT_ID])),
    ...overrides,
  };
  for (const [name, value] of Object.entries(ids)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function loadConfig(): ExpoConfig {
  let loaded: ExpoConfig | undefined;
  jest.isolateModules(() => {
    loaded = require('../../app.config').default as ExpoConfig;
  });
  return loaded as ExpoConfig;
}

function readAdMob(): Record<string, unknown> {
  return (loadConfig().extra as { admob: Record<string, unknown> }).admob;
}

function readPluginOptions(): Record<string, unknown> {
  const entry = (loadConfig().plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads',
  ) as [string, Record<string, unknown>] | undefined;
  if (!entry) throw new Error('ads plugin missing');
  return entry[1];
}

function captureError(): Error | null {
  try {
    loadConfig();
  } catch (error) {
    return error as Error;
  }
  return null;
}

beforeEach(() => {
  for (const name of ENV_NAMES) delete process.env[name];
});

afterAll(() => {
  for (const name of ENV_NAMES) {
    if (ORIGINAL[name] === undefined) delete process.env[name];
    else process.env[name] = ORIGINAL[name];
  }
});

describe('app.config AdMob', () => {
  it('falls back to the sample app ids with no unit ids and no test ads', () => {
    expect(readAdMob()).toEqual({
      androidAppId: SAMPLE_ANDROID_APP_ID,
      iosAppId: SAMPLE_IOS_APP_ID,
      isTestAds: false,
      resultsAdUnitId: { android: undefined, ios: undefined },
      tracksAdUnitId: { android: undefined, ios: undefined },
    });
  });

  it('declares the plugin with the app ids, delayed measurement, and the SKAdNetwork list', () => {
    process.env.ADMOB_IOS_APP_ID = APP_ID;
    const options = readPluginOptions();
    expect(options).toEqual(
      expect.objectContaining({ androidAppId: SAMPLE_ANDROID_APP_ID, delayAppMeasurementInit: true, iosAppId: APP_ID }),
    );
    expect(options.skAdNetworkItems).toEqual(expect.arrayContaining(['cstr6suwn9.skadnetwork']));
  });

  it("lists every SKAdNetwork id in the library's README, each once", () => {
    const items = readPluginOptions().skAdNetworkItems as string[];
    expect(items).toHaveLength(ADMOB_SKADNETWORK_COUNT);
    expect(new Set(items).size).toBe(items.length);
    for (const item of items) expect(item).toMatch(/^[a-z0-9]+\.skadnetwork$/);
  });

  it('carries real app and unit ids', () => {
    process.env.ADMOB_ANDROID_APP_ID = APP_ID;
    process.env.ADMOB_IOS_RESULTS_UNIT_ID = UNIT_ID;
    process.env.ADMOB_ANDROID_TRACKS_UNIT_ID = UNIT_ID;
    const admob = readAdMob();
    expect(admob.androidAppId).toBe(APP_ID);
    expect(admob.resultsAdUnitId).toEqual({ android: undefined, ios: UNIT_ID });
    expect(admob.tracksAdUnitId).toEqual({ android: UNIT_ID, ios: undefined });
  });

  it('turns on test ads and keeps the consent debug device only in a test build', () => {
    process.env.ADMOB_CONSENT_DEBUG_DEVICE_ID = '33BE2250B43518CCDA7DE426D04EE231';
    expect(readAdMob().consentDebugDeviceId).toBeUndefined();
    process.env.ADMOB_USE_TEST_IDS = 'true';
    expect(readAdMob()).toEqual(
      expect.objectContaining({ consentDebugDeviceId: '33BE2250B43518CCDA7DE426D04EE231', isTestAds: true }),
    );
  });

  it.each([
    ['ADMOB_ANDROID_APP_ID', UNIT_ID, 'ADMOB_ANDROID_APP_ID must be an AdMob app id'],
    ['ADMOB_IOS_APP_ID', 'pub-1234567890123456~1234567890', 'ADMOB_IOS_APP_ID must be an AdMob app id'],
    ['ADMOB_IOS_RESULTS_UNIT_ID', APP_ID, 'ADMOB_IOS_RESULTS_UNIT_ID must be an AdMob ad unit id'],
    ['ADMOB_ANDROID_TRACKS_UNIT_ID', `${UNIT_ID} `, 'ADMOB_ANDROID_TRACKS_UNIT_ID must be an AdMob ad unit id'],
  ])('refuses a malformed %s without echoing it', (name, value, message) => {
    process.env[name] = value;
    const error = captureError();
    expect(error?.message).toBe(message);
    expect(error?.message).not.toContain(value.trim());
  });
});

describe('app.config AdMob in a production build', () => {
  it('carries all six real ids and no test ads', () => {
    setProductionBuild();
    expect(readAdMob()).toEqual({
      androidAppId: APP_ID,
      iosAppId: APP_ID,
      isTestAds: false,
      resultsAdUnitId: { android: UNIT_ID, ios: UNIT_ID },
      tracksAdUnitId: { android: UNIT_ID, ios: UNIT_ID },
    });
  });

  it.each([...APP_ID_NAMES, ...UNIT_ID_NAMES])('refuses to load without %s, naming it', (name) => {
    setProductionBuild({ [name]: undefined });
    expect(captureError()?.message).toBe(`${name} must be set in a production build`);
  });

  it.each([
    ['ADMOB_ANDROID_APP_ID', SAMPLE_ANDROID_APP_ID],
    ['ADMOB_IOS_APP_ID', SAMPLE_IOS_APP_ID],
    ['ADMOB_IOS_APP_ID', SAMPLE_ANDROID_APP_ID],
    ['ADMOB_ANDROID_RESULTS_UNIT_ID', TEST_ANDROID_UNIT_ID],
    ['ADMOB_ANDROID_TRACKS_UNIT_ID', TEST_ANDROID_UNIT_ID],
    ['ADMOB_IOS_RESULTS_UNIT_ID', TEST_IOS_UNIT_ID],
    ['ADMOB_IOS_TRACKS_UNIT_ID', TEST_IOS_UNIT_ID],
  ] as const)("refuses Google's sample or test id in %s without echoing it", (name, value) => {
    setProductionBuild({ [name]: value });
    const error = captureError();
    expect(error?.message).toBe(`${name} must not be a Google sample or test id in a production build`);
    expect(error?.message).not.toContain(value);
    expect(error?.stack ?? '').not.toContain(value);
  });

  it('refuses test ads', () => {
    setProductionBuild();
    process.env.ADMOB_USE_TEST_IDS = 'true';
    expect(captureError()?.message).toBe('ADMOB_USE_TEST_IDS must not be true in a production build');
  });

  it.each(['development', 'preview'])('keeps the sample app ids for the %s profile', (profile) => {
    process.env.EAS_BUILD_PROFILE = profile;
    expect(readAdMob()).toEqual(
      expect.objectContaining({ androidAppId: SAMPLE_ANDROID_APP_ID, iosAppId: SAMPLE_IOS_APP_ID }),
    );
  });
});
