// The signed-in header after local midnight: the /v1/me profile counts XP
// and the day streak for the day it was fetched, so when the device's local
// date turns over the profile is fetched again instead of showing
// yesterday's XP as today's. The coarse clock is driven by the test; the
// rest is the real AuthProvider, StatsProvider, and query client.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { createQueryClient } from '../../config/queryClient';
import { AUTH_STORAGE_KEY } from '../../constants/appConfig';
import { AuthProvider, useAuth } from '../AuthProvider';
import { StatsProvider } from '../StatsProvider';
import { useProgressSummary } from '../useProgressSummary';

const DAY_MS = 24 * 60 * 60 * 1000;

const mockClock = { now: Date.now() };
const mockServer: { calls: string[]; xpToday: number } = { calls: [], xpToday: 0 };

jest.mock('../useCoarseNow', () => ({ useCoarseNow: () => mockClock.now }));
jest.mock('../../clients/apiClient', () => ({
  apiFetch: (path: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET';
    mockServer.calls.push(`${method} ${path}`);
    if (method !== 'GET' || path !== 'me') return Promise.resolve({ body: null, status: 599 });
    const data = { dailyGoal: 20, dayStreak: 3, email: 'ignored', entitlements: [], timezone: 'UTC', xpToday: mockServer.xpToday };
    return Promise.resolve({ body: { data }, status: 200 });
  },
}));

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

function SummaryProbe() {
  const { dayStreak, xpToday } = useProgressSummary();
  return <Text>{`streak ${dayStreak} xp ${xpToday}`}</Text>;
}

function tree() {
  return (
    <AuthProvider>
      <OwnedStats>
        <SummaryProbe />
      </OwnedStats>
    </AuthProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockClock.now = Date.now();
  mockServer.calls = [];
  mockServer.xpToday = 0;
});

describe('useProgressSummary across local midnight', () => {
  it('fetches /me again when the local date changes, so yesterday’s XP is not shown as today’s', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    const client = createQueryClient();
    mockServer.xpToday = 40;
    const view = await render(<QueryClientProvider client={client}>{tree()}</QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('streak 3 xp 40')).toBeTruthy());
    const fetchesBefore = mockServer.calls.filter((call) => call === 'GET me').length;

    mockServer.xpToday = 0;
    mockClock.now += DAY_MS;
    await view.rerender(<QueryClientProvider client={client}>{tree()}</QueryClientProvider>);

    await waitFor(() => expect(screen.getByText('streak 3 xp 0')).toBeTruthy());
    expect(mockServer.calls.filter((call) => call === 'GET me').length).toBe(fetchesBefore + 1);
  });
});
