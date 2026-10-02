import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

function StatsProbe() {
  const { isHydrated, recordAnswer, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Text testID="best">{stats.streak.best}</Text>
      <Pressable
        testID="answer"
        onPress={() => recordAnswer({ difficulty: 'easy', language: 'python', wasCorrect: true })}
      />
    </>
  );
}

describe('StatsProvider with malformed stored stats', () => {
  beforeEach(() => AsyncStorage.clear());

  it.each([
    ['an empty object', '{}'],
    ['null', 'null'],
    ['a partial object', '{"version":1,"totals":{"attempted":3}}'],
    ['an array', '[]'],
    ['a string streak', '{"version":1,"streak":"x","totals":{"attempted":1,"correct":1},"tracks":{}}'],
  ])('falls back to empty stats for %s and keeps counting', async (_label, storedValue) => {
    await AsyncStorage.setItem(STORAGE_KEY, storedValue);
    await render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(screen.getByTestId('attempted')).toHaveTextContent('0');
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('1'));
    expect(screen.getByTestId('best')).toHaveTextContent('1');
  });
});
