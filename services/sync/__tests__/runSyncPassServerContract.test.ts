// PR #33 review fix 1 (B-36): the server answers a stored upload with 200
// { data: { dailyProgress, dayStreak, xpToday, xpTotal, insertedCount } } and
// no `inserted`. A batch is marked synced when the 2xx body's `data` is a
// record; when `data` is missing or not a record nothing is marked synced and
// the pass reports failure.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeResponse, FakeSyncServer } from './fakeSyncServer';
import { buildUploadSuccess, buildUploadTotals } from './syncServerResponses';

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    log: initialLog,
    syncCursor: null as string | null,
    syncedCalls: [] as string[][],
    userId,
    markHeld(ids: string[]): void {
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, isHeld: true } : entry));
    },
    markSynced(ids: string[]): void {
      device.syncedCalls.push([...ids]);
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    mergeDownloaded(events: AnswerEvent[], cursor: string | null): void {
      device.log = mergeDownloadedEvents(device.log, events, userId);
      device.syncCursor = cursor;
    },
  };
  return device;
}

type Device = ReturnType<typeof createDevice>;

function runPass(device: Device, server: FakeSyncServer) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    request: server.request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

describe('runSyncPass reads the server upload response', () => {
  it('marks every batch synced when each 200 carries the real totals body', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ onPost: (events) => buildUploadSuccess(events.length) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.syncedCalls.flat()).toEqual(idsOf(log));
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
    expect(server.postRequests()).toHaveLength(2);
    expect(server.getRequests()).toHaveLength(1);
  });

  it('marks the batch synced on a re-post whose real body says insertedCount 0', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(5, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ onPost: () => buildUploadSuccess(0) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.syncedCalls).toEqual([idsOf(log)]);
  });

  it('marks the batch synced when data is a record holding the totals without insertedCount', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(5, userId);
    const device = createDevice(userId, log);
    const { dailyProgress, dayStreak, xpToday, xpTotal } = buildUploadTotals(5);
    const server = createFakeSyncServer({
      onPost: () => ({ status: 200, body: { data: { dailyProgress, dayStreak, xpToday, xpTotal } } }),
    });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
  });

  it.each([
    ['a null body', null],
    ['an empty object body', {}],
    ['a null data', { data: null }],
    ['a string data', { data: 'x' }],
    ['the totals outside data', buildUploadTotals(3)],
  ])('marks nothing synced and reports failure for a 200 with %s', async (_label, body) => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(250, userId));
    const response: FakeResponse = { status: 200, body };
    const server = createFakeSyncServer({ onPost: () => response });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls).toEqual([]);
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
    expect(server.postRequests()).toHaveLength(1);
  });
});
