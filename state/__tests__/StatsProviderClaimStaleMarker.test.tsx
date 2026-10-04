// PR #33 security round 3, fix 1 (Task 3.11, B-36, B-61): a guest claim
// marker left behind after a completed claim must not wipe guest stats earned
// after that claim. User A claims the guest's stats; the guest reset is
// written but every write that clears the marker fails, so the marker stays
// stored. The device is then used as a guest and earns new stats. On the next
// mount (as the guest or as A) the guest's new stats are kept, A's stats stay
// the first fold only, and the stale marker is cleared. An explicit later
// claim by A then folds the guest's current stats exactly once more.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerEvent } from '@syntactical/progress';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY, GUEST_CLAIM_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { StatsProvider, useQuizStats } from '../StatsProvider';

type StatsValue = ReturnType<typeof useQuizStats>;
type SetItem = (key: string, value: string) => Promise<void>;
type RemoveItem = (key: string) => Promise<void>;
type MultiRemove = (keys: string[]) => Promise<void>;

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

// Guest plus A, folded once: the first claim and nothing after it.
const claimedTotals = { attempted: 13, correct: 10 };
const claimedTracks = {
  'postgres:hard': { attempted: 4, completions: 1, correct: 3 },
  'python:easy': { attempted: 9, completions: 3, correct: 7 },
};

// What the guest earns after the claim: one correct answer.
const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;
const earnedTotals = { attempted: 1, correct: 1 };
// The first fold plus the guest's post-claim answer, folded by an explicit later claim.
const claimedAgainTotals = { attempted: 14, correct: 11 };

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

// The raw stored marker: null once it is cleared (removed or written as null).
async function readStoredMarker(): Promise<unknown> {
  return JSON.parse((await AsyncStorage.getItem(GUEST_CLAIM_STORAGE_KEY)) ?? 'null');
}

async function flushTurns(rounds = 20): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(<StatsProvider ownerUserId={ownerUserId}><ClaimProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  await flushTurns();
  return view;
}

const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const removeItemMock = AsyncStorage.removeItem as unknown as jest.Mock;
const multiRemoveMock = AsyncStorage.multiRemove as unknown as jest.Mock;
const originalSetItem = setItemMock.getMockImplementation() as SetItem;
const originalRemoveItem = removeItemMock.getMockImplementation() as RemoveItem;
const originalMultiRemove = multiRemoveMock.getMockImplementation() as MultiRemove;

// Fails only the writes that clear the guest claim marker (a null write or a
// removal of its key); every other write, the marker's own included, succeeds.
function failMarkerClears(): void {
  setItemMock.mockImplementation((key: string, value: string) =>
    key === GUEST_CLAIM_STORAGE_KEY && JSON.parse(value) === null
      ? Promise.reject(new Error('storage full'))
      : originalSetItem(key, value),
  );
  removeItemMock.mockImplementation((key: string) =>
    key === GUEST_CLAIM_STORAGE_KEY ? Promise.reject(new Error('storage full')) : originalRemoveItem(key),
  );
  multiRemoveMock.mockImplementation((keys: string[]) =>
    keys.includes(GUEST_CLAIM_STORAGE_KEY) ? Promise.reject(new Error('storage full')) : originalMultiRemove(keys),
  );
}

function restoreWrites(): void {
  setItemMock.mockImplementation(originalSetItem);
  removeItemMock.mockImplementation(originalRemoveItem);
  multiRemoveMock.mockImplementation(originalMultiRemove);
}

// Runs one claim to completion; whether it resolves or rejects is not this
// file's concern, only what it leaves in memory and storage.
async function claimAs(userId: string): Promise<void> {
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

async function expectAClaimedOnce(userId: string): Promise<void> {
  const stored = await readStored(buildUserStatsKey(userId));
  expect(stored?.totals).toEqual(claimedTotals);
  expect(stored?.tracks).toEqual(claimedTracks);
}

async function expectGuestStatsKept(): Promise<void> {
  const stored = await readStored(STORAGE_KEY);
  expect(stored?.totals).toEqual(earnedTotals);
  expect(stored?.tracks?.['python:easy']).toMatchObject({ attempted: 1, correct: 1 });
}

// A claims the guest stats with every marker clear failing, then the device
// is used as a guest (clears still failing) and earns one correct answer.
// Leaves the marker stored and the guest key holding only the new stats.
async function leaveStaleMarkerThenEarnAsGuest(userA: string): Promise<void> {
  const claimView = await renderHydrated(userA);
  failMarkerClears();
  await claimAs(userA);
  await expectAClaimedOnce(userA);
  expect(await readStored(STORAGE_KEY)).toEqual(createEmptyStats(readLocalToday()));
  expect(await readStoredMarker()).not.toBeNull();
  await claimView.unmount();

  const guestView = await renderHydrated(null);
  await act(async () => {
    latest.recordAnswer(correctAnswer);
  });
  await flushTurns();
  expect(latest.stats.totals).toEqual(earnedTotals);
  await expectGuestStatsKept();
  expect(await readStoredMarker()).not.toBeNull();
  await guestView.unmount();
  restoreWrites();
}

afterEach(() => {
  restoreWrites();
});

describe('StatsProvider stale guest claim marker after a completed claim', () => {
  const userA = randomUUID();

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(guestStats));
    await AsyncStorage.setItem(buildUserStatsKey(userA), JSON.stringify(userAStats));
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([buildGuestEntry()]));
  });

  it('keeps the guest stats earned after the claim on a remount as the guest and clears the stale marker', async () => {
    await leaveStaleMarkerThenEarnAsGuest(userA);

    await renderHydrated(null);

    expect(latest.stats.totals).toEqual(earnedTotals);
    await expectGuestStatsKept();
    await expectAClaimedOnce(userA);
    expect(await readStoredMarker()).toBeNull();
  });

  it('keeps the guest stats earned after the claim on a remount as A, folds nothing more into A, and clears the stale marker', async () => {
    await leaveStaleMarkerThenEarnAsGuest(userA);

    await renderHydrated(userA);

    expect(latest.stats.totals).toEqual(claimedTotals);
    await expectGuestStatsKept();
    await expectAClaimedOnce(userA);
    expect(await readStoredMarker()).toBeNull();
  });

  it('keeps the guest stats through the remount as A, then an explicit later claim by A folds them exactly once more', async () => {
    await leaveStaleMarkerThenEarnAsGuest(userA);

    await renderHydrated(userA);
    expect(await readStoredMarker()).toBeNull();
    await expectGuestStatsKept();
    await expectAClaimedOnce(userA);

    await claimAs(userA);

    expect(latest.stats.totals).toEqual(claimedAgainTotals);
    const storedA = await readStored(buildUserStatsKey(userA));
    expect(storedA?.totals).toEqual(claimedAgainTotals);
    expect(storedA?.tracks?.['python:easy']).toMatchObject({ attempted: 10, correct: 8 });
    expect(storedA?.tracks?.['postgres:hard']).toEqual(claimedTracks['postgres:hard']);
    expect(await readStored(STORAGE_KEY)).toEqual(createEmptyStats(readLocalToday()));
    expect(await readStoredMarker()).toBeNull();
  });
});
