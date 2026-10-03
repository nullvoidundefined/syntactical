// Task 3.11 hardening (B-36): a failed upload batch does not starve the
// download. The pass still pages the server's events down (unless the user
// changed) and then reports isOk false.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeResponse, FakeSyncServer } from './fakeSyncServer';

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    heldCalls: [] as string[][],
    log: initialLog,
    mergeCalls: [] as { cursor: string | null; eventIds: string[] }[],
    syncCursor: null as string | null,
    syncedCalls: [] as string[][],
    userId,
    markHeld(ids: string[]): void {
      device.heldCalls.push([...ids]);
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, isHeld: true } : entry));
    },
    markSynced(ids: string[]): void {
      device.syncedCalls.push([...ids]);
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    mergeDownloaded(events: AnswerEvent[], cursor: string | null): void {
      device.mergeCalls.push({ cursor, eventIds: events.map(({ eventId }) => eventId) });
      device.log = mergeDownloadedEvents(device.log, events, userId);
      device.syncCursor = cursor;
    },
  };
  return device;
}

type Device = ReturnType<typeof createDevice>;

function runPass(device: Device, server: FakeSyncServer, isCurrent: () => boolean = () => true) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent,
    markHeld: device.markHeld,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    request: server.request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
}

function failure(status: number, extra: Record<string, unknown> = {}): FakeResponse {
  return { status, body: { error: { code: 'FAILED', message: 'failed', requestId: 'req', ...extra } } };
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

describe('runSyncPass downloads after a failed upload batch', () => {
  it.each([
    ['a 500', failure(500)],
    ['a 503', failure(503)],
    ['a 400', failure(400)],
    ['a 422 naming no ids', failure(422)],
    ['a 422 naming only ids outside the batch', failure(422, { eventIds: [randomUUID()] })],
  ])('still merges the server events after %s on the upload, then resolves isOk false', async (_label, response) => {
    const userId = randomUUID();
    const local = buildOwnedLog(3, userId);
    const device = createDevice(userId, local);
    const remote = Array.from({ length: 4 }, (_unused, index) => buildAnswerEvent(100 + index));
    const server = createFakeSyncServer({ onPost: () => response });
    server.seed(remote);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests().map(({ path }) => path)).toEqual(['answer-events']);
    expect(device.mergeCalls).toEqual([{ cursor: null, eventIds: idsOf(remote) }]);
    for (const event of remote) {
      expect(device.log.find(({ eventId }) => eventId === event.eventId)).toMatchObject({ isSynced: true, ownerUserId: userId });
    }
    expect(device.syncedCalls).toEqual([]);
    expect(device.heldCalls).toEqual([]);
    for (const entry of local) {
      expect(device.log.find(({ eventId }) => eventId === entry.eventId)).toMatchObject({ isHeld: false, isSynced: false });
    }
  });

  it('pages the whole download, storing the last cursor, after a later batch fails', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(250, userId));
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 2 ? failure(500) : undefined), pageSize: 150 });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls.flat()).toEqual(idsOf(device.log.slice(0, 200)));
    // The first batch reached the server: 200 events in two pages of 150.
    expect(server.getRequests()).toHaveLength(2);
    expect(device.mergeCalls.map(({ eventIds }) => eventIds.length)).toEqual([150, 50]);
    expect(device.syncCursor).not.toBeNull();
    expect(device.log.slice(200).every(({ isSynced }) => !isSynced)).toBe(true);
  });

  it('resolves isOk false even when the download after the failed upload succeeds with no events', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    const server = createFakeSyncServer({ onPost: () => failure(500) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests()).toHaveLength(1);
  });

  it('downloads nothing after a failed upload when isCurrent has turned false', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    let isCurrentUser = true;
    const server = createFakeSyncServer({
      onPost: () => {
        isCurrentUser = false;
        return failure(500);
      },
    });
    server.seed([buildAnswerEvent(0)]);

    const result = await runPass(device, server, () => isCurrentUser);

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests()).toEqual([]);
    expect(device.mergeCalls).toEqual([]);
  });
});
