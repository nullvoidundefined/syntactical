// SignUpPrompt analytics (B-45): signup_prompt_shown fires once when a guest
// first sees the prompt (never for a signed-in user or after Not now), and
// signup_prompt_accepted fires once per press of Sign up.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AUTH_STORAGE_KEY, STORAGE_KEY } from '../../../constants/appConfig';
import { readLocalToday } from '../../../services/progress/readLocalToday';
import { createEmptyStats } from '../../../services/stats/createEmptyStats';
import { AuthProvider } from '../../../state/AuthProvider';
import { StatsProvider } from '../../../state/StatsProvider';
import { SignUpPrompt } from '../SignUpPrompt';

const mockTrackEvent = jest.fn();
jest.mock('../../../clients/analyticsClient', () => ({
  identifyAnalyticsUser: jest.fn(),
  resetAnalyticsUser: jest.fn(),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../clients/apiClient', () => ({
  apiFetch: () => Promise.reject(new Error('no network call expected')),
}));

async function renderPrompt() {
  await render(
    <AuthProvider>
      <StatsProvider>
        <SignUpPrompt />
      </StatsProvider>
    </AuthProvider>,
  );
}

function callsNamed(name: string): unknown[][] {
  return mockTrackEvent.mock.calls.filter(([called]) => called === name);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('SignUpPrompt analytics', () => {
  it('fires signup_prompt_shown exactly once when a guest sees the prompt', async () => {
    await renderPrompt();
    await screen.findByText('Save your progress');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(callsNamed('signup_prompt_shown')).toEqual([['signup_prompt_shown']]);
    expect(callsNamed('signup_prompt_accepted')).toHaveLength(0);
  });

  it('fires signup_prompt_accepted exactly once for one press of Sign up', async () => {
    await renderPrompt();
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign up' }));
    expect(callsNamed('signup_prompt_accepted')).toEqual([['signup_prompt_accepted']]);
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('fires no event for Not now, and shows nothing again afterwards', async () => {
    await renderPrompt();
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText('Save your progress')).toBeNull());
    expect(callsNamed('signup_prompt_shown')).toHaveLength(1);
    expect(callsNamed('signup_prompt_accepted')).toHaveLength(0);
  });

  it('fires nothing for a signed-in user', async () => {
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ knownUserIds: [], userId: randomUUID() }),
    );
    await renderPrompt();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Save your progress')).toBeNull();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('fires nothing for a guest who already dismissed the prompt', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...createEmptyStats(readLocalToday()),
        isSignUpPromptDismissed: true,
      }),
    );
    await renderPrompt();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
