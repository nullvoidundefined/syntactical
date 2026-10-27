// state/__tests__/SponsorProviderDirect.test.tsx
// SponsorProvider fetches the direct sponsor once for the whole app (decision 17): every card shows a live
// direct sponsor in place of the house card, an expired one leaves the house card (Review Focus 22), and a
// user who may not see cards never fetches sponsor.json.
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSponsorContent } from '../../components/sponsor/useSponsorContent';
import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { HOUSE_CARD } from '../../constants/sponsor';
import { CONTENT_BASE_URL, stubFetchRoutes } from '../../services/content/__tests__/fixtures/contentFixtures';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { SponsorProvider } from '../SponsorProvider';
import type { ProStatusState } from '../useProStatus';

const mockProStatus: { current: ProStatusState } = { current: { status: 'guest' } };

jest.mock('../useProStatus', () => ({ useProStatus: () => mockProStatus.current }));
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ isHydrated: true }),
  useSignedInUserId: () => null,
}));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: jest.fn() }));

const SPONSOR_URL = `${CONTENT_BASE_URL}sponsor.json`;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider>{children}</SponsorProvider>
    </QueryClientProvider>
  );
}

function serveSponsor(startsOn: string, endsOn: string) {
  return stubFetchRoutes({
    [SPONSOR_URL]: () =>
      Promise.resolve(
        JSON.stringify({ body: 'Branching Postgres.', endsOn, headline: 'Neon', href: 'https://neon.tech', startsOn }),
      ),
  });
}

// Two cards on one screen, as the results and track placements can be in one session.
function useTwoCards() {
  return [useSponsorContent('results'), useSponsorContent('tracks')];
}

beforeEach(() => {
  mockProStatus.current = { status: 'guest' };
});

describe('SponsorProvider and the direct sponsor', () => {
  it('gives every card a live direct sponsor, fetched once for the app', async () => {
    const fetchMock = serveSponsor(readLocalToday(), '2999-12-31');
    const { result } = await renderHook(useTwoCards, { wrapper: Providers });
    await waitFor(() => expect(result.current[0].content.source).toBe('direct'));
    expect(result.current[1].content.headline).toBe('Neon');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the house card when the direct sponsor has ended', async () => {
    serveSponsor('2020-01-01', '2020-01-31');
    const { result } = await renderHook(useTwoCards, { wrapper: Providers });
    await settle();
    expect(result.current[0].content).toEqual(HOUSE_CARD);
  });

  it('does not fetch the sponsor for a Pro user', async () => {
    mockProStatus.current = { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' };
    const fetchMock = serveSponsor(readLocalToday(), '2999-12-31');
    await renderHook(useTwoCards, { wrapper: Providers });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
