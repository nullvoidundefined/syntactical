// state/__tests__/SponsorProviderRefetch.test.tsx
// SponsorProvider fetches sponsor.json again every DIRECT_SPONSOR_STALE_MS while the app stays open, so a
// deleted sponsor file reaches a long-lived web tab or a resumed app without a restart. The interval is
// shortened here so the test runs on the real clock: React Query's interval refetch does not reach the
// card under Jest's fake timers.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSponsorContent } from '../../components/sponsor/useSponsorContent';
import { createQueryClient } from '../../config/queryClient';
import { HOUSE_CARD } from '../../constants/sponsor';
import { CONTENT_BASE_URL, stubFetchRoutes } from '../../services/content/__tests__/fixtures/contentFixtures';
import { SponsorProvider } from '../SponsorProvider';

const REFETCH_MS = 50;

jest.mock('../../constants/sponsor', () => ({
  ...jest.requireActual('../../constants/sponsor'),
  DIRECT_SPONSOR_STALE_MS: 50,
}));
jest.mock('../useProStatus', () => ({ useProStatus: () => ({ status: 'guest' }) }));
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ isHydrated: true }),
  useSignedInUserId: () => null,
}));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: jest.fn() }));

const SPONSOR_URL = `${CONTENT_BASE_URL}sponsor.json`;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider readToday={() => '2026-11-15'}>{children}</SponsorProvider>
    </QueryClientProvider>
  );
}

// The content host answers 404: the sponsor file was deleted.
function serveRemoved(): jest.Mock {
  const fetchMock = jest.fn((url: unknown) =>
    Promise.resolve({
      headers: { get: () => null },
      ok: false,
      redirected: false,
      status: 404,
      text: () => Promise.resolve(''),
      url: String(url),
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('SponsorProvider refetches the direct sponsor', () => {
  it('drops a sponsor whose file is removed while the app stays open', async () => {
    stubFetchRoutes({
      [SPONSOR_URL]: () =>
        Promise.resolve(
          JSON.stringify({
            body: 'Branching Postgres.',
            endsOn: '2999-12-31',
            headline: 'Neon',
            href: 'https://neon.tech',
            startsOn: '2000-01-01',
          }),
        ),
    });
    const { result } = await renderHook(() => useSponsorContent('results'), { wrapper: Providers });
    await waitFor(() => expect(result.current.content.source).toBe('direct'));
    const removed = serveRemoved();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, REFETCH_MS * 4));
    });
    await waitFor(() => expect(result.current.content).toEqual(HOUSE_CARD));
    expect(removed).toHaveBeenCalled();
  });
});
