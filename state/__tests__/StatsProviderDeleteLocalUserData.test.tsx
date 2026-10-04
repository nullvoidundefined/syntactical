// B-59 (client half): after the server deletes an account, deleteLocalUserData
// removes that user's answer events and stats key (sync cursor included) from
// the device, leaves guest and other users' data alone, refuses while the user
// is still the StatsProvider owner, rejects when the event log change is not
// persisted, and never lets an already queued stats write recreate the key.
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

let latest: StatsValue;

function DeletionProbe() {
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

function buildStats(attempted: number, cursorOwner?: string): Stats {
  const empty = createEmptyStats(readLocalToday());
  const stats: Stats = { ...empty, totals: { ...empty.totals, attempted, correct: attempted } };
  if (cursorOwner === undefined) return stats;
  return { ...stats, syncCursor: `cursor-${randomUUID()}`, syncCursorOwner: cursorOwner };
}

async function seedLog(log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(log));
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]') as LoggedAnswerEvent[];
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(
    <StatsProvider ownerUserId={ownerUserId}>
      <DeletionProbe />
    </StatsProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

async function settle(rounds = 30): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

const correctAnswer = { choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true } as const;

type Seeded = {
  guestEntries: LoggedAnswerEvent[];
  otherUserEntries: LoggedAnswerEvent[];
  deletedUserEntries: LoggedAnswerEvent[];
  log: LoggedAnswerEvent[];
  guestStatsText: string;
  otherUserStatsText: string;
  deletedUserStatsText: string;
};

// A device that holds a guest, the user being deleted, and another user, with
// the deleted user's entries in every sync state and interleaved with the rest.
async function seedDevice(deletedUserId: string, otherUserId: string): Promise<Seeded> {
  const unsyncedDeleted = buildEntry(deletedUserId);
  const syncedDeleted = buildEntry(deletedUserId, { isSynced: true });
  const heldDeleted = buildEntry(deletedUserId, { isHeld: true });
  const guestOne = buildEntry(null);
  const guestTwo = buildEntry(null, { isSynced: true });
  const otherUnsynced = buildEntry(otherUserId);
  const otherSynced = buildEntry(otherUserId, { isSynced: true });
  const log = [guestOne, unsyncedDeleted, otherUnsynced, syncedDeleted, guestTwo, heldDeleted, otherSynced];
  await seedLog(log);
  const guestStatsText = JSON.stringify(buildStats(2));
  const otherUserStatsText = JSON.stringify(buildStats(5, otherUserId));
  const deletedUserStatsText = JSON.stringify(buildStats(3, deletedUserId));
  await AsyncStorage.setItem(STORAGE_KEY, guestStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(otherUserId), otherUserStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(deletedUserId), deletedUserStatsText);
  return {
    deletedUserEntries: [unsyncedDeleted, syncedDeleted, heldDeleted],
    deletedUserStatsText,
    guestEntries: [guestOne, guestTwo],
    guestStatsText,
    log,
    otherUserEntries: [otherUnsynced, otherSynced],
    otherUserStatsText,
  };
}

const setItemMock = AsyncStorage.setItem as unknown as jest.Mock;
const originalSetItem = setItemMock.getMockImplementation();

describe('StatsProvider deleteLocalUserData', () => {
  let deletedUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    deletedUserId = randomUUID();
    otherUserId = randomUUID();
    setItemMock.mockImplementation(originalSetItem);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    setItemMock.mockImplementation(originalSetItem);
    jest.restoreAllMocks();
  });

  it('removes every stored event of that user, synced, unsynced, and held, and keeps guest and other users\' events in order', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderHydrated(null);

    await act(async () => latest.deleteLocalUserData(deletedUserId));

    const [guestOne, guestTwo] = seeded.guestEntries;
    const [otherUnsynced, otherSynced] = seeded.otherUserEntries;
    expect(await readStoredLog()).toEqual([guestOne, otherUnsynced, guestTwo, otherSynced]);
  });

  it('removes that user\'s events from the in-memory log, so a later write never brings them back', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    const view = await renderHydrated(null);

    await act(async () => latest.deleteLocalUserData(deletedUserId));
    await act(async () => latest.recordAnswer(correctAnswer));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(seeded.log.length - seeded.deletedUserEntries.length + 1));

    const stored = await readStoredLog();
    expect(stored.filter((entry) => entry.ownerUserId === deletedUserId)).toEqual([]);
    expect(stored.slice(0, 4)).toEqual([seeded.guestEntries[0], seeded.otherUserEntries[0], seeded.guestEntries[1], seeded.otherUserEntries[1]]);
    expect(stored[4]).toMatchObject({ ownerUserId: null, questionId: 'py-easy-01' });

    // Signing that id in again on this device shows no events of the deleted account.
    await view.rerender(
      <StatsProvider ownerUserId={deletedUserId}>
        <DeletionProbe />
      </StatsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(latest.eventLog).toEqual([]);
  });

  it('removes that user\'s stats key, sync cursor included, and leaves the guest and other users\' stats keys untouched', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderHydrated(null);

    await act(async () => latest.deleteLocalUserData(deletedUserId));
    await settle();

    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull();
    expect(await AsyncStorage.getAllKeys()).not.toContain(buildUserStatsKey(deletedUserId));
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(seeded.guestStatsText);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(seeded.otherUserStatsText);
    const allStored = (await AsyncStorage.multiGet(await AsyncStorage.getAllKeys())).map(([, value]) => value ?? '').join('\n');
    expect(allStored).not.toContain((JSON.parse(seeded.deletedUserStatsText) as Stats).syncCursor);
  });

  it('works while another user owns the provider and leaves that owner\'s visible events alone', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderHydrated(otherUserId);
    expect(latest.eventLog).toEqual(seeded.otherUserEntries);

    await act(async () => latest.deleteLocalUserData(deletedUserId));

    expect(latest.eventLog).toEqual(seeded.otherUserEntries);
    expect((await readStoredLog()).filter((entry) => entry.ownerUserId === deletedUserId)).toEqual([]);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull();
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(seeded.otherUserStatsText);
  });

  it('rejects and removes nothing while that user is still the owner', async () => {
    const seeded = await seedDevice(deletedUserId, otherUserId);
    await renderHydrated(deletedUserId);
    expect(latest.eventLog).toEqual(seeded.deletedUserEntries);

    let rejection: unknown = null;
    await act(async () => {
      await latest.deleteLocalUserData(deletedUserId).catch((error: unknown) => {
        rejection = error;
      });
    });
    await settle();

    expect(rejection).toBeInstanceOf(Error);
    expect(await readStoredLog()).toEqual(seeded.log);
    expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBe(seeded.deletedUserStatsText);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(seeded.guestStatsText);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(seeded.otherUserStatsText);
    expect(latest.eventLog).toEqual(seeded.deletedUserEntries);
  });

  it('rejects when the event log change cannot be persisted', async () => {
    await seedDevice(deletedUserId, otherUserId);
    await renderHydrated(null);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setItemMock.mockImplementation(async (key: string, value: string) => {
      if (key === EVENT_LOG_STORAGE_KEY) throw new Error('storage full');
      return originalSetItem?.(key, value);
    });

    let rejection: unknown = null;
    await act(async () => {
      await latest.deleteLocalUserData(deletedUserId).catch((error: unknown) => {
        rejection = error;
      });
    });

    expect(rejection).toBeInstanceOf(Error);
  });

  it('keeps the stats key absent when a stats write for that user was already queued before the call', async () => {
    await seedDevice(deletedUserId, otherUserId);
    const deletedKey = buildUserStatsKey(deletedUserId);
    let releaseWrite: () => void = () => undefined;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let isWriteHeld = false;
    const view = await renderHydrated(deletedUserId);

    // The next write to the deleted user's stats key waits until released.
    setItemMock.mockImplementation(async (key: string, value: string) => {
      if (key === deletedKey && !isWriteHeld) {
        isWriteHeld = true;
        await writeGate;
      }
      return originalSetItem?.(key, value);
    });
    await act(async () => latest.recordAnswer(correctAnswer));
    await waitFor(() => expect(isWriteHeld).toBe(true));

    // The user signs out locally, then the device data is removed.
    await view.rerender(
      <StatsProvider ownerUserId={null}>
        <DeletionProbe />
      </StatsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));

    let deletion: Promise<void> = Promise.resolve();
    await act(async () => {
      deletion = latest.deleteLocalUserData(deletedUserId);
    });
    await act(async () => releaseWrite());
    await act(async () => deletion);
    await settle();

    expect(await AsyncStorage.getItem(deletedKey)).toBeNull();
    expect((await readStoredLog()).filter((entry) => entry.ownerUserId === deletedUserId)).toEqual([]);
  });
});
