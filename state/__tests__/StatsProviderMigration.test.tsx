import AsyncStorage from '@react-native-async-storage/async-storage';
import { toLocalDate } from '@syntactical/progress';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { StatsProvider, useQuizStats } from '../StatsProvider';

function MigrationProbe() {
  const { eventLog, isHydrated, recordAnswer, stats } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Text testID="best">{stats.answerStreak.best}</Text>
      <Text testID="events">{eventLog.length}</Text>
      <Pressable
        testID="answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 1, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true })
        }
      />
    </>
  );
}

const storedV1 = {
  streak: { best: 6, current: 2 },
  totals: { attempted: 12, correct: 9 },
  tracks: { 'python:easy': { attempted: 12, completions: 2, correct: 9 } },
  version: 1,
};

async function readStored(key: string): Promise<unknown> {
  return JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');
}

function readToday(): string {
  return toLocalDate(new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

async function renderHydrated() {
  const view = await render(<StatsProvider><MigrationProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

describe('StatsProvider v1 to v2 migration', () => {
  beforeEach(() => AsyncStorage.clear());

  it('migrates a stored v1 value on hydrate and writes it as v2 with the first change', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedV1));
    await renderHydrated();
    expect(screen.getByTestId('attempted')).toHaveTextContent('12');
    expect(screen.getByTestId('best')).toHaveTextContent('6');
    expect(screen.getByTestId('events')).toHaveTextContent('0');
    expect(await readStored(STORAGE_KEY)).toEqual(storedV1);
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () =>
      expect(await readStored(STORAGE_KEY)).toEqual({
        answerStreak: { best: 6, current: 3 },
        goalHistory: [{ from: readToday(), goal: 20 }],
        isSignUpPromptDismissed: false,
        totals: { attempted: 13, correct: 10 },
        tracks: { 'python:easy': { attempted: 13, completions: 2, correct: 10 } },
        version: 2,
      }),
    );
  });

  it('is safe to rerun: a second launch loads the migrated value unchanged and keeps the event log', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedV1));
    const first = await renderHydrated();
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect((await readStored(EVENT_LOG_STORAGE_KEY)) as unknown[]).toHaveLength(1));
    await waitFor(async () => expect(await readStored(STORAGE_KEY)).toMatchObject({ totals: { attempted: 13 } }));
    const afterFirstLaunch = await readStored(STORAGE_KEY);
    await first.unmount();
    await renderHydrated();
    expect(screen.getByTestId('attempted')).toHaveTextContent('13');
    expect(screen.getByTestId('events')).toHaveTextContent('1');
    expect(await readStored(STORAGE_KEY)).toEqual(afterFirstLaunch);
  });
});
