// A sync that lands while PATCH /v1/me is in flight: marking more events
// synced moves the profile query to a new key and fetches /me again, so the
// accepted goal must be written to the key current when the PATCH answers,
// not the one current when it was sent. Real AuthProvider, StatsProvider,
// and query client; apiFetch is a fake server whose PATCH the test answers.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient } from '../../config/queryClient';
import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { useProfile } from '../useProfile';

type ApiReply = { body: unknown; status: number };

const mockServer: { answerPatch: ((reply: ApiReply) => void) | null; getCount: number } = { answerPatch: null, getCount: 0 };

function mockProfileBody(dailyGoal: number) {
  return { data: { dailyGoal, dayStreak: 1, email: 'ignored', entitlements: [], timezone: 'UTC', xpToday: 0 } };
}

jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET';
    if (path !== 'me') return Promise.resolve({ body: null, status: 599 });
    if (method === 'PATCH') {
      return new Promise<ApiReply>((resolve) => {
        mockServer.answerPatch = resolve;
      });
    }
    mockServer.getCount += 1;
    // The server read for this GET happened before the PATCH committed.
    return Promise.resolve({ body: mockProfileBody(20), status: 200 });
  },
}));

const latest: { profile: ReturnType<typeof useProfile> | null; stats: ReturnType<typeof useQuizStats> | null } = { profile: null, stats: null };

function Probe() {
  latest.profile = useProfile();
  latest.stats = useQuizStats();
  return null;
}

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockServer.answerPatch = null;
  mockServer.getCount = 0;
  latest.profile = null;
  latest.stats = null;
});

describe('useProfile updateDailyGoal', () => {
  it('keeps the accepted goal when a sync lands while PATCH /me is in flight', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    await render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <OwnedStats>
            <Probe />
          </OwnedStats>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(latest.profile?.snapshot?.profile.dailyGoal).toBe(20));
    await waitFor(() => expect(latest.stats?.isHydrated).toBe(true));

    let saved: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      saved = latest.profile?.updateDailyGoal(50) ?? saved;
    });
    await waitFor(() => expect(mockServer.answerPatch).not.toBeNull());

    await act(async () => {
      latest.stats?.recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true });
    });
    await waitFor(() => expect(latest.stats?.eventLog).toHaveLength(1));
    const eventId = latest.stats?.eventLog[0]?.eventId ?? '';
    await act(async () => {
      await latest.stats?.markEventsSynced([eventId], userId);
    });
    await waitFor(() => expect(mockServer.getCount).toBe(2));
    await waitFor(() => expect(latest.profile?.snapshot?.seenEventIds.has(eventId)).toBe(true));

    await act(async () => {
      mockServer.answerPatch?.({ body: mockProfileBody(50), status: 200 });
      await saved;
    });

    expect(await saved).toBe(true);
    await waitFor(() => expect(latest.profile?.snapshot?.profile.dailyGoal).toBe(50));
  });
});
