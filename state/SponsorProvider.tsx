// Decides once for the whole app whether sponsored cards may render: only after auth has hydrated and Pro
// status is known, and only for a user who is not Pro (a guest never is). While Pro status loads or after
// it fails, every card stays hidden, so a Pro user never sees a card flash (Review Focus 18). Outside the
// provider every card is hidden too, which keeps screens rendered without providers (and their tests)
// free of cards. SponsoredCard is the only reader of eligibility. While a user may see cards it also
// loads the direct sponsor (sponsor.json) once for the whole app, with its dates, and fetches it again
// every DIRECT_SPONSOR_STALE_MS so a removed or replaced file reaches an app that stays open. The dates
// apply when a card reads the sponsor (readToday, the device's local date unless a test passes a clock),
// so a sponsor that ends or starts while the app is open changes the next card. Mounted inside
// AuthProvider in app/_layout.tsx.
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { readExtraString } from '../config/readExtraString';
import { DIRECT_SPONSOR_STALE_MS } from '../constants/sponsor';
import { readLocalToday } from '../services/progress/readLocalToday';
import { type DirectSponsor, loadDirectSponsor } from '../services/sponsor/loadDirectSponsor';

import { useAuth } from './AuthProvider';
import { type ProStatusState, useProStatus } from './useProStatus';

export type SponsorEligibility = 'eligible' | 'hidden';

type SponsorContextValue = {
  directSponsor: DirectSponsor | null;
  eligibility: SponsorEligibility;
  readToday: () => string;
};

function readDeviceToday(): string {
  return readLocalToday();
}

const HIDDEN: SponsorContextValue = { directSponsor: null, eligibility: 'hidden', readToday: readDeviceToday };
const SponsorContext = createContext<SponsorContextValue>(HIDDEN);

export function readSponsorEligibility(proStatus: ProStatusState, isAuthHydrated: boolean): SponsorEligibility {
  if (!isAuthHydrated) return 'hidden';
  if (proStatus.status === 'guest') return 'eligible';
  if (proStatus.status === 'ready' && !proStatus.isPro) return 'eligible';
  return 'hidden';
}

type SponsorProviderProps = { children: ReactNode; readToday?: () => string };

export function SponsorProvider({ children, readToday = readDeviceToday }: SponsorProviderProps) {
  const proStatus = useProStatus();
  const { isHydrated } = useAuth();
  const eligibility = readSponsorEligibility(proStatus, isHydrated);
  const contentBaseUrl = readExtraString('contentBaseUrl');
  const { data: directSponsor = null } = useQuery({
    enabled: eligibility === 'eligible',
    queryFn: () => loadDirectSponsor(contentBaseUrl),
    queryKey: ['sponsor', contentBaseUrl],
    refetchInterval: DIRECT_SPONSOR_STALE_MS,
    staleTime: DIRECT_SPONSOR_STALE_MS,
  });
  const value = useMemo<SponsorContextValue>(
    () => ({ directSponsor, eligibility, readToday }),
    [directSponsor, eligibility, readToday],
  );
  return <SponsorContext.Provider value={value}>{children}</SponsorContext.Provider>;
}

export function useSponsor(): SponsorContextValue {
  return useContext(SponsorContext);
}
