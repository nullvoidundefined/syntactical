import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { REJECTED_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

function AnswerProbe() {
  const { isHydrated, recordAnswer, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Pressable testID="answer" onPress={() => recordAnswer({ difficulty: 'easy', language: 'python', wasCorrect: true })} />
    </>
  );
}

const futureStats = JSON.stringify({ streak: { best: 4, current: 1 }, totals: { attempted: 9, correct: 7 }, tracks: {}, version: 2 });

async function renderAndAnswerOnce() {
  await render(<StatsProvider><AnswerProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  await fireEvent.press(screen.getByTestId('answer'));
  await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('1'));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}').totals?.attempted).toBe(1));
}

describe('StatsProvider rejected stored stats', () => {
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('keeps a rejected stored value under the backup key after the first answer overwrites it, and warns once', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, futureStats);
    await renderAndAnswerOnce();
    expect(JSON.parse((await AsyncStorage.getItem(REJECTED_STORAGE_KEY)) ?? 'null')).toEqual(JSON.parse(futureStats));
    const rejectionWarnings = warn.mock.calls.filter(([line]) => String(line).includes('stored stats rejected'));
    expect(rejectionWarnings).toHaveLength(1);
    expect(JSON.parse(rejectionWarnings[0][0])).toMatchObject({ key: STORAGE_KEY, backupKey: REJECTED_STORAGE_KEY });
  });

  it('writes no backup and no warning when nothing is stored', async () => {
    await renderAndAnswerOnce();
    expect(await AsyncStorage.getItem(REJECTED_STORAGE_KEY)).toBeNull();
    expect(warn.mock.calls.filter(([line]) => String(line).includes('stored stats rejected'))).toHaveLength(0);
  });

  it('writes no backup when the stored value is valid', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, futureStats.replace('"version":2', '"version":1'));
    await render(<StatsProvider><AnswerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('9'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}').totals?.attempted).toBe(10));
    expect(await AsyncStorage.getItem(REJECTED_STORAGE_KEY)).toBeNull();
  });
});
