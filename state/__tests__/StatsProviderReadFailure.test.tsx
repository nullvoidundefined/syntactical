import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

function AnswerProbe() {
  const { eventLog, isHydrated, recordAnswer, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Text testID="events">{eventLog.length}</Text>
      <Pressable
        testID="answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true })
        }
      />
    </>
  );
}

const storedV1 = JSON.stringify({ streak: { best: 2, current: 1 }, totals: { attempted: 5, correct: 4 }, tracks: {}, version: 1 });
const storedLog = JSON.stringify([
  {
    answeredAt: '2026-10-01T10:00:00.000Z',
    bankKey: 'python/easy',
    choiceIndex: 1,
    eventId: 'unsynced-1',
    isCorrect: false,
    isHeld: false,
    isSynced: false,
    ownerUserId: null,
    questionId: 'py-easy-01',
    roundKind: 'bank',
  },
]);

// The AsyncStorage mock's getItem is itself a jest.fn, so spying on it
// replaces it; other keys answer from the seeded values instead.
function failReadsOf(failingKey: string) {
  const seeded: Record<string, string> = { [EVENT_LOG_STORAGE_KEY]: storedLog, [STORAGE_KEY]: storedV1 };
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) =>
    key === failingKey ? Promise.reject(new Error('storage unavailable')) : Promise.resolve(seeded[key] ?? null),
  );
}

describe('StatsProvider when a storage read fails', () => {
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, storedV1);
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, storedLog);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['stats', STORAGE_KEY, storedV1],
    ['answer event log', EVENT_LOG_STORAGE_KEY, storedLog],
  ])('keeps the stored %s and changes in memory when its read throws', async (_label, failingKey, storedValue) => {
    failReadsOf(failingKey);
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    await render(<StatsProvider><AnswerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => expect(screen.getByTestId('events')).not.toHaveTextContent('0'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setItem.mock.calls.filter(([key]) => key === failingKey)).toHaveLength(0);
    expect(JSON.parse(storedValue)).toBeTruthy();
    expect(warn.mock.calls.some(([line]) => String(line).includes('storage read failed'))).toBe(true);
  });

  it('still persists the other key normally', async () => {
    failReadsOf(EVENT_LOG_STORAGE_KEY);
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    await render(<StatsProvider><AnswerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('5'));
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => {
      const statsWrites = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY).map(([, value]) => JSON.parse(value));
      expect(statsWrites.at(-1)).toMatchObject({ totals: { attempted: 6 }, version: 2 });
    });
  });
});
