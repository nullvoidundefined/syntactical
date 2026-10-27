// The shared stand-in for react-native-google-mobile-ads, installed for every suite by jest.setup.ts.
// Consent and initialisation resolve or reject as mobileAdsControl says, and every SDK call is logged in
// order. For native ads it stands in only for NativeAd.createForAdRequest: each call logs the request and
// returns a promise that deliverAd settles with an ad or an error. It holds no lifecycle of its own (no hook,
// no destroy on unmount), so the app's useSponsorNativeAd is what the Review Focus 20 test exercises.
// NativeAdView and NativeAsset render plain views with test ids, so a suite can check what each asset wraps.
import { createElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type Step = 'resolve' | 'reject';

export type FakeNativeAd = {
  addAdEventListener: jest.Mock;
  body: string;
  callToAction: string;
  destroy: jest.Mock;
  headline: string;
  icon?: { url: string };
  listeners: Map<string, () => void>;
};

export const AdsConsentDebugGeography = { DISABLED: 0, EEA: 1, NOT_EEA: 2 } as const;
export const AdsConsentPrivacyOptionsRequirementStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  REQUIRED: 'REQUIRED',
  UNKNOWN: 'UNKNOWN',
} as const;
export const NativeAdChoicesPlacement = { BOTTOM_LEFT: 3, BOTTOM_RIGHT: 2, TOP_LEFT: 0, TOP_RIGHT: 1 } as const;
export const NativeAdEventType = { CLICKED: 'clicked', IMPRESSION: 'impression', PAID: 'paid' } as const;
export const NativeAssetType = {
  BODY: 'body',
  CALL_TO_ACTION: 'callToAction',
  HEADLINE: 'headline',
  ICON: 'icon',
} as const;
export const TestIds = { NATIVE: 'ca-app-pub-3940256099942544/3986624511' } as const;

export const mobileAdsControl = {
  calls: [] as string[],
  canRequestAds: true,
  form: 'resolve' as Step,
  infoUpdate: 'resolve' as Step,
  initialize: 'resolve' as Step,
  lastInfoUpdateOptions: undefined as unknown,
  pendingLoads: [] as ((outcome: FakeNativeAd | Error) => void)[],
  privacyOptionsStatus: 'NOT_REQUIRED' as keyof typeof AdsConsentPrivacyOptionsRequirementStatus,
  requests: [] as { adUnitId: string; options: Record<string, unknown> }[],
};

export function resetMobileAds(): void {
  Object.assign(mobileAdsControl, {
    calls: [],
    canRequestAds: true,
    form: 'resolve',
    infoUpdate: 'resolve',
    initialize: 'resolve',
    lastInfoUpdateOptions: undefined,
    pendingLoads: [],
    privacyOptionsStatus: 'NOT_REQUIRED',
    requests: [],
  });
}

// Like the SDK's NativeAd, a destroyed fake refuses a new listener.
export function buildFakeNativeAd(overrides: Partial<FakeNativeAd> = {}): FakeNativeAd {
  const listeners = new Map<string, () => void>();
  let isDestroyed = false;
  return {
    addAdEventListener: jest.fn((type: string, listener: () => void) => {
      if (isDestroyed) throw new Error('NativeAd.addAdEventListener(*) ad has been destroyed.');
      listeners.set(type, listener);
      return { remove: () => listeners.delete(type) };
    }),
    body: 'Ship Postgres branches with every pull request.',
    callToAction: 'Install',
    destroy: jest.fn(() => {
      isDestroyed = true;
    }),
    headline: 'Test Ad: Branching Postgres',
    icon: { url: 'https://example.test/icon.png' },
    listeners,
    ...overrides,
  };
}

// Answers the oldest pending ad request with an ad or an error (an Error stands for no fill).
export function deliverAd(outcome: FakeNativeAd | Error): void {
  const load = mobileAdsControl.pendingLoads.shift();
  if (!load) throw new Error('no ad request is pending');
  load(outcome);
}

function consentInfo() {
  return {
    canRequestAds: mobileAdsControl.canRequestAds,
    privacyOptionsRequirementStatus: mobileAdsControl.privacyOptionsStatus,
    status: 'OBTAINED',
  };
}

function settleStep<T>(step: Step, value: T): Promise<T> {
  return step === 'resolve' ? Promise.resolve(value) : Promise.reject(new Error('fake SDK failure'));
}

// NativeAd.createForAdRequest: logs the request and waits for deliverAd. Nothing here destroys an ad.
const NativeAd = {
  createForAdRequest: jest.fn((adUnitId: string, options: Record<string, unknown> = {}) => {
    mobileAdsControl.calls.push(`createForAdRequest ${adUnitId}`);
    mobileAdsControl.requests.push({ adUnitId, options });
    return new Promise<FakeNativeAd>((resolve, reject) => {
      mobileAdsControl.pendingLoads.push((outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)));
    });
  }),
};

function NativeAdView({ children, style }: { children: ReactNode; nativeAd: unknown; style?: StyleProp<ViewStyle> }) {
  return createElement(View, { style, testID: 'native-ad-view' }, children);
}

function NativeAsset({ assetType, children }: { assetType: string; children: ReactNode }) {
  return createElement(View, { testID: `native-asset-${assetType}` }, children);
}

const mobileAds = () => ({
  initialize: jest.fn(() => {
    mobileAdsControl.calls.push('initialize');
    return settleStep(mobileAdsControl.initialize, []);
  }),
});

export const mobileAdsModule = {
  __esModule: true,
  default: mobileAds,
  AdsConsent: {
    getConsentInfo: jest.fn(() => {
      mobileAdsControl.calls.push('getConsentInfo');
      return Promise.resolve(consentInfo());
    }),
    loadAndShowConsentFormIfRequired: jest.fn(() => {
      mobileAdsControl.calls.push('loadAndShowConsentFormIfRequired');
      return settleStep(mobileAdsControl.form, consentInfo());
    }),
    requestInfoUpdate: jest.fn((options?: unknown) => {
      mobileAdsControl.calls.push('requestInfoUpdate');
      mobileAdsControl.lastInfoUpdateOptions = options;
      return settleStep(mobileAdsControl.infoUpdate, consentInfo());
    }),
    showPrivacyOptionsForm: jest.fn(() => {
      mobileAdsControl.calls.push('showPrivacyOptionsForm');
      return Promise.resolve(consentInfo());
    }),
  },
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
  NativeAd,
  NativeAdChoicesPlacement,
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView: () => null,
  TestIds,
};
