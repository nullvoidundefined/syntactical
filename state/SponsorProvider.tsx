// Decides once for the whole app whether sponsored cards may render, loads the direct sponsor, and prepares
// native ads. Cards render only after auth has hydrated and Pro status is known, and only for a user who is
// not Pro (a guest never is); while Pro status loads or after it fails every card stays hidden, so a Pro user
// never sees a flash (Review Focus 18). Outside the provider every card is hidden too, which keeps screens
// rendered without providers (and their tests) free of cards. SponsoredCard is the only reader of
// eligibility. While a user may see cards it loads the direct sponsor (sponsor.json) once for the whole app,
// with its dates, and fetches it again every DIRECT_SPONSOR_STALE_MS so a removed or replaced file reaches an
// app that stays open. The dates apply when a card reads the sponsor (readToday, the device's local date
// unless a test passes a clock), so a sponsor that ends or starts while the app is open changes the next
// card. On iOS and Android, once a user may see cards in a build with AdMob ids, it runs the consent flow
// once and initialises the SDK whatever the answer (Review Focus 21); ads load only when the SDK allows
// requests, and otherwise cards fall back to house content. A Pro user and the web build never touch the
// SDK. Mounted inside AuthProvider in app/_layout.tsx.
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Platform } from 'react-native';

import { gatherConsentAndInitialize, showAdsPrivacyOptions, type AdsConsentResult } from '../clients/adsConsentClient';
import { readExtraString } from '../config/readExtraString';
import { DIRECT_SPONSOR_STALE_MS } from '../constants/sponsor';
import { readLocalToday } from '../services/progress/readLocalToday';
import { type DirectSponsor, loadDirectSponsor } from '../services/sponsor/loadDirectSponsor';
import { isAdMobConfigured, readConsentDebugDeviceId } from '../services/sponsor/readAdMobConfig';

import { useAuth } from './AuthProvider';
import { type ProStatusState, useProStatus } from './useProStatus';

export type SponsorEligibility = 'eligible' | 'hidden';
export type AdsStatus = 'pending' | 'ready' | 'unavailable';

// isDirectSponsorSettled is false until the first sponsor.json request answers (or falls back), so a card
// can wait for it instead of showing the house card first.
type SponsorContextValue = {
  adsStatus: AdsStatus;
  directSponsor: DirectSponsor | null;
  eligibility: SponsorEligibility;
  isDirectSponsorSettled: boolean;
  isReady: boolean;
  privacyOptionsRequired: boolean;
  readToday: () => string;
  showPrivacyOptions: () => Promise<void>;
};

function readDeviceToday(): string {
  return readLocalToday();
}

const HIDDEN: SponsorContextValue = {
  adsStatus: 'unavailable',
  directSponsor: null,
  eligibility: 'hidden',
  isDirectSponsorSettled: true,
  isReady: false,
  privacyOptionsRequired: false,
  readToday: readDeviceToday,
  showPrivacyOptions: () => Promise.resolve(),
};
const SponsorContext = createContext<SponsorContextValue>(HIDDEN);

export function readSponsorEligibility(proStatus: ProStatusState, isAuthHydrated: boolean): SponsorEligibility {
  if (!isAuthHydrated) return 'hidden';
  if (proStatus.status === 'guest') return 'eligible';
  if (proStatus.status === 'ready' && !proStatus.isPro) return 'eligible';
  return 'hidden';
}

function canUseNativeAds(): boolean {
  return Platform.OS !== 'web' && isAdMobConfigured();
}

type SponsorProviderProps = { children: ReactNode; readToday?: () => string };

export function SponsorProvider({ children, readToday = readDeviceToday }: SponsorProviderProps) {
  const proStatus = useProStatus();
  const { isHydrated } = useAuth();
  const eligibility = readSponsorEligibility(proStatus, isHydrated);
  const [adsStatus, setAdsStatus] = useState<AdsStatus>(() => (canUseNativeAds() ? 'pending' : 'unavailable'));
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const hasStarted = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const applyResult = useCallback((result: AdsConsentResult) => {
    if (!isMounted.current) return;
    setAdsStatus(result.canRequestAds ? 'ready' : 'unavailable');
    setPrivacyOptionsRequired(result.privacyOptionsRequired);
  }, []);

  useEffect(() => {
    if (eligibility !== 'eligible' || hasStarted.current || !canUseNativeAds()) return;
    hasStarted.current = true;
    void gatherConsentAndInitialize({ debugDeviceId: readConsentDebugDeviceId() }).then(applyResult);
  }, [applyResult, eligibility]);

  const showPrivacyOptions = useCallback(async () => {
    const result = await showAdsPrivacyOptions();
    if (result !== null) applyResult(result);
  }, [applyResult]);

  const contentBaseUrl = readExtraString('contentBaseUrl');
  const { data: directSponsor = null, isPending } = useQuery({
    enabled: eligibility === 'eligible',
    queryFn: () => loadDirectSponsor(contentBaseUrl),
    queryKey: ['sponsor', contentBaseUrl],
    refetchInterval: DIRECT_SPONSOR_STALE_MS,
    staleTime: DIRECT_SPONSOR_STALE_MS,
  });

  const value = useMemo<SponsorContextValue>(
    () => ({
      adsStatus,
      directSponsor,
      eligibility,
      isDirectSponsorSettled: !isPending,
      isReady: adsStatus === 'ready',
      privacyOptionsRequired,
      readToday,
      showPrivacyOptions,
    }),
    [adsStatus, directSponsor, eligibility, isPending, privacyOptionsRequired, readToday, showPrivacyOptions],
  );
  return <SponsorContext.Provider value={value}>{children}</SponsorContext.Provider>;
}

export function useSponsor(): SponsorContextValue {
  return useContext(SponsorContext);
}
