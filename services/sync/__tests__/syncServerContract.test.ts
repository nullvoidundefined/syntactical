// PR #33 review fix 2 (B-32, B-36): runSyncPass against the fake server whose
// every response copies the real one (server/src/routes/answerEvents.ts). The
// body checks pin the fake to the server's envelope, so a client test can no
// longer pass on a body the server never sends.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer, hasOnlyAnswerEventKeys } from './fakeSyncServer';
import type { FakeRequestInit, FakeResponse, FakeSyncServer } from './fakeSyncServer';
import { CODES_WITH_EVENT_IDS, SERVER_ERROR_CODES, SERVER_STATUS } from './syncServerResponses';
import type { ServerErrorCode } from './syncServerResponses';

type Exchange = { method: string; path: string; response: FakeResponse };

function createDevice(userId: string, initialLog: LoggedAnswerEvent[], syncCursor: string | null = null) {
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

type Device = ReturnType<typeof createDevice>;

// Runs one pass and records every response the fake sent back.
async function runRecordedPass(device: Device, server: FakeSyncServer) {
  const exchanges: Exchange[] = [];
  async function request(path: string, init: FakeRequestInit = {}): Promise<FakeResponse> {
    const response = await server.request(path, init);
    exchanges.push({ method: init.method ?? 'GET', path, response });
    return response;
  }
  const result = await runSyncPass({
    eventLog: device.log,
    isCurrent: () => true,
    markHeld: device.markHeld,
    markSynced: device.markSynced,
    mergeDownloaded: device.mergeDownloaded,
    request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
  return { exchanges, result };
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

function postsOf(exchanges: Exchange[]): Exchange[] {
  return exchanges.filter(({ method }) => method === 'POST');
}

function getsOf(exchanges: Exchange[]): Exchange[] {
  return exchanges.filter(({ method }) => method === 'GET');
}

// The server's error envelope: exactly code, message, requestId, plus
// eventIds for the two codes that name events.
function expectErrorEnvelope(response: FakeResponse, status: number, code: ServerErrorCode, eventIds?: string[]): void {
  expect(response.status).toBe(status);
  const { error } = response.body as { error: Record<string, unknown> };
  const expectedKeys = CODES_WITH_EVENT_IDS.includes(code)
    ? ['code', 'eventIds', 'message', 'requestId']
    : ['code', 'message', 'requestId'];
  expect(Object.keys(response.body as object)).toEqual(['error']);
  expect(Object.keys(error).sort()).toEqual(expectedKeys);
  expect(error.code).toBe(code);
  expect(typeof error.message).toBe('string');
  expect(typeof error.requestId).toBe('string');
  if (eventIds) expect([...(error.eventIds as string[])].sort()).toEqual([...eventIds].sort());
}

describe('sync server contract: upload success', () => {
  it('answers a stored batch with 200 and the totals body, and the pass marks the batch synced', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(5, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer();

    const { exchanges, result } = await runRecordedPass(device, server);

    const [post] = postsOf(exchanges);
    expect(post.response.status).toBe(SERVER_STATUS.OK);
    const { data } = post.response.body as { data: Record<string, unknown> };
    expect(Object.keys(post.response.body as object)).toEqual(['data']);
    expect(Object.keys(data).sort()).toEqual(['dailyProgress', 'dayStreak', 'insertedCount', 'xpToday', 'xpTotal']);
    expect(data.insertedCount).toBe(5);
    expect(Array.isArray(data.dailyProgress)).toBe(true);
    expect(result).toEqual({ isOk: true });
    expect(device.syncedCalls).toEqual([idsOf(log)]);
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
  });

  it('answers a re-posted batch with insertedCount 0, and the pass still marks it synced', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(5, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer();
    server.seed(log);

    const { exchanges, result } = await runRecordedPass(device, server);

    const [post] = postsOf(exchanges);
    expect((post.response.body as { data: { insertedCount: number } }).data.insertedCount).toBe(0);
    expect(result).toEqual({ isOk: true });
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
    expect(server.storedEvents()).toHaveLength(5);
  });

  it('marks nothing synced when a 200 arrives with no data', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    const server = createFakeSyncServer({ onPost: () => ({ status: SERVER_STATUS.OK, body: {} }) });

    const { result } = await runRecordedPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls).toEqual([]);
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
  });
});

describe('sync server contract: upload rejections', () => {
  it.each([
    ['rejectedEventIds', SERVER_ERROR_CODES.INVALID_EVENTS],
    ['outOfRangeEventIds', SERVER_ERROR_CODES.TIMESTAMP_OUT_OF_RANGE],
  ] as const)('answers %s with 422 %s naming the events; the pass holds them and syncs the rest', async (option, code) => {
    const userId = randomUUID();
    const log = buildOwnedLog(6, userId);
    const device = createDevice(userId, log);
    const named = [log[1].eventId, log[4].eventId];
    const server = createFakeSyncServer({ [option]: new Set(named) });

    const { exchanges, result } = await runRecordedPass(device, server);

    const [rejection] = postsOf(exchanges);
    expectErrorEnvelope(rejection.response, SERVER_STATUS.UNPROCESSABLE, code, named);
    expect(device.heldCalls.flat().sort()).toEqual([...named].sort());
    expect(result).toEqual({ isOk: true });
    expect(device.syncedCalls.flat()).toEqual(idsOf(log).filter((id) => !named.includes(id)));
    expect([...server.storedIds()].sort()).toEqual(idsOf(log).filter((id) => !named.includes(id)).sort());
  });

  it('answers a batch past the stored-event cap with 422 SYNC_EVENT_CAP_REACHED and no eventIds; the pass holds and syncs nothing', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    const server = createFakeSyncServer({ maxStoredEvents: 3 });

    const { exchanges, result } = await runRecordedPass(device, server);

    const [rejection] = postsOf(exchanges);
    expectErrorEnvelope(rejection.response, SERVER_STATUS.UNPROCESSABLE, SERVER_ERROR_CODES.EVENT_CAP_REACHED);
    expect(result).toEqual({ isOk: false, isUploadCapReached: true });
    expect(device.heldCalls).toEqual([]);
    expect(device.syncedCalls).toEqual([]);
    expect(server.storedEvents()).toEqual([]);
  });

  it('answers a post past the rate limit with 429 RATE_LIMIT_EXCEEDED; the pass keeps the first batch synced and the second unsynced', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(250, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ uploadLimit: 1 });

    const { exchanges, result } = await runRecordedPass(device, server);

    const [, limited] = postsOf(exchanges);
    expectErrorEnvelope(limited.response, SERVER_STATUS.TOO_MANY_REQUESTS, SERVER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls.flat()).toEqual(idsOf(log.slice(0, 200)));
    expect(device.log.slice(200).some(({ isSynced }) => isSynced)).toBe(false);
  });

  it('answers more than 200 events with 413 INPUT_PAYLOAD_TOO_LARGE and stores none', async () => {
    const server = createFakeSyncServer();
    const events = Array.from({ length: 201 }, (_unused, index) => buildAnswerEvent(index));

    const response = await server.request('answer-events', { body: { events }, method: 'POST' });

    expectErrorEnvelope(response, SERVER_STATUS.PAYLOAD_TOO_LARGE, SERVER_ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(server.storedEvents()).toEqual([]);
  });

  it.each([
    ['an empty events array', { events: [] }],
    ['no events field', {}],
    ['an event missing its eventId', { events: [{ ...buildAnswerEvent(0), eventId: undefined }] }],
    ['an event with an unknown roundKind', { events: [{ ...buildAnswerEvent(0), roundKind: 'quiz' }] }],
  ])('answers %s with 400 INPUT_INVALID_BODY and stores none', async (_label, body) => {
    const server = createFakeSyncServer();

    const response = await server.request('answer-events', { body, method: 'POST' });

    expectErrorEnvelope(response, SERVER_STATUS.BAD_REQUEST, SERVER_ERROR_CODES.INVALID_BODY);
    expect(server.storedEvents()).toEqual([]);
  });
});

describe('sync server contract: download', () => {
  it('pages with the server field set per event and a null nextCursor on the last page; the pass merges every page', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 3 });
    const seeded = Array.from({ length: 5 }, (_unused, index) => buildAnswerEvent(index));
    server.seed(seeded);
    const device = createDevice(userId, []);

    const { exchanges, result } = await runRecordedPass(device, server);

    const pages = getsOf(exchanges).map(({ response }) => response);
    expect(pages.map(({ status }) => status)).toEqual([SERVER_STATUS.OK, SERVER_STATUS.OK]);
    const bodies = pages.map(({ body }) => body as { data: { events: object[]; nextCursor: string | null } });
    for (const body of bodies) {
      expect(Object.keys(body)).toEqual(['data']);
      expect(Object.keys(body.data).sort()).toEqual(['events', 'nextCursor']);
      for (const event of body.data.events) expect(hasOnlyAnswerEventKeys(event)).toBe(true);
    }
    expect(bodies[0].data.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(bodies[1].data.nextCursor).toBeNull();
    expect(result).toEqual({ isOk: true });
    expect(new Set(idsOf(device.log))).toEqual(new Set(idsOf(seeded)));
    expect(device.syncCursor).toBe(bodies[0].data.nextCursor);
  });

  it('answers a malformed cursor with 400 INPUT_INVALID_QUERY; the pass merges nothing and keeps its cursor', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer();
    server.seed([buildAnswerEvent(0)]);
    const device = createDevice(userId, [], 'not a cursor!');

    const { exchanges, result } = await runRecordedPass(device, server);

    const [get] = getsOf(exchanges);
    expectErrorEnvelope(get.response, SERVER_STATUS.BAD_REQUEST, SERVER_ERROR_CODES.INVALID_QUERY);
    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
    expect(device.syncCursor).toBe('not a cursor!');
  });

  it('answers a download past the rate limit with 429 RATE_LIMIT_EXCEEDED; the pass reports failure', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ downloadLimit: 0 });
    const device = createDevice(userId, []);

    const { exchanges, result } = await runRecordedPass(device, server);

    const [get] = getsOf(exchanges);
    expectErrorEnvelope(get.response, SERVER_STATUS.TOO_MANY_REQUESTS, SERVER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
  });
});
