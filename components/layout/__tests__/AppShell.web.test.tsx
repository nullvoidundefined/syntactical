import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../AppShell';

jest.mock('../../../state/StatsProvider', () => ({ useQuizStats: () => ({ eventLog: [], stats: { answerStreak: { best: 3, current: 1 } } }) }));
jest.mock('../DownloadIndicator', () => ({ DownloadIndicator: () => null }));

describe('AppShell on the web', () => {
  it('wraps the brand bar in a banner landmark and the route content in the main landmark', () => {
    render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 800, width: 400, x: 0, y: 0 }, insets: { bottom: 0, left: 0, right: 0, top: 0 } }}>
        <AppShell>
          <Text>route content</Text>
        </AppShell>
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('banner').textContent).toContain('SYNTACTICAL');
    expect(screen.getByRole('main').textContent).toBe('route content');
  });
});
