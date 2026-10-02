import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { STORAGE_KEY } from '../../constants/appConfig';

function StatsProbe() {
  const { stats, isHydrated, recordAnswer } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Pressable
        testID="answer"
        onPress={() => recordAnswer({ language: 'python', difficulty: 'easy', wasCorrect: true })}
      />
    </>
  );
}

const storedHistory = {
  version: 1,
  streak: { current: 2, best: 5 },
  totals: { attempted: 10, correct: 8 },
  tracks: {},
};

async function readSavedAttempted(): Promise<number> {
  const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
  return saved.totals.attempted;
}

describe('StatsProvider', () => {
  beforeEach(() => AsyncStorage.clear());

  it('adds an answer recorded right after hydration to the stored history', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedHistory));
    await render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readSavedAttempted()).toBe(11));
  });

  it('ignores answers and writes nothing before hydration completes', async () => {
    let releaseRead: (value: string | null) => void = () => {};
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () => new Promise((resolve) => { releaseRead = resolve; }),
    );
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    await render(<StatsProvider><StatsProbe /></StatsProvider>);
    await fireEvent.press(screen.getByTestId('answer'));
    expect(screen.getByTestId('hydrated')).toHaveTextContent('false');
    await act(async () => releaseRead(JSON.stringify(storedHistory)));
    expect(screen.getByTestId('attempted')).toHaveTextContent('10');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('persists two back-to-back answers in order', async () => {
    await render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await fireEvent.press(screen.getByTestId('answer'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readSavedAttempted()).toBe(2));
  });

  it('keeps in-memory stats when a write fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    await fireEvent.press(screen.getByTestId('answer'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('2'));
  });
});
