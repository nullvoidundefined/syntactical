// Decides once for the whole app whether sponsored cards may render: only after auth has hydrated and Pro
// status is known, and only for a user who is not Pro (a guest never is). While Pro status loads or after
// it fails, every card stays hidden, so a Pro user never sees a card flash (Review Focus 18). Outside the
// provider every card is hidden too, which keeps screens rendered without providers (and their tests)
// free of cards. SponsoredCard is the only reader of eligibility. Mounted inside AuthProvider in
// app/_layout.tsx.
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import { type ProStatusState, useProStatus } from './useProStatus';

export type SponsorEligibility = 'eligible' | 'hidden';

type SponsorContextValue = { eligibility: SponsorEligibility };

const HIDDEN: SponsorContextValue = { eligibility: 'hidden' };
const SponsorContext = createContext<SponsorContextValue>(HIDDEN);

export function readSponsorEligibility(proStatus: ProStatusState, isAuthHydrated: boolean): SponsorEligibility {
  if (!isAuthHydrated) return 'hidden';
  if (proStatus.status === 'guest') return 'eligible';
  if (proStatus.status === 'ready' && !proStatus.isPro) return 'eligible';
  return 'hidden';
}

export function SponsorProvider({ children }: { children: ReactNode }) {
  const proStatus = useProStatus();
  const { isHydrated } = useAuth();
  const eligibility = readSponsorEligibility(proStatus, isHydrated);
  const value = useMemo<SponsorContextValue>(() => ({ eligibility }), [eligibility]);
  return <SponsorContext.Provider value={value}>{children}</SponsorContext.Provider>;
}

export function useSponsor(): SponsorContextValue {
  return useContext(SponsorContext);
}
