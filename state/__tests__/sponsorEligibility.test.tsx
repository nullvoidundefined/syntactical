// state/__tests__/sponsorEligibility.test.tsx
// Who may see sponsored cards: a hydrated guest and a signed-in free user. Nobody while Pro status loads,
// after it fails, or before auth hydrates, and never a Pro user, so a Pro user never sees a card flash
// (Review Focus 18). Outside SponsorProvider every card is hidden.
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { SponsorProvider, useSponsor } from '../SponsorProvider';
import type { ProStatusState } from '../useProStatus';

const mockProStatus: { current: ProStatusState } = { current: { status: 'guest' } };
const mockAuth = { isHydrated: true };

jest.mock('../useProStatus', () => ({ useProStatus: () => mockProStatus.current }));
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ isHydrated: mockAuth.isHydrated }),
  useSignedInUserId: () => null,
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <SponsorProvider>{children}</SponsorProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockProStatus.current = { status: 'guest' };
  mockAuth.isHydrated = true;
});

describe('sponsor eligibility', () => {
  it('lets a hydrated guest see cards', async () => {
    const { result } = await renderHook(() => useSponsor(), { wrapper: Providers });
    expect(result.current.eligibility).toBe('eligible');
  });

  it('lets a signed-in free user see cards', async () => {
    mockProStatus.current = { expiresAt: null, isPro: false, product: null, status: 'ready' };
    const { result } = await renderHook(() => useSponsor(), { wrapper: Providers });
    expect(result.current.eligibility).toBe('eligible');
  });

  it.each<[string, ProStatusState]>([
    ['Pro status is loading', { status: 'loading' }],
    ['Pro status failed to load', { retry: jest.fn(), status: 'error' }],
    [
      'the user is Pro (annual)',
      { expiresAt: '2027-10-27T00:00:00.000Z', isPro: true, product: 'annual', status: 'ready' },
    ],
    ['the user is Pro (lifetime)', { expiresAt: null, isPro: true, product: 'lifetime', status: 'ready' }],
  ])('hides cards while %s', async (_name, proStatus) => {
    mockProStatus.current = proStatus;
    const { result } = await renderHook(() => useSponsor(), { wrapper: Providers });
    expect(result.current.eligibility).toBe('hidden');
  });

  it('hides cards from a guest until auth has hydrated, so a stored Pro user never sees a flash', async () => {
    mockAuth.isHydrated = false;
    const { result } = await renderHook(() => useSponsor(), { wrapper: Providers });
    expect(result.current.eligibility).toBe('hidden');
  });

  it('hides cards outside SponsorProvider', async () => {
    const { result } = await renderHook(() => useSponsor());
    expect(result.current.eligibility).toBe('hidden');
  });
});
