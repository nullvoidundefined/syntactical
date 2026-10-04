import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerEvent } from '@syntactical/progress';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { StatsProvider, useQuizStats } from '../StatsProvider';

type StatsValue = ReturnType<typeof useQuizStats>;

let latest: StatsValue;

function ActionProbe() {
  const value = useQuizStats();
  latest = value;
  return (
    <>
      <Text testID="hydrated">{String(value.isHydrated)}</Text>
      <Text testID="events">{value.eventLog.length}</Text>
    </>
  );
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

function stripToAnswerEvent({ answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind }: LoggedAnswerEvent): AnswerEvent {
  return { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind };
}

function buildCursor(): string {
  return `cursor-${randomUUID()}`;
}

async function seedLog(log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(log));
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]');
}

// A signed-in user's stats, sync cursor included, live under that user's key.
async function readStoredStats(userId: string): Promise<Stats | null> {
  return JSON.parse((await AsyncStorage.getItem(buildUserStatsKey(userId))) ?? 'null');
}

function findEntry(log: LoggedAnswerEvent[], eventId: string): LoggedAnswerEvent | undefined {
  return log.find((entry) => entry.eventId === eventId);
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(<StatsProvider ownerUserId={ownerUserId}><ActionProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;

describe('StatsProvider sync actions', () => {
  const userA = randomUUID();
  const userB = randomUUID();

  beforeEach(() => AsyncStorage.clear());

  it('claimGuestEvents gives every guest entry to the user, persists it, and leaves other users\' entries alone', async () => {
    const guestOne = buildEntry(null);
    const ownedByA = buildEntry(userA, { isSynced: true });
    const ownedByB = buildEntry(userB);
    const guestTwo = buildEntry(null, { isHeld: true });
    await seedLog([guestOne, ownedByA, ownedByB, guestTwo]);
    await renderHydrated(userA);
    expect(screen.getByTestId('events')).toHaveTextContent('1');
    await act(async () => latest.claimGuestEvents(userA));
    await waitFor(async () => expect(findEntry(await readStoredLog(), guestOne.eventId)?.ownerUserId).toBe(userA));
    const stored = await readStoredLog();
    expect(stored).toEqual([{ ...guestOne, ownerUserId: userA }, ownedByA, ownedByB, { ...guestTwo, ownerUserId: userA }]);
    expect(screen.getByTestId('events')).toHaveTextContent('3');
  });

  it('markEventsSynced and markEventsHeld change only the named entries and persist', async () => {
    const first = buildEntry(userA);
    const second = buildEntry(userA);
    const third = buildEntry(userA);
    const ownedByB = buildEntry(userB);
    await seedLog([first, second, third, ownedByB]);
    await renderHydrated(userA);
    await act(async () => latest.markEventsSynced([first.eventId]));
    await act(async () => latest.markEventsHeld([second.eventId]));
    await waitFor(async () => expect(findEntry(await readStoredLog(), second.eventId)?.isHeld).toBe(true));
    expect(await readStoredLog()).toEqual([
      { ...first, isSynced: true },
      { ...second, isHeld: true },
      third,
      ownedByB,
    ]);
    expect(latest.eventLog).toEqual([{ ...first, isSynced: true }, { ...second, isHeld: true }, third]);
  });

  it('mergeDownloadedEvents adds downloaded events for the current owner without duplicates and stores the cursor', async () => {
    const existing = buildEntry(userA);
    const ownedByB = buildEntry(userB);
    await seedLog([existing, ownedByB]);
    await renderHydrated(userA);
    const newOne = buildAnswerEvent();
    const newTwo = buildAnswerEvent();
    const cursor = buildCursor();
    await act(async () => latest.mergeDownloadedEvents([stripToAnswerEvent(existing), newOne, newTwo], cursor, userA));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(4));
    const stored = await readStoredLog();
    expect(new Set(stored.map(({ eventId }) => eventId)).size).toBe(4);
    expect(findEntry(stored, newOne.eventId)).toEqual({ ...newOne, isHeld: false, isSynced: true, ownerUserId: userA });
    expect(findEntry(stored, newTwo.eventId)).toEqual({ ...newTwo, isHeld: false, isSynced: true, ownerUserId: userA });
    expect(findEntry(stored, existing.eventId)).toMatchObject({ ownerUserId: userA, isSynced: true });
    expect(findEntry(stored, ownedByB.eventId)).toEqual(ownedByB);
    await waitFor(async () => expect((await readStoredStats(userA))?.syncCursor).toBe(cursor));
    expect(latest.stats.syncCursor).toBe(cursor);
    expect(latest.eventLog).toHaveLength(3);
  });

  it('removeUserEvents removes every entry of that user, synced or held, and persists', async () => {
    const unsyncedA = buildEntry(userA);
    const heldA = buildEntry(userA, { isHeld: true });
    const syncedA = buildEntry(userA, { isSynced: true });
    const unsyncedB = buildEntry(userB);
    const guest = buildEntry(null);
    await seedLog([unsyncedA, syncedA, unsyncedB, heldA, guest]);
    await renderHydrated(userA);
    await act(async () => latest.removeUserEvents(userA));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2));
    expect(await readStoredLog()).toEqual([unsyncedB, guest]);
    expect(latest.eventLog).toEqual([]);
  });

  it('clearSyncCursor removes the stored cursor and keeps the rest of the stats', async () => {
    const seeded: Stats = { ...createEmptyStats(readLocalToday()), syncCursor: buildCursor() };
    await AsyncStorage.setItem(buildUserStatsKey(userA), JSON.stringify(seeded));
    await renderHydrated(userA);
    expect(latest.stats.syncCursor).toBe(seeded.syncCursor);
    await act(async () => latest.clearSyncCursor());
    await waitFor(async () => expect(await readStoredStats(userA)).not.toHaveProperty('syncCursor'));
    const { syncCursor: _dropped, ...rest } = seeded;
    expect(await readStoredStats(userA)).toEqual(rest);
    expect(latest.stats.syncCursor).toBeUndefined();
  });

  it('ignores every sync action before hydration and writes nothing', async () => {
    const guest = buildEntry(null);
    const unsyncedA = buildEntry(userA);
    const seededLog = [guest, unsyncedA];
    const seededStats: Stats = { ...createEmptyStats(readLocalToday()), syncCursor: buildCursor() };
    await seedLog(seededLog);
    await AsyncStorage.setItem(buildUserStatsKey(userA), JSON.stringify(seededStats));
    const storedText = new Map([
      [EVENT_LOG_STORAGE_KEY, JSON.stringify(seededLog)],
      [buildUserStatsKey(userA), JSON.stringify(seededStats)],
    ]);
    let releaseReads: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const gatedRead = async (key: string) => {
      await gate;
      return storedText.get(key) ?? null;
    };
    // Every hydration read waits on the gate, however many keys the provider
    // reads. getItem is the shared mock's jest.fn, so its own implementation is
    // put back afterwards rather than restored to none.
    const getItem = AsyncStorage.getItem as unknown as jest.Mock;
    const originalGetItem = getItem.getMockImplementation();
    getItem.mockImplementation(gatedRead);
    // The spy wraps the shared mock, which already holds the two seed writes.
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    await render(<StatsProvider ownerUserId={userA}><ActionProbe /></StatsProvider>);
    expect(screen.getByTestId('hydrated')).toHaveTextContent('false');
    await act(async () => {
      latest.claimGuestEvents(userA);
      void latest.markEventsSynced([unsyncedA.eventId]).catch(() => undefined);
      void latest.markEventsHeld([unsyncedA.eventId]).catch(() => undefined);
      void latest.mergeDownloadedEvents([buildAnswerEvent()], buildCursor(), userA).catch(() => undefined);
      latest.removeUserEvents(userA);
      latest.clearSyncCursor();
    });
    await act(async () => releaseReads());
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    getItem.mockImplementation(originalGetItem);
    expect(setItem).not.toHaveBeenCalled();
    expect(latest.eventLog).toEqual([unsyncedA]);
    expect(latest.stats.syncCursor).toBe(seededStats.syncCursor);
  });

  it('keeps an answer recorded between claimGuestEvents and markEventsSynced', async () => {
    const guestOne = buildEntry(null);
    const guestTwo = buildEntry(null);
    await seedLog([guestOne, guestTwo]);
    await renderHydrated(userA);
    await act(async () => {
      latest.claimGuestEvents(userA);
      latest.recordAnswer(correctAnswer);
      void latest.markEventsSynced([guestOne.eventId, guestTwo.eventId]);
    });
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(3));
    const stored = await readStoredLog();
    expect(stored.slice(0, 2)).toEqual([
      { ...guestOne, isSynced: true, ownerUserId: userA },
      { ...guestTwo, isSynced: true, ownerUserId: userA },
    ]);
    expect(stored[2]).toMatchObject({ isSynced: false, ownerUserId: userA, questionId: 'py-easy-01' });
    expect(latest.eventLog).toHaveLength(3);
    expect((await readStoredStats(userA))?.totals.attempted).toBe(1);
  });

  it('keeps an answer recorded between mergeDownloadedEvents and removeUserEvents only until the removal', async () => {
    await renderHydrated(userA);
    const downloaded = buildAnswerEvent();
    const cursor = buildCursor();
    await act(async () => {
      void latest.mergeDownloadedEvents([downloaded], cursor, userA);
      latest.recordAnswer(correctAnswer);
    });
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2));
    await act(async () => latest.removeUserEvents(userA));
    await waitFor(async () => expect(await readStoredLog()).toEqual([]));
    expect((await readStoredStats(userA))?.syncCursor).toBe(cursor);
  });
});
