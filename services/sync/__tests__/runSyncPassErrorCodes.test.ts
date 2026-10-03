// PR #33 review fix 4 (B-36): runSyncPass branches on the server's error.code.
// 422 SYNC_INVALID_EVENTS and 422 SYNC_TIMESTAMP_OUT_OF_RANGE hold exactly the
// named ids, re-post the rest, and continue; 400 INPUT_INVALID_BODY and 413
// INPUT_PAYLOAD_TOO_LARGE hold the whole batch and continue with later
// batches; 422 SYNC_EVENT_CAP_REACHED stops uploading, still downloads, and
// resolves { isOk: false, isUploadCapReached: true }. Each held event records
// why (heldReason), and a held batch is never posted on a later pass.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import { isLoggedAnswerEvent } from '../../stats/isLoggedAnswerEvent';
import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, toLogged } from './fakeSyncServer';
import type { FakeSyncServer } from './fakeSyncServer';
import { buildErrorResponse, SERVER_ERROR_CODES } from './syncServerResponses';

type HeldReason = NonNullable<LoggedAnswerEvent['heldReason']>;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// The device clock for every pass in this file.
const NOW = new Date(Date.UTC(2026, 9, 2, 12));

// One device whose callbacks mutate its log the way StatsProvider would.
function createDevice(userId: string, initialLog: LoggedAnswerEvent[]) {
  const device = {
    heldCalls: [] as { ids: string[]; reason: HeldReason }[],
    log: initialLog,
    mergedIds: [] as string[],
    syncCursor: null as string | null,
    userId,
    markHeld(ids: string[], reason: HeldReason): void {
      device.heldCalls.push({ ids: [...ids], reason });
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, heldReason: reason, isHeld: true } : entry));
    },
    markSynced(ids: string[]): void {
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    mergeDownloaded(events: AnswerEvent[], cursor: string | null): void {
      device.mergedIds.push(...events.map(({ eventId }) => eventId));
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
    markReleased: () => undefined,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    now: () => NOW,
    request: server.request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

function postedIds(post: { body: unknown }): string[] {
  return (post.body as { events: AnswerEvent[] }).events.map(({ eventId }) => eventId);
}

function entryOf(device: Device, eventId: string): LoggedAnswerEvent | undefined {
  return device.log.find((entry) => entry.eventId === eventId);
}

// Adds fresh unsynced events to the device and returns their ids.
function appendFresh(device: Device, count: number, startIndex: number): string[] {
  const fresh = buildOwnedLog(count, device.userId, startIndex);
  device.log = [...device.log, ...fresh];
  return idsOf(fresh);
}

// Runs a second pass after new answers and checks that it posts only the new
// events: nothing held is posted again, and later work still goes.
async function expectNextPassPostsOnly(device: Device, server: FakeSyncServer, heldIds: string[]): Promise<void> {
  const before = server.postRequests().length;
  const freshIds = appendFresh(device, 3, 5000);

  await runPass(device, server);

  const laterPosts = server.postRequests().slice(before);
  expect(laterPosts.flatMap(postedIds)).toEqual(freshIds);
  for (const id of freshIds) expect(entryOf(device, id)?.isSynced).toBe(true);
  for (const id of heldIds) {
    expect(entryOf(device, id)).toMatchObject({ isHeld: true, isSynced: false });
    expect(server.storedIds().has(id)).toBe(false);
  }
}

function withAnsweredAt(index: number, userId: string, answeredAtMs: number): LoggedAnswerEvent {
  return toLogged({ ...buildAnswerEvent(index), answeredAt: new Date(answeredAtMs).toISOString() }, userId);
}

describe('runSyncPass holds the events a 422 names, by error code', () => {
  it('holds exactly the ids a 422 SYNC_INVALID_EVENTS names with heldReason invalid-events, re-posts the rest, and continues', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const rejectedIds = [log[3].eventId, log[210].eventId];
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ rejectedEventIds: new Set(rejectedIds) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    const posts = server.postRequests();
    expect(posts).toHaveLength(4);
    expect(postedIds(posts[1])).toEqual(idsOf(log.slice(0, 200)).filter((id) => id !== rejectedIds[0]));
    expect(postedIds(posts[3])).toEqual(idsOf(log.slice(200)).filter((id) => id !== rejectedIds[1]));
    expect(device.heldCalls.flatMap(({ ids }) => ids).sort()).toEqual([...rejectedIds].sort());
    for (const entry of device.log) {
      const isRejected = rejectedIds.includes(entry.eventId);
      expect(entry.isHeld).toBe(isRejected);
      expect(entry.isSynced).toBe(!isRejected);
      expect(entry.heldReason).toBe(isRejected ? 'invalid-events' : undefined);
    }
    expect(server.storedIds().size).toBe(248);

    await expectNextPassPostsOnly(device, server, rejectedIds);
  });

  it('holds exactly the ids a 422 SYNC_TIMESTAMP_OUT_OF_RANGE names, as timestamp-future when more than 5 minutes ahead of the device clock and timestamp-past otherwise', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const nowMs = NOW.getTime();
    log[3] = withAnsweredAt(3, userId, nowMs + 10 * MINUTE_MS);
    log[5] = withAnsweredAt(5, userId, nowMs + 5 * MINUTE_MS);
    log[7] = withAnsweredAt(7, userId, nowMs + 5 * MINUTE_MS + 1000);
    log[210] = withAnsweredAt(210, userId, nowMs - 400 * DAY_MS);
    const expectedReasons = new Map<string, HeldReason>([
      [log[3].eventId, 'timestamp-future'],
      [log[5].eventId, 'timestamp-past'],
      [log[7].eventId, 'timestamp-future'],
      [log[210].eventId, 'timestamp-past'],
    ]);
    const rejectedIds = [...expectedReasons.keys()];
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ outOfRangeEventIds: new Set(rejectedIds) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    const posts = server.postRequests();
    expect(posts).toHaveLength(4);
    expect(postedIds(posts[1])).toEqual(idsOf(log.slice(0, 200)).filter((id) => !expectedReasons.has(id)));
    expect(postedIds(posts[3])).toEqual(idsOf(log.slice(200)).filter((id) => !expectedReasons.has(id)));
    for (const entry of device.log) {
      const reason = expectedReasons.get(entry.eventId);
      expect(entry.isHeld).toBe(reason !== undefined);
      expect(entry.isSynced).toBe(reason === undefined);
      expect(entry.heldReason).toBe(reason);
    }
    for (const { ids, reason } of device.heldCalls) {
      for (const id of ids) expect(expectedReasons.get(id)).toBe(reason);
    }

    await expectNextPassPostsOnly(device, server, rejectedIds);
  });
});

describe('runSyncPass holds a whole batch the server refuses as a body error', () => {
  it.each([
    ['400 INPUT_INVALID_BODY', SERVER_ERROR_CODES.INVALID_BODY],
    ['413 INPUT_PAYLOAD_TOO_LARGE', SERVER_ERROR_CODES.PAYLOAD_TOO_LARGE],
  ] as const)('holds the batch answered %s with heldReason invalid-batch, never re-posts it, and still uploads later batches', async (_label, code) => {
    const userId = randomUUID();
    const log = buildOwnedLog(450, userId);
    const device = createDevice(userId, log);
    const refused = buildErrorResponse(code);
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 2 ? refused : undefined) });
    const refusedIds = idsOf(log.slice(200, 400));

    const result = await runPass(device, server);

    expect(result.isUploadCapReached).not.toBe(true);
    const posts = server.postRequests();
    expect(posts.map(postedIds)).toEqual([idsOf(log.slice(0, 200)), refusedIds, idsOf(log.slice(400))]);
    expect(device.heldCalls.flatMap(({ ids }) => ids).sort()).toEqual([...refusedIds].sort());
    const refusedSet = new Set(refusedIds);
    for (const entry of device.log) {
      const isRefused = refusedSet.has(entry.eventId);
      expect(entry.isHeld).toBe(isRefused);
      expect(entry.isSynced).toBe(!isRefused);
      expect(entry.heldReason).toBe(isRefused ? 'invalid-batch' : undefined);
    }
    expect(server.storedIds().size).toBe(250);
    expect(server.getRequests()).toHaveLength(1);

    await expectNextPassPostsOnly(device, server, refusedIds);
  });
});

describe('runSyncPass stops uploading at the stored-event cap', () => {
  it('posts no later batch after 422 SYNC_EVENT_CAP_REACHED, still downloads, holds nothing, and resolves isUploadCapReached true', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(600, userId);
    const device = createDevice(userId, log);
    const remote = Array.from({ length: 4 }, (_unused, index) => buildAnswerEvent(9000 + index));
    const server = createFakeSyncServer({ maxStoredEvents: 300 });
    server.seed(remote);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false, isUploadCapReached: true });
    expect(server.postRequests().map(postedIds)).toEqual([idsOf(log.slice(0, 200)), idsOf(log.slice(200, 400))]);
    expect(server.getRequests()).toHaveLength(1);
    for (const id of idsOf(remote)) expect(device.mergedIds).toContain(id);
    expect(device.heldCalls).toEqual([]);
    for (const entry of log.slice(200)) {
      expect(entryOf(device, entry.eventId)).toMatchObject({ isHeld: false, isSynced: false });
    }
    for (const entry of log.slice(0, 200)) expect(entryOf(device, entry.eventId)?.isSynced).toBe(true);
  });

  it('leaves isUploadCapReached unset on a pass the cap never stops', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    const server = createFakeSyncServer();

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(server.storedIds().size).toBe(5);
  });
});

describe('isLoggedAnswerEvent with heldReason', () => {
  it('loads a stored entry that has no heldReason', () => {
    const entry = toLogged(buildAnswerEvent(1), randomUUID(), { isHeld: true });
    expect(isLoggedAnswerEvent(JSON.parse(JSON.stringify(entry)))).toBe(true);
  });

  it.each(['invalid-events', 'timestamp-future', 'timestamp-past', 'invalid-batch'] as const)(
    'loads a stored held entry whose heldReason is %s',
    (heldReason) => {
      const entry = { ...toLogged(buildAnswerEvent(1), randomUUID(), { isHeld: true }), heldReason };
      expect(isLoggedAnswerEvent(JSON.parse(JSON.stringify(entry)))).toBe(true);
    },
  );
});
