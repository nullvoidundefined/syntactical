import { render, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { StatsProvider, useQuizStats } from '../StatsProvider';

jest.unmock('@react-native-async-storage/async-storage');

function AttemptedProbe() {
  const { stats } = useQuizStats();
  return <Text testID="attempted">{stats.totals.attempted}</Text>;
}

describe('stats carried over from the Vite build', () => {
  it('reads stats the Vite build wrote to localStorage', async () => {
    window.localStorage.setItem(
      'syntactical.stats.v1',
      JSON.stringify({ version: 1, streak: { current: 0, best: 3 }, totals: { attempted: 42, correct: 30 }, tracks: {} }),
    );
    render(<StatsProvider><AttemptedProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('attempted').textContent).toBe('42'));
  });
});
