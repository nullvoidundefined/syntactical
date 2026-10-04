// PR #33 review round 2, fix 1 (B-36): on 422 SYNC_EVENT_CAP_REACHED,
// runSyncPass retries the refused batch in halves (200, 100, 50, ... down to
// 1 event) before giving up. Every event that fits under the cap is uploaded
// and marked synced; only when a 1-event batch still gets the cap does the
// pass resolve { isOk: false, isUploadCapReached: true }. Nothing is ever
// held for the cap, and the download still runs.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeSyncServer } from './fakeSyncServer';
import { buildErrorResponse, SERVER_ERROR_CODES } from './syncServerResponses';

const NOW = new Date(Date.UTC(2026, 9, 2, 12));
const MAX_BATCH = 200;

function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    heldIds: [] as string[],
    log: initialLog,
    userId,
    markHeld(ids: string[]): void {
      device.heldIds.push(...ids);
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, isHeld: true } : entry));
    },
    markSynced(ids: string[]): void {
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    mergeDownloaded(events: AnswerEvent[]): void {
      device.log = mergeDownloadedEvents(device.log, events, userId);
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
    markReleased: () => undefined,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    now: () => NOW,
    request: server.request,
    syncCursor: null,
    userId: device.userId,
  });
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

function postedIds(post: { body: unknown }): string[] {
  return (post.body as { events: AnswerEvent[] }).events.map(({ eventId }) => eventId);
}

// A server already holding `remoteCount` events with a cap of `maxStoredEvents`.
function createSeededServer(remoteCount: number, maxStoredEvents: number) {
  const server = createFakeSyncServer({ maxStoredEvents });
  server.seed(Array.from({ length: remoteCount }, (_unused, index) => buildAnswerEvent(8000 + index)));
  return server;
}

// Every local event is synced exactly when the server stored it, and none is held.
function expectSyncedMatchesServer(device: Device, server: FakeSyncServer, localIds: string[]): void {
  const stored = server.storedIds();
  for (const id of localIds) {
    const entry = device.log.find(({ eventId }) => eventId === id);
    expect(entry).toMatchObject({ isHeld: false, isSynced: stored.has(id) });
  }
  expect(device.heldIds).toEqual([]);
}

describe('runSyncPass splits a batch the stored-event cap refuses', () => {
  it('uploads in halves every event that fits under the cap, marks them synced, and reports the cap only after a 1-event batch is refused', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(5, userId);
    const device = createDevice(userId, log);
    const server = createSeededServer(0, 3);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false, isUploadCapReached: true });
    const stored = server.storedIds();
    expect(stored.size).toBe(3);
    for (const id of stored) expect(idsOf(log)).toContain(id);
    expectSyncedMatchesServer(device, server, idsOf(log));
    const posts = server.postRequests();
    for (const post of posts) expect(postedIds(post).length).toBeLessThanOrEqual(MAX_BATCH);
    const lastPosted = postedIds(posts[posts.length - 1]);
    expect(lastPosted).toHaveLength(1);
    expect(stored.has(lastPosted[0])).toBe(false);
    expect(server.getRequests().length).toBeGreaterThanOrEqual(1);
  });

  it('uploads a final 1-event batch that fits under the cap and marks that event synced', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(3, userId);
    const device = createDevice(userId, log);
    const server = createSeededServer(4, 5);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false, isUploadCapReached: true });
    const localStored = idsOf(log).filter((id) => server.storedIds().has(id));
    expect(localStored).toHaveLength(1);
    // The pass still downloads, so the seeded remote events also land synced; compare local ids only.
    const localIds = new Set(idsOf(log));
    const syncedLocal = device.log.filter(({ eventId, isSynced }) => isSynced && localIds.has(eventId));
    expect(syncedLocal.map(({ eventId }) => eventId)).toEqual(localStored);
    expectSyncedMatchesServer(device, server, idsOf(log));
  });

  it('resolves isOk true with no cap flag when the halves of a refused batch all fit', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(MAX_BATCH, userId);
    const device = createDevice(userId, log);
    const capReached = buildErrorResponse(SERVER_ERROR_CODES.EVENT_CAP_REACHED);
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 1 ? capReached : undefined) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect([...server.storedIds()].sort()).toEqual(idsOf(log).sort());
    for (const entry of device.log) expect(entry).toMatchObject({ isHeld: false, isSynced: true });
    const posts = server.postRequests();
    expect(postedIds(posts[0])).toEqual(idsOf(log));
    for (const post of posts.slice(1)) expect(postedIds(post).length).toBeLessThan(MAX_BATCH);
  });

  it('posts a single unsynced event once, syncs nothing, and reports the cap when that 1-event batch is refused', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(1, userId);
    const device = createDevice(userId, log);
    const server = createSeededServer(2, 2);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false, isUploadCapReached: true });
    expect(server.postRequests().map(postedIds)).toEqual([idsOf(log)]);
    expect(server.storedIds().has(log[0].eventId)).toBe(false);
    expect(device.log[0]).toMatchObject({ isHeld: false, isSynced: false });
  });
});
