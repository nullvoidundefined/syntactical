// SignUpPrompt on the results screen (Task 3.13, B-41): a guest finishing a
// round sees "Save your progress" with Sign up and Not now; Not now hides it
// for good (persisted, so a remount keeps it hidden); a signed-in user never
// sees it. Real AuthProvider and StatsProvider over the AsyncStorage mock.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { AUTH_STORAGE_KEY, STORAGE_KEY } from '../../../constants/appConfig';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { ResultsScreen } from '../../quiz/ResultsScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../clients/apiClient', () => ({
  apiFetch: () => Promise.reject(new Error('no network call expected')),
}));

const latest: { isHydrated: boolean } = { isHydrated: false };

function HydrationProbe() {
  const { isHydrated: isAuthHydrated } = useAuth();
  const { isHydrated: isStatsHydrated } = useQuizStats();
  latest.isHydrated = isAuthHydrated && isStatsHydrated;
  return null;
}

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>;
}

async function renderResults(onRetry = jest.fn()) {
  latest.isHydrated = false;
  const view = await render(
    <AuthProvider>
      <OwnedStats>
        <HydrationProbe />
        <ResultsScreen accuracy={50} correctCount={1} totalQuestions={2} languageLabel="Python" difficultyLabel="Easy" onMenu={jest.fn()} onRetry={onRetry} />
      </OwnedStats>
    </AuthProvider>,
  );
  await waitFor(() => expect(latest.isHydrated).toBe(true));
  return view;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('SignUpPrompt', () => {
  it('shows a guest "Save your progress" with Sign up and Not now', async () => {
    await renderResults();
    expect(await screen.findByText('Save your progress')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('hides for good after Not now, persisted across a remount', async () => {
    const view = await renderResults();
    fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText('Save your progress')).toBeNull());
    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null') as { isSignUpPromptDismissed?: boolean } | null;
      expect(stored?.isSignUpPromptDismissed).toBe(true);
    });
    await view.unmount();
    await renderResults();
    expect(screen.queryByText('Save your progress')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('never shows to a signed-in user', async () => {
    const userId = randomUUID();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
    await renderResults();
    expect(screen.queryByText('Save your progress')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });
});
