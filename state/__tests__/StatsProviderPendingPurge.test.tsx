// B-59c: a deleted account's local data is purged durably. The client records
// the deleted user's id in a pending-purge list (AsyncStorage key
// `syntactical.account.pending-purge.v1`, a JSON array of user ids) before it
// signs out; StatsProvider applies every pending purge it can once the event
// log has loaded and that id is not the current owner: the user's event log
// entries and stats key leave the device, then the id leaves the list. A purge
// that fails keeps the id, logs a warning that carries no user id, and
// succeeds on a later mount once storage recovers. Guest data, other users'
// data, and the current owner's data are never touched.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { buildUserStatsKey, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { buildOwnedLog } from '../../services/sync/__tests__/fakeSyncServer';
import { StatsProvider, useQuizStats } from '../StatsProvider';

import { captureConsole } from './authTestSupport';
import { flush, idsOf, readStoredLog, seedEventLog } from './syncTestSupport';

const PENDING_PURGE_STORAGE_KEY = 'syntactical.account.pending-purge.v1';

function HydrationProbe() {
  const { isHydrated } = useQuizStats();
  return <Text testID="hydrated">{String(isHydrated)}</Text>;
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(
    <StatsProvider ownerUserId={ownerUserId}>
      <HydrationProbe />
    </StatsProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

async function seedPendingPurge(userIds: string[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_PURGE_STORAGE_KEY, JSON.stringify(userIds));
}

// An absent key and an empty array both mean nothing is pending.
async function readPendingPurge(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PENDING_PURGE_STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as string[]);
}

function buildStatsText(attempted: number): string {
  const empty = createEmptyStats(readLocalToday());
  return JSON.stringify({ ...empty, totals: { ...empty.totals, attempted, correct: attempted } });
}

type Device = {
  deletedEvents: LoggedAnswerEvent[];
  guestEvents: LoggedAnswerEvent[];
  otherEvents: LoggedAnswerEvent[];
  guestStatsText: string;
  otherStatsText: string;
};

// A device holding a guest, a deleted user, and another user, with entries
// interleaved and every one of them owning a stats key.
async function seedDevice(deletedUserId: string, otherUserId: string): Promise<Device> {
  const deletedEvents = buildOwnedLog(3, deletedUserId).map((entry, index) => ({ ...entry, isSynced: index !== 0 }));
  const guestEvents = buildOwnedLog(2, null, 10);
  const otherEvents = buildOwnedLog(2, otherUserId, 20);
  await seedEventLog([guestEvents[0], deletedEvents[0], otherEvents[0], deletedEvents[1], guestEvents[1], deletedEvents[2], otherEvents[1]]);
  const guestStatsText = buildStatsText(2);
  const otherStatsText = buildStatsText(5);
  await AsyncStorage.setItem(STORAGE_KEY, guestStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(otherUserId), otherStatsText);
  await AsyncStorage.setItem(buildUserStatsKey(deletedUserId), buildStatsText(3));
  return { deletedEvents, guestEvents, guestStatsText, otherEvents, otherStatsText };
}

function storedIdsOwnedBy(log: LoggedAnswerEvent[], userId: string | null): string[] {
  return idsOf(log.filter(({ ownerUserId }) => ownerUserId === userId));
}

// logWarning writes one JSON line with level "warn".
function isLogWarningLine(line: string): boolean {
  try {
    return (JSON.parse(line) as { level?: unknown }).level === 'warn';
  } catch {
    return false;
  }
}

const removeItemMock =AsyncStorage.removeItem as unknown as jest.Mock;
const originalRemoveItem = removeItemMock.getMockImplementation();

describe('StatsProvider pending account purge', () => {
  let deletedUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    deletedUserId = randomUUID();
    otherUserId = randomUUID();
    removeItemMock.mockImplementation(originalRemoveItem);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    removeItemMock.mockImplementation(originalRemoveItem);
    jest.restoreAllMocks();
  });

  it('on a fresh guest mount, removes a pending user\'s events and stats key, empties the list, and keeps guest and other users\' data', async () => {
    const device = await seedDevice(deletedUserId, otherUserId);
    await seedPendingPurge([deletedUserId]);

    await renderHydrated(null);

    await waitFor(async () => expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull());
    await waitFor(async () => expect(await readPendingPurge()).toEqual([]));
    await flush();

    const stored = await readStoredLog();
    expect(storedIdsOwnedBy(stored, deletedUserId)).toEqual([]);
    expect(idsOf(stored)).toEqual(idsOf([device.guestEvents[0], device.otherEvents[0], device.guestEvents[1], device.otherEvents[1]]));
    expect(await AsyncStorage.getAllKeys()).not.toContain(buildUserStatsKey(deletedUserId));
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(device.guestStatsText);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(device.otherStatsText);
  });

  it('never purges the current owner: that id stays pending with its data until it is no longer the owner, while other pending ids are purged', async () => {
    const device = await seedDevice(deletedUserId, otherUserId);
    const ownerStatsText = await AsyncStorage.getItem(buildUserStatsKey(otherUserId));
    await seedPendingPurge([otherUserId, deletedUserId]);

    const view = await renderHydrated(otherUserId);

    await waitFor(async () => expect(await AsyncStorage.getItem(buildUserStatsKey(deletedUserId))).toBeNull());
    await waitFor(async () => expect(await readPendingPurge()).toEqual([otherUserId]));
    await flush();
    const whileOwner = await readStoredLog();
    expect(storedIdsOwnedBy(whileOwner, deletedUserId)).toEqual([]);
    expect(storedIdsOwnedBy(whileOwner, otherUserId)).toEqual(idsOf(device.otherEvents));
    expect(storedIdsOwnedBy(whileOwner, null)).toEqual(idsOf(device.guestEvents));
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBe(ownerStatsText);
    expect(await readPendingPurge()).toEqual([otherUserId]);

    // The pending owner signs out: now its data goes too, and only its data.
    await view.rerender(
      <StatsProvider ownerUserId={null}>
        <HydrationProbe />
      </StatsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    await waitFor(async () => expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).toBeNull());
    await waitFor(async () => expect(await readPendingPurge()).toEqual([]));
    await flush();

    const afterSignOut = await readStoredLog();
    expect(storedIdsOwnedBy(afterSignOut, otherUserId)).toEqual([]);
    expect(idsOf(afterSignOut)).toEqual(idsOf(device.guestEvents));
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(device.guestStatsText);
  });

  it('when removing the stats key fails, keeps the id pending, warns with no user id, and purges on the next mount once storage recovers', async () => {
    await seedDevice(deletedUserId, otherUserId);
    await seedPendingPurge([deletedUserId]);
    const deletedKey = buildUserStatsKey(deletedUserId);
    let failedRemovals = 0;
    removeItemMock.mockImplementation(async (key: string) => {
      if (key === deletedKey) {
        failedRemovals += 1;
        throw new Error('storage unavailable');
      }
      return originalRemoveItem?.(key);
    });
    const consoleCapture = captureConsole();

    const firstLaunch = await renderHydrated(null);
    await waitFor(() => expect(failedRemovals).toBeGreaterThan(0));
    await flush();

    expect(await readPendingPurge()).toEqual([deletedUserId]);
    expect(await AsyncStorage.getItem(deletedKey)).not.toBeNull();
    const warnLines = consoleCapture
      .serialisedFor('warn')
      .split('\n')
      .filter((line) => line.trim() !== '');
    const everything = consoleCapture.serialised();
    consoleCapture.restore();
    expect(warnLines.some(isLogWarningLine)).toBe(true);
    expect(everything).not.toContain(deletedUserId);

    // Next launch: storage works again.
    await act(async () => firstLaunch.unmount());
    removeItemMock.mockImplementation(originalRemoveItem);
    await renderHydrated(null);

    await waitFor(async () => expect(await AsyncStorage.getItem(deletedKey)).toBeNull());
    await waitFor(async () => expect(await readPendingPurge()).toEqual([]));
    expect(storedIdsOwnedBy(await readStoredLog(), deletedUserId)).toEqual([]);
    expect(await AsyncStorage.getItem(buildUserStatsKey(otherUserId))).not.toBeNull();
  });
});
