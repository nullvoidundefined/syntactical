// state/__tests__/SponsorProvider.test.tsx
// On native, SponsorProvider asks for ad consent where required and then initialises the Mobile Ads SDK,
// whether consent was given, declined, or the flow failed (Review Focus 21: the app never blocks on
// consent). Ads may load only when the SDK allows requests. Nothing runs for a Pro user, while Pro status
// loads, or in a build without AdMob ids, and the flow runs once.
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import { mobileAdsControl, resetMobileAds } from '../../components/sponsor/__tests__/mobileAdsMock';
import { setExpoExtra } from '../../config/expoConstantsMock';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { SponsorProvider, useSponsor } from '../SponsorProvider';
import type { ProStatusState } from '../useProStatus';

const mockProStatus: { current: ProStatusState } = { current: { status: 'guest' } };

jest.mock('../useProStatus', () => ({ useProStatus: () => mockProStatus.current }));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ isHydrated: true }), useSignedInUserId: () => null }));

const CONTENT_BASE_URL = 'https://example.test/content/';
const TEST_ADMOB = { androidAppId: 'a', iosAppId: 'i', isTestAds: true, resultsAdUnitId: {}, tracksAdUnitId: {} };
const CONSENT_FLOW = ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired', 'getConsentInfo', 'initialize'];

function Probe() {
  const { adsStatus, eligibility, isReady, privacyOptionsRequired, showPrivacyOptions } = useSponsor();
  return (
    <>
      <Text testID="state">{`${eligibility} ${adsStatus} ${String(isReady)} ${String(privacyOptionsRequired)}`}</Text>
      <Pressable role="button" aria-label="privacy" onPress={() => void showPrivacyOptions()} />
    </>
  );
}

// SponsorProvider queries the direct sponsor (Task 6.10), so it needs the query client the root layout gives it.
const queryClient = createQueryClient();

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function buildTree() {
  return (
    <SponsorProvider>
      <Probe />
    </SponsorProvider>
  );
}

async function renderProvider() {
  const view = await render(buildTree(), { wrapper: Providers });
  await settle();
  return view;
}

function readState(): string {
  return screen.getByTestId('state').props.children;
}

beforeEach(() => {
  resetMobileAds();
  queryClient.clear();
  mockProStatus.current = { status: 'guest' };
  setExpoExtra({ admob: TEST_ADMOB, contentBaseUrl: CONTENT_BASE_URL });
});

afterAll(() => setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL }));

describe('SponsorProvider consent on native', () => {
  it('asks for consent, then initialises, then allows ads', async () => {
    await renderProvider();
    expect(mobileAdsControl.calls).toEqual(CONSENT_FLOW);
    expect(mobileAdsControl.lastInfoUpdateOptions).toBeUndefined();
    expect(readState()).toBe('eligible ready true false');
  });

  it('initialises and allows non-personalised ads when the form was declined', async () => {
    mobileAdsControl.form = 'resolve';
    mobileAdsControl.canRequestAds = true;
    await renderProvider();
    expect(mobileAdsControl.calls).toContain('initialize');
    expect(readState()).toBe('eligible ready true false');
  });

  it('still initialises when the consent form fails, and never blocks', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mobileAdsControl.form = 'reject';
    await renderProvider();
    expect(mobileAdsControl.calls).toEqual(CONSENT_FLOW);
    expect(readState()).toBe('eligible ready true false');
    warn.mockRestore();
  });

  it('still initialises when the consent info update fails, but loads no ads the SDK does not allow', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mobileAdsControl.infoUpdate = 'reject';
    mobileAdsControl.canRequestAds = false;
    await renderProvider();
    expect(mobileAdsControl.calls).toContain('initialize');
    expect(readState()).toBe('eligible unavailable false false');
    warn.mockRestore();
  });

  it('reports a failed SDK start as unavailable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mobileAdsControl.initialize = 'reject';
    await renderProvider();
    expect(readState()).toBe('eligible unavailable false false');
    warn.mockRestore();
  });

  it('exposes the privacy options and reopens them on request', async () => {
    mobileAdsControl.privacyOptionsStatus = 'REQUIRED';
    await renderProvider();
    expect(readState()).toBe('eligible ready true true');
    await fireEvent.press(screen.getByRole('button', { name: 'privacy' }));
    await settle();
    expect(mobileAdsControl.calls).toContain('showPrivacyOptionsForm');
  });

  it('forces the EEA form on the debug device in a test build', async () => {
    setExpoExtra({ admob: { ...TEST_ADMOB, consentDebugDeviceId: 'DEVICE-1234' }, contentBaseUrl: CONTENT_BASE_URL });
    await renderProvider();
    expect(mobileAdsControl.lastInfoUpdateOptions).toEqual({
      debugGeography: 1,
      testDeviceIdentifiers: ['DEVICE-1234'],
    });
  });

  it('runs nothing for a Pro user', async () => {
    mockProStatus.current = { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' };
    await renderProvider();
    expect(mobileAdsControl.calls).toEqual([]);
    expect(readState()).toBe('hidden pending false false');
  });

  it('waits for Pro status, then runs the flow once', async () => {
    mockProStatus.current = { status: 'loading' };
    const view = await renderProvider();
    expect(mobileAdsControl.calls).toEqual([]);
    mockProStatus.current = { expiresAt: null, isPro: false, product: null, status: 'ready' };
    view.rerender(buildTree());
    await waitFor(() => expect(mobileAdsControl.calls).toEqual(CONSENT_FLOW));
    view.rerender(buildTree());
    await settle();
    expect(mobileAdsControl.calls).toEqual(CONSENT_FLOW);
  });

  it('runs nothing in a build without AdMob ids', async () => {
    setExpoExtra({ contentBaseUrl: CONTENT_BASE_URL });
    await renderProvider();
    expect(mobileAdsControl.calls).toEqual([]);
    expect(readState()).toBe('eligible unavailable false false');
  });
});
