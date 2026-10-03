import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { REJECTED_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

jest.mock('../../services/stats/migrateStatsV1', () => ({
  migrateStatsV1: () => {
    throw new RangeError('migration failed');
  },
}));

function AnswerProbe() {
  const { isHydrated, recordAnswer, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Pressable
        testID="answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true })
        }
      />
    </>
  );
}

const storedV1 = JSON.stringify({
  streak: { best: 6, current: 2 },
  totals: { attempted: 12, correct: 9 },
  tracks: {},
  version: 1,
});

describe('StatsProvider when the v1 migration throws', () => {
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('keeps the v1 value under the backup key, leaves it in place, and keeps changes in memory', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, storedV1);
    await render(<StatsProvider><AnswerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('1'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await AsyncStorage.getItem(REJECTED_STORAGE_KEY)).toBe(storedV1);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(storedV1);
    const failures = warn.mock.calls.filter(([line]) => String(line).includes('stored stats migration failed'));
    expect(failures).toHaveLength(1);
    expect(JSON.parse(failures[0][0])).toMatchObject({ backupKey: REJECTED_STORAGE_KEY, key: STORAGE_KEY });
  });
});
