import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../AppShell';

jest.mock('../../../state/useProgressSummary', () => ({ useProgressSummary: () => ({ dailyGoal: 20, dayStreak: 3, xpToday: 12 }) }));
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => false }));
jest.mock('../DownloadIndicator', () => ({ DownloadIndicator: () => null }));
jest.mock('../ReviewDueLink', () => ({ ReviewDueLink: () => null }));

function renderShell() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 800, width: 400, x: 0, y: 0 }, insets: { bottom: 0, left: 0, right: 0, top: 0 } }}>
      <AppShell>
        <Text>route content</Text>
      </AppShell>
    </SafeAreaProvider>,
  );
}

describe('AppShell on the web', () => {
  it('wraps the brand bar in a banner landmark and the route content in the main landmark', () => {
    renderShell();
    expect(screen.getByRole('banner').textContent).toContain('SYNTACTICAL');
    expect(screen.getByRole('main').textContent).toBe('route content');
  });

  it('reads the day streak and XP today to a screen reader as one sentence', () => {
    renderShell();
    expect(screen.getByText('Day streak 3, 12 of 20 XP today')).toBeTruthy();
  });

  it('shows the daily goal ring as a progressbar with its value and maximum', () => {
    renderShell();
    const ring = screen.getByRole('progressbar', { name: 'Daily goal' });
    expect(ring.getAttribute('aria-valuenow')).toBe('12');
    expect(ring.getAttribute('aria-valuemax')).toBe('20');
    expect(ring.getAttribute('aria-valuetext')).toBe('12 of 20 XP');
  });

  it('links to the settings route and no longer shows the answer streak', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('banner').textContent).not.toMatch(/best/i);
  });
});
