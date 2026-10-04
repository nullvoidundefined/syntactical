import { randomUUID } from 'node:crypto';

import { computeXp } from '@syntactical/progress';
import type { AnswerEvent } from '@syntactical/progress';

import { ApiUnavailable } from '../../../clients/ApiUnavailable';
import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import {
  buildAnswerEvent,
  buildOwnedLog,
  createFakeSyncServer,
  hasOnlyAnswerEventKeys,
  toLogged,
} from './fakeSyncServer';
import type { FakeSyncServer } from './fakeSyncServer';
import { buildFailure, buildRejectedEvents, SERVER_ERROR_CODES } from './syncServerResponses';

// One device: its event log and stored sync cursor, with the callbacks
// runSyncPass expects wired to mutate them the way StatsProvider would.
function createFakeDevice(userId: string, initialLog: LoggedAnswerEvent[], syncCursor: string | null = null) {
  const device = {
    heldCalls: [] as string[][],
    log: initialLog,
    mergeCalls: [] as { cursor: string | null; eventIds: string[] }[],
    syncCursor,
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

type FakeDevice = ReturnType<typeof createFakeDevice>;

// Runs one pass for the device; records any event marked synced before the
// server had stored it.
function runDevicePass(device: FakeDevice, server: FakeSyncServer, markedEarly: string[] = []) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markSynced: (ids: string[]) => {
      const storedIds = server.storedIds();
      markedEarly.push(...ids.filter((id) => !storedIds.has(id)));
      device.markSynced(ids);
    },
    mergeDownloaded: device.mergeDownloaded,
    request: server.request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
}

function postedIds(post: { body: unknown }): string[] {
  return (post.body as { events: AnswerEvent[] }).events.map(({ eventId }) => eventId);
}

function serverError(status: number) {
  return buildFailure(status);
}

function ownedEntries(device: FakeDevice): LoggedAnswerEvent[] {
  return device.log.filter(({ ownerUserId }) => ownerUserId === device.userId);
}

function totalXp(events: AnswerEvent[]): number {
  return events.reduce((sum, event) => sum + computeXp(event, false), 0);
}

describe('runSyncPass uploads', () => {
  it('uploads a 1,000-event log as five POSTs of at most 200 and marks each batch synced only after its 2xx', async () => {
    const userId = randomUUID();
    const device = createFakeDevice(userId, buildOwnedLog(1000, userId));
    const server = createFakeSyncServer();
    const markedEarly: string[] = [];

    const result = await runDevicePass(device, server, markedEarly);

    expect(result).toEqual({ isOk: true });
    const posts = server.postRequests();
    expect(posts).toHaveLength(5);
    for (const post of posts) {
      const { events } = post.body as { events: AnswerEvent[] };
      expect(events.length).toBeLessThanOrEqual(200);
      for (const event of events) expect(hasOnlyAnswerEventKeys(event)).toBe(true);
    }
    expect(posts.flatMap(postedIds)).toEqual(device.log.map(({ eventId }) => eventId));
    expect(markedEarly).toEqual([]);
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
    expect(server.storedEvents()).toHaveLength(1000);
  });

  it('never uploads events owned by another user or by a guest', async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const own = buildOwnedLog(5, userId);
    const foreign = [...buildOwnedLog(5, otherUserId, 5), ...buildOwnedLog(5, null, 10)];
    const device = createFakeDevice(userId, [...foreign.slice(0, 5), ...own, ...foreign.slice(5)]);
    const server = createFakeSyncServer();

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: true });
    const stored = server.storedIds();
    expect(stored).toEqual(new Set(own.map(({ eventId }) => eventId)));
    for (const entry of foreign) {
      expect(device.log.find(({ eventId }) => eventId === entry.eventId)?.isSynced).toBe(false);
    }
  });

  it('stops on a 500 without marking that batch, and a later pass uploads the rest', async () => {
    const userId = randomUUID();
    const device = createFakeDevice(userId, buildOwnedLog(600, userId));
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 2 ? serverError(500) : undefined) });
    const firstBatchIds = device.log.slice(0, 200).map(({ eventId }) => eventId);

    const first = await runDevicePass(device, server);

    expect(first).toEqual({ isOk: false });
    expect(device.syncedCalls.flat()).toEqual(firstBatchIds);
    expect(server.postRequests()).toHaveLength(2);
    // The download still runs after the failed batch (B-36 hardening).
    expect(device.mergeCalls.map(({ eventIds }) => eventIds)).toEqual([firstBatchIds]);

    const second = await runDevicePass(device, server);

    expect(second).toEqual({ isOk: true });
    expect(server.storedEvents()).toHaveLength(600);
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
  });

  it('returns isOk false and marks nothing when the request throws ApiUnavailable', async () => {
    const userId = randomUUID();
    const device = createFakeDevice(userId, buildOwnedLog(50, userId));
    const server = createFakeSyncServer({ onPost: () => 'throw' });

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls.flat()).toEqual([]);
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
    expect(device.mergeCalls).toEqual([]);
  });

  it('retries the same event ids after a dropped response and the server stores each event once', async () => {
    const userId = randomUUID();
    const device = createFakeDevice(userId, buildOwnedLog(150, userId));
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 1 ? 'store-then-throw' : undefined) });

    const first = await runDevicePass(device, server);

    expect(first).toEqual({ isOk: false });
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
    expect(server.storedEvents()).toHaveLength(150);

    const second = await runDevicePass(device, server);

    expect(second).toEqual({ isOk: true });
    const [firstPost, retryPost] = server.postRequests();
    expect(postedIds(retryPost)).toEqual(postedIds(firstPost));
    expect(server.storedEvents()).toHaveLength(150);
    expect(totalXp(server.storedEvents())).toBe(totalXp(device.log));
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
  });

  it('holds exactly the events a 422 names, re-posts the rest of that batch, and continues', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const rejectedIds = [log[3].eventId, log[7].eventId];
    const device = createFakeDevice(userId, log);
    const server = createFakeSyncServer({ rejectedEventIds: new Set(rejectedIds) });

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.heldCalls.flat().sort()).toEqual([...rejectedIds].sort());
    const posts = server.postRequests();
    expect(posts).toHaveLength(3);
    expect(postedIds(posts[1])).toEqual(log.slice(0, 200).map(({ eventId }) => eventId).filter((id) => !rejectedIds.includes(id)));
    expect(postedIds(posts[2])).toEqual(log.slice(200).map(({ eventId }) => eventId));
    const stored = server.storedIds();
    expect(stored.size).toBe(248);
    for (const entry of device.log) {
      const isRejected = rejectedIds.includes(entry.eventId);
      expect(entry.isHeld).toBe(isRejected);
      expect(entry.isSynced).toBe(!isRejected);
      expect(stored.has(entry.eventId)).toBe(!isRejected);
    }
  });

  it('stops with isOk false and holds nothing when a 422 SYNC_INVALID_EVENTS names no event ids', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const device = createFakeDevice(userId, log);
    const namingNothing = buildRejectedEvents(SERVER_ERROR_CODES.INVALID_EVENTS, []);
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 1 ? namingNothing : undefined) });

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.heldCalls).toEqual([]);
    expect(device.syncedCalls).toEqual([]);
    expect(server.postRequests()).toHaveLength(1);
    expect(server.getRequests()).toHaveLength(1);
    expect(server.storedIds().size).toBe(0);
    expect(device.log.every(({ isHeld, isSynced }) => !isHeld && !isSynced)).toBe(true);
  });
});

describe('runSyncPass downloads', () => {
  it('pages from the start until nextCursor is null, storing the last non-null cursor with each page', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 500 });
    const seeded = Array.from({ length: 1100 }, (_unused, index) => buildAnswerEvent(index));
    server.seed(seeded);
    const firstCursor = server.issueCursor(500);
    const secondCursor = server.issueCursor(1000);
    const device = createFakeDevice(userId, []);

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(server.getRequests().map(({ path }) => path)).toEqual([
      'answer-events',
      `answer-events?after=${encodeURIComponent(firstCursor)}`,
      `answer-events?after=${encodeURIComponent(secondCursor)}`,
    ]);
    expect(device.mergeCalls.map(({ cursor, eventIds }) => [cursor, eventIds.length])).toEqual([
      [firstCursor, 500],
      [secondCursor, 500],
      [secondCursor, 100],
    ]);
    expect(device.syncCursor).toBe(secondCursor);
    expect(new Set(device.log.map(({ eventId }) => eventId))).toEqual(new Set(seeded.map(({ eventId }) => eventId)));
    expect(device.log.every(({ isSynced, ownerUserId }) => isSynced && ownerUserId === userId)).toBe(true);
  });

  it('resumes after the stored cursor, URL-encoded, and keeps it when the page is the last', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 500 });
    server.seed(Array.from({ length: 1100 }, (_unused, index) => buildAnswerEvent(index)));
    const storedCursor = server.issueCursor(1000);
    const device = createFakeDevice(userId, [], storedCursor);

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(server.getRequests().map(({ path }) => path)).toEqual([`answer-events?after=${encodeURIComponent(storedCursor)}`]);
    expect(device.mergeCalls.map(({ cursor, eventIds }) => [cursor, eventIds.length])).toEqual([[storedCursor, 100]]);
  });

  it('passes a null cursor when the only page came from the start', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer();
    server.seed([buildAnswerEvent(0), buildAnswerEvent(1), buildAnswerEvent(2)]);
    const device = createFakeDevice(userId, []);

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.mergeCalls.map(({ cursor, eventIds }) => [cursor, eventIds.length])).toEqual([[null, 3]]);
  });

  it.each([
    ['no events array', { data: { nextCursor: null } }],
    ['events not an array', { data: { events: 'none', nextCursor: null } }],
    ['no data', { events: [], nextCursor: null }],
    ['a null body', null],
  ])('stops with isOk false and merges nothing for a page with %s', async (_label, body) => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ onGet: () => ({ status: 200, body }) });
    const device = createFakeDevice(userId, []);

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
    expect(device.syncCursor).toBeNull();
  });

  it('stops with isOk false on a non-2xx page and does not merge it', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({
      onGet: (_path, getNumber) => (getNumber === 2 ? serverError(500) : undefined),
      pageSize: 500,
    });
    server.seed(Array.from({ length: 600 }, (_unused, index) => buildAnswerEvent(index)));
    const firstCursor = server.issueCursor(500);
    const device = createFakeDevice(userId, []);

    const result = await runDevicePass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls.map(({ cursor, eventIds }) => [cursor, eventIds.length])).toEqual([[firstCursor, 500]]);
    expect(server.getRequests()).toHaveLength(2);
  });

  it('returns isOk false when a download request throws ApiUnavailable', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer();
    const device = createFakeDevice(userId, []);
    const request = async (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
      if ((init?.method ?? 'GET') === 'GET') throw new ApiUnavailable('network failed');
      return server.request(path, init);
    };

    const result = await runSyncPass({
      eventLog: device.log,
      isCurrent: () => true,
      markHeld: device.markHeld,
      markSynced: device.markSynced,
      mergeDownloaded: device.mergeDownloaded,
      request,
      syncCursor: null,
      userId,
    });

    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
  });
});

describe('runSyncPass convergence across two devices (Review Focus 1)', () => {
  it('two devices with overlapping logs syncing concurrently end with the same events and the same XP as the server', async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const shared = Array.from({ length: 300 }, (_unused, index) => buildAnswerEvent(index));
    const onlyOnB = Array.from({ length: 150 }, (_unused, index) => buildAnswerEvent(300 + index));
    const foreignOnA = buildOwnedLog(20, otherUserId, 1000);
    const deviceA = createFakeDevice(userId, [...shared.map((event) => toLogged(event, userId)), ...foreignOnA]);
    const deviceB = createFakeDevice(userId, [
      ...shared.slice(200).map((event) => toLogged(event, userId)),
      ...onlyOnB.map((event) => toLogged(event, userId)),
    ]);
    const server = createFakeSyncServer({ pageSize: 100 });

    const [firstA, firstB] = await Promise.all([runDevicePass(deviceA, server), runDevicePass(deviceB, server)]);
    const secondA = await runDevicePass(deviceA, server);
    const secondB = await runDevicePass(deviceB, server);

    expect([firstA, firstB, secondA, secondB]).toEqual([{ isOk: true }, { isOk: true }, { isOk: true }, { isOk: true }]);

    const serverEvents = server.storedEvents();
    const expectedIds = new Set([...shared, ...onlyOnB].map(({ eventId }) => eventId));
    expect(serverEvents).toHaveLength(450);
    expect(server.storedIds()).toEqual(expectedIds);

    for (const device of [deviceA, deviceB]) {
      const owned = ownedEntries(device);
      expect(owned).toHaveLength(450);
      expect(new Set(owned.map(({ eventId }) => eventId))).toEqual(expectedIds);
      expect(owned.every(({ isSynced, isHeld }) => isSynced && !isHeld)).toBe(true);
    }

    const serverXp = totalXp(serverEvents);
    expect(totalXp(ownedEntries(deviceA))).toBe(serverXp);
    expect(totalXp(ownedEntries(deviceB))).toBe(serverXp);
    expect(serverXp).toBeGreaterThan(0);
  });
});
