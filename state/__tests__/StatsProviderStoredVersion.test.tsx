import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

function AttemptedProbe() {
  const { isHydrated, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
    </>
  );
}

function buildStoredStats(version: number): string {
  return JSON.stringify({ streak: { best: 4, current: 1 }, totals: { attempted: 9, correct: 7 }, tracks: {}, version });
}

describe('StatsProvider stored schema version', () => {
  beforeEach(() => AsyncStorage.clear());

  it.each([0, 2, -1])('treats stored stats with schema version %p as empty', async (version) => {
    await AsyncStorage.setItem(STORAGE_KEY, buildStoredStats(version));
    await render(<StatsProvider><AttemptedProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(screen.getByTestId('attempted')).toHaveTextContent('0');
  });
});
