// PR #33 review round 2, fix 3 (Task 3.11, B-36, B-61): a guest claim started
// as user A must not write either stats key when the provider's owner turns
// back to the guest before the stats fold writes; the claim rejects, so it
// stays pending and the guest's stats are still there to claim.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerEvent } from '@syntactical/progress';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { StatsProvider, useQuizStats } from '../StatsProvider';

type StatsValue = ReturnType<typeof useQuizStats>;
type SetItem = (key: string, value: string) => Promise<void>;

let latest: StatsValue;

function RaceProbe() {
  const value = useQuizStats();
  latest = value;
  return <Text testID="hydrated">{String(value.isHydrated)}</Text>;
}

// Every field differs from user A's, so a guest value written to A's key, or
// an A value written to the guest's key, shows.
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

function providerFor(ownerUserId: string | null) {
  return <StatsProvider ownerUserId={ownerUserId}><RaceProbe /></StatsProvider>;
}

// Waits for hydration, then lets any pending storage read for the new owner settle.
async function settle(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  await flushTurns();
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

// Holds the next event-log write until release(); the write then completes.
function holdNextEventLogWrite(): { isReached: () => boolean; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let isReached = false;
  setItemMock.mockImplementation(async (key: string, value: string) => {
    if (key === EVENT_LOG_STORAGE_KEY && !isReached) {
      isReached = true;
      await gate;
    }
    return originalSetItem(key, value);
  });
  return { isReached: () => isReached, release: () => release() };
}

// Tracks whether a promise has settled, without letting a rejection go unhandled.
function track(promise: Promise<unknown>) {
  const state = { isRejected: false, isSettled: false };
  promise.then(
    () => {
      state.isSettled = true;
    },
    () => {
      state.isRejected = true;
      state.isSettled = true;
    },
  );
  return state;
}

afterEach(() => {
  setItemMock.mockImplementation(originalSetItem);
});

describe('StatsProvider claimGuestEvents when the owner turns to the guest mid-claim', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(guestStats));
    await AsyncStorage.setItem(buildUserStatsKey(userA), JSON.stringify(userAStats));
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([buildGuestEntry()]));
  });

  // Starts claimGuestEvents(A) as owner A, holds it at the event-log write,
  // switches the provider to the guest, then lets the claim continue.
  async function claimWhileOwnerTurnsToGuest() {
    const view = await render(providerFor(userA));
    await settle();
    const hold = holdNextEventLogWrite();
    let claim: ReturnType<typeof track> | undefined;
    await act(async () => {
      claim = track(latest.claimGuestEvents(userA));
    });
    await waitFor(() => expect(hold.isReached()).toBe(true));
    await view.rerender(providerFor(null));
    await settle();
    await act(async () => hold.release());
    await waitFor(() => expect(claim?.isSettled).toBe(true));
    await flushTurns();
    return { claim, view };
  }

  it('rejects the claim and leaves A\'s stats key and the guest stats key unchanged', async () => {
    const { claim } = await claimWhileOwnerTurnsToGuest();
    expect(claim?.isRejected).toBe(true);
    expect(await readStored(buildUserStatsKey(userA))).toEqual(userAStats);
    expect(await readStored(STORAGE_KEY)).toEqual(guestStats);
    expect(latest.stats).toEqual(guestStats);
  });

  it('keeps the guest\'s stats claimable: a later claim by A carries them over once', async () => {
    const { view } = await claimWhileOwnerTurnsToGuest();
    await view.rerender(providerFor(userA));
    await settle();
    let retry: ReturnType<typeof track> | undefined;
    await act(async () => {
      retry = track(latest.claimGuestEvents(userA));
    });
    await waitFor(() => expect(retry?.isSettled).toBe(true));
    await flushTurns();
    expect(retry?.isRejected).toBe(false);
    expect(latest.stats.totals).toEqual({ attempted: 13, correct: 10 });
    expect((await readStored(buildUserStatsKey(userA)))?.totals).toEqual({ attempted: 13, correct: 10 });
    expect((await readStored(STORAGE_KEY))?.totals).toEqual({ attempted: 0, correct: 0 });
  });
});
