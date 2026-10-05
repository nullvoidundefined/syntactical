// The app bar's "SYNTACTICAL" mark is a link home on native. The shell wraps every route in
// app/_layout.tsx, so Settings, Admin, sign-in, and sign-up all carry it.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../AppShell';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('../../../state/useProgressSummary', () => ({
  useProgressSummary: () => ({ dailyGoal: 20, dayStreak: 0, xpToday: 0 }),
}));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => false }));
jest.mock('../DownloadIndicator', () => ({ DownloadIndicator: () => null }));
jest.mock('../ReviewDueLink', () => ({ ReviewDueLink: () => null }));

describe('AppShell home link', () => {
  it('names the brand mark "Syntactical home" and opens "/" when pressed', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <AppShell>
          <Text>route content</Text>
        </AppShell>
      </SafeAreaProvider>,
    );
    fireEvent.press(screen.getByRole('link', { name: 'Syntactical home' }));
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
