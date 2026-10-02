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

const VALID_STATS = { streak: { best: 4, current: 1 }, totals: { attempted: 9, correct: 7 }, tracks: {}, version: 1 };

describe('StatsProvider stored counts', () => {
  beforeEach(() => AsyncStorage.clear());

  it.each([
    ['a negative count', { ...VALID_STATS, streak: { best: 4, current: -5 } }],
    ['a non-finite count', '{"streak":{"best":1e999,"current":1},"totals":{"attempted":9,"correct":7},"tracks":{},"version":1}'],
    ['a string track entry', { ...VALID_STATS, tracks: { 'python:easy': 'x' } }],
    ['a track entry missing completions', { ...VALID_STATS, tracks: { 'python:easy': { attempted: 1, correct: 1 } } }],
  ])('treats stored stats with %s as empty', async (_label, stored) => {
    await AsyncStorage.setItem(STORAGE_KEY, typeof stored === 'string' ? stored : JSON.stringify(stored));
    await render(<StatsProvider><AttemptedProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(screen.getByTestId('attempted')).toHaveTextContent('0');
  });

  it('loads well-formed stored stats', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(VALID_STATS));
    await render(<StatsProvider><AttemptedProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('9'));
  });
});
