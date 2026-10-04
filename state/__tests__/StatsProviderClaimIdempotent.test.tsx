// PR #33 review round 2, fix 4 (Task 3.11, B-36, B-61): once the guest's
// stats are folded into user A's, a failed guest reset must not let a later
// claim fold the same guest stats again; the next mount finishes the pending
// reset alone.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerEvent } from '@syntactical/progress';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { StatsProvider, useQuizStats } from '../StatsProvider';

type StatsValue = ReturnType<typeof useQuizStats>;
type SetItem = (key: string, value: string) => Promise<void>;

let latest: StatsValue;

function ClaimProbe() {
  const value = useQuizStats();
  latest = value;
  return <Text testID="hydrated">{String(value.isHydrated)}</Text>;
}

const guestStats: Stats = {
  answerStreak: { best: 6, current: 4 },
  goalHistory: [{ from: '2026-09-01', goal: 50 }],
  isSignUpPromptDismissed: true,
  totals: { attempted: 9, correct: 7 },
  tracks: { 'python:easy': { attempted: 9, completions: 3, correct: 7 } },
  version: 2,
};

const userAStats: Stats = {
  answerStreak: { best: 3, current: 1 },
  goalHistory: [{ from: '2026-09-02', goal: 10 }],
  isSignUpPromptDismissed: false,
  totals: { attempted: 4, correct: 3 },
  tracks: { 'postgres:hard': { attempted: 4, completions: 1, correct: 3 } },
  version: 2,
};

// Guest plus A, folded once.
const claimedTotals = { attempted: 13, correct: 10 };
const claimedTracks = {
  'postgres:hard': { attempted: 4, completions: 1, correct: 3 },
  'python:easy': { attempted: 9, completions: 3, correct: 7 },
};

function buildGuestEntry(): LoggedAnswerEvent {
  const event: AnswerEvent = {
    answeredAt: new Date(Date.UTC(2026, 9, 1, 12)).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: 1,
    eventId: randomUUID(),
    isCorrect: true,
    questionId: 'question-1',
    roundKind: 'bank',
  };
  return { ...event, isHeld: false, isSynced: false, ownerUserId: null };
}

async function readStored(key: string): Promise<Stats | null> {
  return JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(<StatsProvider ownerUserId={ownerUserId}><ClaimProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  await flushTurns();
  return view;
}

async function flushTurns(rounds = 20): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const originalSetItem = setItemMock.getMockImplementation() as SetItem;

function failGuestStatsWrites(): void {
  setItemMock.mockImplementation((key: string, value: string) =>
    key === STORAGE_KEY ? Promise.reject(new Error('storage full')) : originalSetItem(key, value),
  );
}

function restoreWrites(): void {
  setItemMock.mockImplementation(originalSetItem);
}

// Runs one claim to completion; whether it resolves or rejects is not this
// file's concern, only what it leaves in memory and storage.
async function claimAsA(userId: string): Promise<void> {
  let isSettled = false;
  await act(async () => {
    latest.claimGuestEvents(userId).then(
      () => {
        isSettled = true;
      },
      () => {
        isSettled = true;
      },
    );
  });
  await waitFor(() => expect(isSettled).toBe(true));
  await flushTurns();
}

async function expectClaimedOnce(userId: string): Promise<void> {
  expect(latest.stats.totals).toEqual(claimedTotals);
  expect(latest.stats.tracks).toEqual(claimedTracks);
  const stored = await readStored(buildUserStatsKey(userId));
  expect(stored?.totals).toEqual(claimedTotals);
  expect(stored?.tracks).toEqual(claimedTracks);
}

afterEach(() => {
  restoreWrites();
});

describe('StatsProvider guest stats claim after a failed guest reset', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(guestStats));
    await AsyncStorage.setItem(buildUserStatsKey(userA), JSON.stringify(userAStats));
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([buildGuestEntry()]));
  });

  it('does not fold the same guest stats into A again on a later claim in the same mount', async () => {
    await renderHydrated(userA);
    failGuestStatsWrites();
    await claimAsA(userA);
    await expectClaimedOnce(userA);
    restoreWrites();
    await claimAsA(userA);
    await expectClaimedOnce(userA);
  });

  it('finishes only the pending guest reset on the next mount and a later claim folds nothing again', async () => {
    const view = await renderHydrated(userA);
    failGuestStatsWrites();
    await claimAsA(userA);
    await expectClaimedOnce(userA);
    await view.unmount();
    restoreWrites();

    await renderHydrated(userA);
    await waitFor(async () => expect(await readStored(STORAGE_KEY)).toEqual(createEmptyStats(readLocalToday())));
    await expectClaimedOnce(userA);
    await claimAsA(userA);
    await expectClaimedOnce(userA);
    expect(await readStored(STORAGE_KEY)).toEqual(createEmptyStats(readLocalToday()));
  });
});
