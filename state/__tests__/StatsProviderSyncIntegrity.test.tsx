// Task 3.11 hardening (B-36, B-61): the download cursor belongs to the user
// who stored it, and every event-log action reports whether it reached storage.
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

function IntegrityProbe() {
  const value = useQuizStats();
  latest = value;
  return <Text testID="hydrated">{String(value.isHydrated)}</Text>;
}

let eventIndex = 0;

function buildAnswerEvent(): AnswerEvent {
  eventIndex += 1;
  return {
    answeredAt: new Date(Date.UTC(2026, 9, 1, 12) + eventIndex * 1000).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: eventIndex % 4,
    eventId: randomUUID(),
    isCorrect: eventIndex % 2 === 0,
    questionId: `question-${eventIndex}`,
    roundKind: 'bank',
  };
}

function buildEntry(ownerUserId: string | null, flags: { isHeld?: boolean; isSynced?: boolean } = {}): LoggedAnswerEvent {
  return { ...buildAnswerEvent(), isHeld: flags.isHeld ?? false, isSynced: flags.isSynced ?? false, ownerUserId };
}

function buildCursor(): string {
  return `cursor-${randomUUID()}`;
}

async function seedLog(log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(log));
}

// The guest's stats keep the original key; each signed-in user's stats, sync
// cursor included, live under that user's key.
function statsKeyFor(ownerUserId: string | null): string {
  return ownerUserId === null ? STORAGE_KEY : buildUserStatsKey(ownerUserId);
}

async function seedStats(stats: Stats, ownerUserId: string | null): Promise<void> {
  await AsyncStorage.setItem(statsKeyFor(ownerUserId), JSON.stringify(stats));
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]');
}

async function readStoredStats(ownerUserId: string | null): Promise<Stats | null> {
  return JSON.parse((await AsyncStorage.getItem(statsKeyFor(ownerUserId))) ?? 'null');
}

function renderProvider(ownerUserId: string | null) {
  return render(<StatsProvider ownerUserId={ownerUserId}><IntegrityProbe /></StatsProvider>);
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await renderProvider(ownerUserId);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

async function flushTurns(rounds = 20): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

// The AsyncStorage mock's setItem is a jest.fn; these helpers swap its
// implementation for writes to the event log key and restore it after.
const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const originalSetItem = setItemMock.getMockImplementation() as SetItem;

function failEventLogWrites(): void {
  setItemMock.mockImplementation((key: string, value: string) =>
    key === EVENT_LOG_STORAGE_KEY ? Promise.reject(new Error('storage full')) : originalSetItem(key, value),
  );
}

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
function track(promise: Promise<unknown> | void) {
  expect(promise).toBeInstanceOf(Promise);
  const state = { error: undefined as unknown, isRejected: false, isSettled: false };
  (promise as Promise<unknown>).then(
    () => {
      state.isSettled = true;
    },
    (error: unknown) => {
      state.error = error;
      state.isRejected = true;
      state.isSettled = true;
    },
  );
  return state;
}

afterEach(() => {
  setItemMock.mockImplementation(originalSetItem);
});

describe('StatsProvider sync cursor ownership', () => {
  const userA = randomUUID();
  const userB = randomUUID();

  beforeEach(() => AsyncStorage.clear());

  it('gives the cursor back to the user who stored it, also after a remount', async () => {
    const view = await renderHydrated(userA);
    const cursor = buildCursor();
    await act(async () => latest.mergeDownloadedEvents([buildAnswerEvent()], cursor, userA));
    expect(latest.readSyncCursor(userA)).toBe(cursor);
    await view.unmount();
    await renderHydrated(userA);
    expect(latest.readSyncCursor(userA)).toBe(cursor);
    expect((await readStoredStats(userA))?.syncCursor).toBe(cursor);
  });

  it('gives B no cursor after the owner changes from A to B without clearSyncCursor (sign-out)', async () => {
    const view = await renderHydrated(userA);
    const cursor = buildCursor();
    await act(async () => latest.mergeDownloadedEvents([buildAnswerEvent()], cursor, userA));
    await view.rerender(<StatsProvider ownerUserId={null}><IntegrityProbe /></StatsProvider>);
    await view.rerender(<StatsProvider ownerUserId={userB}><IntegrityProbe /></StatsProvider>);
    expect(latest.readSyncCursor(userB)).toBeNull();
  });

  it('gives B no cursor after the app is killed before clearSyncCursor and remounts signed in as B', async () => {
    const view = await renderHydrated(userA);
    const cursor = buildCursor();
    await act(async () => latest.mergeDownloadedEvents([buildAnswerEvent()], cursor, userA));
    await view.unmount();
    await renderHydrated(userB);
    expect(latest.readSyncCursor(userB)).toBeNull();
  });

  it('treats a stored cursor saved without an owner as no cursor and still loads the rest of the stats', async () => {
    const seeded: Stats = { ...createEmptyStats(readLocalToday()), syncCursor: buildCursor(), totals: { attempted: 7, correct: 5 } };
    await seedStats(seeded, userA);
    await renderHydrated(userA);
    expect(latest.stats.totals).toEqual({ attempted: 7, correct: 5 });
    expect(latest.readSyncCursor(userA)).toBeNull();
    expect(await readStoredStats(userA)).toEqual(seeded);
  });
});

describe('StatsProvider sync actions report a failed event-log write', () => {
  const userA = randomUUID();

  beforeEach(() => AsyncStorage.clear());

  it.each(['markEventsSynced', 'markEventsHeld'] as const)('%s rejects when the event-log write fails', async (action) => {
    const entry = buildEntry(userA);
    await seedLog([entry]);
    await renderHydrated(userA);
    failEventLogWrites();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest[action]([entry.eventId]));
    });
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    expect(outcome?.isRejected).toBe(true);
    expect(await readStoredLog()).toEqual([entry]);
  });

  it('mergeDownloadedEvents rejects when the event-log write fails and stores no cursor', async () => {
    await renderHydrated(userA);
    failEventLogWrites();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest.mergeDownloadedEvents([buildAnswerEvent()], buildCursor(), userA));
    });
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    await flushTurns();
    expect(outcome?.isRejected).toBe(true);
    expect((await readStoredStats(userA))?.syncCursor).toBeUndefined();
    expect(latest.stats.syncCursor).toBeUndefined();
  });
});

describe('StatsProvider claimGuestEvents and removeUserEvents settle with their write', () => {
  const userA = randomUUID();

  beforeEach(() => AsyncStorage.clear());

  it('claimGuestEvents resolves only once the claim is persisted', async () => {
    const guest = buildEntry(null);
    await seedLog([guest]);
    await renderHydrated(userA);
    const hold = holdNextEventLogWrite();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest.claimGuestEvents(userA));
    });
    await waitFor(() => expect(hold.isReached()).toBe(true));
    await flushTurns();
    expect(outcome?.isSettled).toBe(false);
    await act(async () => hold.release());
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    expect(outcome?.isRejected).toBe(false);
    expect(await readStoredLog()).toEqual([{ ...guest, ownerUserId: userA }]);
  });

  it('claimGuestEvents rejects when the write fails', async () => {
    await seedLog([buildEntry(null)]);
    await renderHydrated(userA);
    failEventLogWrites();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest.claimGuestEvents(userA));
    });
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    expect(outcome?.isRejected).toBe(true);
  });

  it('removeUserEvents resolves only once persisted, and the removed events stay gone after a remount', async () => {
    const unsynced = buildEntry(userA);
    const synced = buildEntry(userA, { isSynced: true });
    await seedLog([unsynced, synced]);
    const view = await renderHydrated(userA);
    const hold = holdNextEventLogWrite();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest.removeUserEvents(userA));
    });
    await waitFor(() => expect(hold.isReached()).toBe(true));
    await flushTurns();
    expect(outcome?.isSettled).toBe(false);
    await act(async () => hold.release());
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    expect(outcome?.isRejected).toBe(false);
    await view.unmount();
    await renderHydrated(userA);
    expect(latest.eventLog).toEqual([]);
  });

  it('removeUserEvents rejects when the write fails', async () => {
    await seedLog([buildEntry(userA)]);
    await renderHydrated(userA);
    failEventLogWrites();
    let outcome: ReturnType<typeof track> | undefined;
    await act(async () => {
      outcome = track(latest.removeUserEvents(userA));
    });
    await waitFor(() => expect(outcome?.isSettled).toBe(true));
    expect(outcome?.isRejected).toBe(true);
  });
});
