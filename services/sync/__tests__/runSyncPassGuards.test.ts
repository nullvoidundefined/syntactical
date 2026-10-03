import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeResponse, FakeSyncServer } from './fakeSyncServer';

// The spec's per-pass page limit (SYNC_MAX_PAGES_PER_PASS in constants/appConfig.ts).
const MAX_PAGES_PER_PASS = 100;

type Callback = (ids: string[]) => void | Promise<void>;
type MergeCallback = (events: AnswerEvent[], cursor: string | null) => void | Promise<void>;

// One device whose callbacks mutate its log the way StatsProvider would.
// Each callback can be wrapped to return a Promise, reject, or throw.
function createDevice(userId: string, initialLog: LoggedAnswerEvent[], syncCursor: string | null = null) {
  const device = {
    heldCalls: [] as string[][],
    log: initialLog,
    mergeCalls: [] as { cursor: string | null; eventIds: string[] }[],
    syncCursor,
    syncedCalls: [] as string[][],
    userId,
    applyHeld(ids: string[]): void {
      device.heldCalls.push([...ids]);
      const held = new Set(ids);
      device.log = device.log.map((entry) => (held.has(entry.eventId) ? { ...entry, isHeld: true } : entry));
    },
    applySynced(ids: string[]): void {
      device.syncedCalls.push([...ids]);
      const synced = new Set(ids);
      device.log = device.log.map((entry) => (synced.has(entry.eventId) ? { ...entry, isSynced: true } : entry));
    },
    applyMerge(events: AnswerEvent[], cursor: string | null): void {
      device.mergeCalls.push({ cursor, eventIds: events.map(({ eventId }) => eventId) });
      device.log = mergeDownloadedEvents(device.log, events, userId);
      device.syncCursor = cursor;
    },
  };
  return device;
}

type Device = ReturnType<typeof createDevice>;

type PassOverrides = {
  isCurrent?: () => boolean;
  markHeld?: Callback;
  markSynced?: Callback;
  mergeDownloaded?: MergeCallback;
  request?: FakeSyncServer['request'];
};

function runPass(device: Device, server: FakeSyncServer, overrides: PassOverrides = {}) {
  return runSyncPass({
    eventLog: device.log,
    isCurrent: overrides.isCurrent ?? (() => true),
    markHeld: overrides.markHeld ?? device.applyHeld,
    markSynced: overrides.markSynced ?? device.applySynced,
    mergeDownloaded: overrides.mergeDownloaded ?? device.applyMerge,
    request: overrides.request ?? server.request,
    syncCursor: device.syncCursor,
    userId: device.userId,
  });
}

function idsOf(entries: { eventId: string }[]): string[] {
  return entries.map(({ eventId }) => eventId);
}

function postedIds(post: { body: unknown }): string[] {
  return idsOf((post.body as { events: AnswerEvent[] }).events);
}

function unprocessable(eventIds: unknown) {
  return {
    status: 422,
    body: { error: { code: 'EVENT_OUT_OF_BOUNDS', message: 'out of bounds', requestId: 'req', eventIds } },
  };
}

function serverError(status: number): FakeResponse {
  return { status, body: { error: { code: 'FAILED', message: 'failed', requestId: 'req' } } };
}

function page(events: AnswerEvent[], nextCursor: string | null): FakeResponse {
  return { status: 200, body: { data: { events, nextCursor } } };
}

// A rejected Promise already marked handled, so an implementation that does
// not await it fails on assertions rather than on an unhandled rejection.
function rejectedPromise(): Promise<void> {
  const promise = Promise.reject(new Error('storage write failed'));
  promise.catch(() => undefined);
  return promise;
}

function waitAMoment(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe('runSyncPass isCurrent guard', () => {
  it('uploads nothing at all when isCurrent is already false', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(10, userId));
    const server = createFakeSyncServer();

    const result = await runPass(device, server, { isCurrent: () => false });

    expect(result).toEqual({ isOk: false });
    expect(server.requests).toEqual([]);
    expect(device.syncedCalls).toEqual([]);
    expect(device.mergeCalls).toEqual([]);
  });

  it('posts no later batch once the user changes between two batches', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(400, userId));
    const server = createFakeSyncServer();
    let isCurrentUser = true;

    const result = await runPass(device, server, {
      isCurrent: () => isCurrentUser,
      markSynced: (ids) => {
        device.applySynced(ids);
        isCurrentUser = false;
      },
    });

    expect(result).toEqual({ isOk: false });
    expect(server.postRequests()).toHaveLength(1);
    expect(device.syncedCalls.flat()).toEqual(idsOf(device.log.slice(0, 200)));
    expect(server.getRequests()).toEqual([]);
    expect(device.mergeCalls).toEqual([]);
  });

  it('marks nothing synced when the user changes while the upload is in flight', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(50, userId));
    let isCurrentUser = true;
    const server = createFakeSyncServer({
      onPost: () => {
        isCurrentUser = false;
        return undefined;
      },
    });

    const result = await runPass(device, server, { isCurrent: () => isCurrentUser });

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls).toEqual([]);
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
    expect(server.getRequests()).toEqual([]);
  });

  it('holds nothing when the user changes while a 422 response is in flight', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(20, userId);
    const device = createDevice(userId, log);
    let isCurrentUser = true;
    const server = createFakeSyncServer({
      onPost: () => {
        isCurrentUser = false;
        return unprocessable([log[2].eventId]);
      },
    });

    const result = await runPass(device, server, { isCurrent: () => isCurrentUser });

    expect(result).toEqual({ isOk: false });
    expect(device.heldCalls).toEqual([]);
    expect(server.postRequests()).toHaveLength(1);
  });

  it('merges no page under the old user when the session changes during a download', async () => {
    const userId = randomUUID();
    let isCurrentUser = true;
    const server = createFakeSyncServer({
      onGet: () => {
        isCurrentUser = false;
        return undefined;
      },
    });
    server.seed([buildAnswerEvent(0), buildAnswerEvent(1)]);
    const device = createDevice(userId, []);

    const result = await runPass(device, server, { isCurrent: () => isCurrentUser });

    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
    expect(device.log).toEqual([]);
    expect(device.syncCursor).toBeNull();
  });

  it('requests no further page once the session changes after a page is merged', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 2 });
    server.seed(Array.from({ length: 5 }, (_unused, index) => buildAnswerEvent(index)));
    const device = createDevice(userId, []);
    let isCurrentUser = true;

    const result = await runPass(device, server, {
      isCurrent: () => isCurrentUser,
      mergeDownloaded: (events, cursor) => {
        device.applyMerge(events, cursor);
        isCurrentUser = false;
      },
    });

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests()).toHaveLength(1);
    expect(device.mergeCalls).toHaveLength(1);
  });
});

describe('runSyncPass 422 handling', () => {
  it.each([
    ['an empty eventIds array', []],
    ['only ids outside the posted batch', [randomUUID(), randomUUID()]],
    ['a non-array eventIds value', 'everything'],
  ])('stops with isOk false and holds nothing for a 422 naming %s', async (_label, eventIds) => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(250, userId));
    const server = createFakeSyncServer({ onPost: (_events, postNumber) => (postNumber === 1 ? unprocessable(eventIds) : undefined) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.heldCalls).toEqual([]);
    expect(device.syncedCalls).toEqual([]);
    expect(server.postRequests()).toHaveLength(1);
    expect(server.getRequests()).toHaveLength(1);
    expect(device.log.every(({ isHeld, isSynced }) => !isHeld && !isSynced)).toBe(true);
  });

  it('holds only the named ids inside the batch and ignores ids outside it', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(10, userId);
    const device = createDevice(userId, log);
    const foreignId = randomUUID();
    const server = createFakeSyncServer({
      onPost: (_events, postNumber) => (postNumber === 1 ? unprocessable([foreignId, log[4].eventId]) : undefined),
    });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.heldCalls.flat()).toEqual([log[4].eventId]);
    expect(postedIds(server.postRequests()[1])).toEqual(idsOf(log).filter((id) => id !== log[4].eventId));
    expect(server.storedIds().has(log[4].eventId)).toBe(false);
    expect(server.storedIds().size).toBe(9);
  });
});

describe('runSyncPass upload response shape', () => {
  it.each([
    ['a 200 with a null body', { status: 200, body: null }],
    ['a 204 with an empty body', { status: 204, body: null }],
    ['a 200 with no data', { status: 200, body: { inserted: 3 } }],
    ['a 200 with no inserted count', { status: 200, body: { data: {} } }],
    ['a 200 with a string inserted count', { status: 200, body: { data: { inserted: '3' } } }],
  ])('marks nothing synced and stops for %s', async (_label, response) => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(250, userId));
    const server = createFakeSyncServer({ onPost: () => response });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.syncedCalls).toEqual([]);
    expect(device.log.some(({ isSynced }) => isSynced)).toBe(false);
    expect(server.postRequests()).toHaveLength(1);
    expect(server.getRequests()).toEqual([]);
  });

  it('accepts a 2xx whose inserted count is zero (an idempotent re-post)', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(5, userId));
    const server = createFakeSyncServer({ onPost: () => ({ status: 200, body: { data: { inserted: 0 } } }) });

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.syncedCalls.flat()).toEqual(idsOf(device.log));
  });
});

describe('runSyncPass awaits its callbacks', () => {
  // Wraps the server so each request records whether a callback was still
  // pending when it was sent.
  function trackOverlap(server: FakeSyncServer) {
    const state = { overlaps: 0, pending: 0 };
    const request: FakeSyncServer['request'] = (path, init) => {
      if (state.pending > 0) state.overlaps += 1;
      return server.request(path, init);
    };
    function deferred<T extends unknown[]>(apply: (...args: T) => void) {
      return async (...args: T): Promise<void> => {
        state.pending += 1;
        await waitAMoment();
        apply(...args);
        state.pending -= 1;
      };
    }
    return { deferred, request, state };
  }

  it('sends no request while an async markSynced is still pending', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(450, userId));
    const server = createFakeSyncServer();
    const tracker = trackOverlap(server);

    const result = await runPass(device, server, {
      markSynced: tracker.deferred(device.applySynced),
      request: tracker.request,
    });

    expect(result).toEqual({ isOk: true });
    expect(tracker.state.overlaps).toBe(0);
    expect(device.log.every(({ isSynced }) => isSynced)).toBe(true);
  });

  it('sends no re-post while an async markHeld is still pending', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(10, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ rejectedEventIds: new Set([log[1].eventId]) });
    const tracker = trackOverlap(server);

    const result = await runPass(device, server, {
      markHeld: tracker.deferred(device.applyHeld),
      request: tracker.request,
    });

    expect(result).toEqual({ isOk: true });
    expect(tracker.state.overlaps).toBe(0);
    expect(device.heldCalls.flat()).toEqual([log[1].eventId]);
  });

  it('requests no next page while an async mergeDownloaded is still pending', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 2 });
    server.seed(Array.from({ length: 5 }, (_unused, index) => buildAnswerEvent(index)));
    const device = createDevice(userId, []);
    const tracker = trackOverlap(server);

    const result = await runPass(device, server, {
      mergeDownloaded: tracker.deferred(device.applyMerge),
      request: tracker.request,
    });

    expect(result).toEqual({ isOk: true });
    expect(tracker.state.overlaps).toBe(0);
    expect(device.mergeCalls).toHaveLength(3);
  });

  it('stops with isOk false when markSynced rejects, sending no later request', async () => {
    const userId = randomUUID();
    const device = createDevice(userId, buildOwnedLog(400, userId));
    const server = createFakeSyncServer();

    const result = await runPass(device, server, {
      markSynced: (ids) => {
        device.applySynced(ids);
        return rejectedPromise();
      },
    });

    expect(result).toEqual({ isOk: false });
    expect(server.postRequests()).toHaveLength(1);
    expect(server.getRequests()).toEqual([]);
  });

  it('stops with isOk false when markHeld rejects, re-posting nothing', async () => {
    const userId = randomUUID();
    const log = buildOwnedLog(10, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer({ rejectedEventIds: new Set([log[1].eventId]) });

    const result = await runPass(device, server, {
      markHeld: (ids) => {
        device.applyHeld(ids);
        return rejectedPromise();
      },
    });

    expect(result).toEqual({ isOk: false });
    expect(server.postRequests()).toHaveLength(1);
    expect(device.syncedCalls).toEqual([]);
    expect(server.getRequests()).toEqual([]);
  });

  it('stops with isOk false when mergeDownloaded rejects, requesting no next page and passing no later cursor', async () => {
    const userId = randomUUID();
    const server = createFakeSyncServer({ pageSize: 2 });
    server.seed(Array.from({ length: 5 }, (_unused, index) => buildAnswerEvent(index)));
    const device = createDevice(userId, []);

    const result = await runPass(device, server, {
      mergeDownloaded: (events, cursor) => {
        device.applyMerge(events, cursor);
        return rejectedPromise();
      },
    });

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests()).toHaveLength(1);
    expect(device.mergeCalls).toHaveLength(1);
  });
});

describe('runSyncPass download guards', () => {
  // A server answering every GET from a script; past the script it returns a
  // 500 so a looping pass still ends.
  function scriptedServer(pages: FakeResponse[]) {
    return createFakeSyncServer({ onGet: (_path, getNumber) => pages[getNumber - 1] ?? serverError(500) });
  }

  it('stops with isOk false when nextCursor repeats the cursor just used', async () => {
    const userId = randomUUID();
    const cursor = randomUUID();
    const server = scriptedServer([page([buildAnswerEvent(0)], cursor), page([buildAnswerEvent(1)], cursor), page([], null)]);
    const device = createDevice(userId, []);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests()).toHaveLength(2);
  });

  it('stops with isOk false on a two-step cursor cycle c1, c2, c1', async () => {
    const userId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const server = scriptedServer([
      page([buildAnswerEvent(0)], first),
      page([buildAnswerEvent(1)], second),
      page([buildAnswerEvent(2)], first),
      page([], null),
    ]);
    const device = createDevice(userId, []);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(server.getRequests().map(({ path }) => path)).toEqual([
      'answer-events',
      `answer-events?after=${encodeURIComponent(first)}`,
      `answer-events?after=${encodeURIComponent(second)}`,
    ]);
  });

  it('stops after 100 pages with isOk true, having merged them, and the next pass resumes from the stored cursor', async () => {
    const userId = randomUUID();
    const total = MAX_PAGES_PER_PASS + 50;
    const cursors: string[] = Array.from({ length: total }, () => randomUUID());
    const events = Array.from({ length: total }, (_unused, index) => buildAnswerEvent(index));
    // Page n (from 1) after cursor n-1; the last scripted page ends the stream.
    const server = createFakeSyncServer({
      onGet: (path) => {
        const index = path === 'answer-events' ? 0 : cursors.indexOf(decodeURIComponent(path.split('after=')[1])) + 1;
        if (index <= 0 && path !== 'answer-events') return serverError(400);
        return page([events[index]], index + 1 < total ? cursors[index] : null);
      },
    });
    const device = createDevice(userId, []);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(server.getRequests()).toHaveLength(MAX_PAGES_PER_PASS);
    expect(device.mergeCalls).toHaveLength(MAX_PAGES_PER_PASS);
    expect(device.syncCursor).toBe(cursors[MAX_PAGES_PER_PASS - 1]);
    expect(new Set(idsOf(device.log))).toEqual(new Set(idsOf(events.slice(0, MAX_PAGES_PER_PASS))));

    const second = await runPass(device, server);

    expect(second).toEqual({ isOk: true });
    expect(server.getRequests()[MAX_PAGES_PER_PASS].path).toBe(
      `answer-events?after=${encodeURIComponent(cursors[MAX_PAGES_PER_PASS - 1])}`,
    );
    expect(new Set(idsOf(device.log))).toEqual(new Set(idsOf(events)));
  });

  it('merges a duplicated eventId within one page once', async () => {
    const userId = randomUUID();
    const [first, second] = [buildAnswerEvent(0), buildAnswerEvent(1)];
    const server = scriptedServer([page([first, { ...first }, second], null)]);
    const device = createDevice(userId, []);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: true });
    expect(device.mergeCalls.map(({ eventIds }) => eventIds)).toEqual([[first.eventId, second.eventId]]);
    expect(device.log).toHaveLength(2);
  });

  it('merges nothing and stops when one event in a page is invalid', async () => {
    const userId = randomUUID();
    const invalid = { ...buildAnswerEvent(1), answeredAt: 'not a date' };
    const server = scriptedServer([page([buildAnswerEvent(0), invalid as AnswerEvent, buildAnswerEvent(2)], null)]);
    const device = createDevice(userId, []);

    const result = await runPass(device, server);

    expect(result).toEqual({ isOk: false });
    expect(device.mergeCalls).toEqual([]);
    expect(device.log).toEqual([]);
  });
});

describe('runSyncPass callback throws', () => {
  class StorageFailure extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StorageFailure';
    }
  }

  function warnOutput(spy: jest.SpyInstance): string {
    return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
  }

  it('logs only the error name when markSynced throws, and resolves isOk false', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const userId = randomUUID();
    const log = buildOwnedLog(3, userId);
    const device = createDevice(userId, log);
    const server = createFakeSyncServer();

    const result = await runPass(device, server, {
      markSynced: (ids) => {
        throw new StorageFailure(`could not write ${ids.join(',')} ${log[0].questionId}`);
      },
    });

    expect(result).toEqual({ isOk: false });
    const output = warnOutput(warnSpy);
    expect(output).toContain('StorageFailure');
    for (const entry of log) {
      expect(output).not.toContain(entry.eventId);
      expect(output).not.toContain(entry.answeredAt);
    }
    expect(output).not.toContain('could not write');
    expect(server.getRequests()).toEqual([]);
  });

  it('logs only the error name when mergeDownloaded throws, and resolves isOk false', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const userId = randomUUID();
    const seeded = [buildAnswerEvent(0), buildAnswerEvent(1)];
    const server = createFakeSyncServer();
    server.seed(seeded);
    const device = createDevice(userId, []);

    const result = await runPass(device, server, {
      mergeDownloaded: (events) => {
        throw new StorageFailure(`could not merge ${events.map(({ eventId }) => eventId).join(',')}`);
      },
    });

    expect(result).toEqual({ isOk: false });
    const output = warnOutput(warnSpy);
    expect(output).toContain('StorageFailure');
    for (const event of seeded) expect(output).not.toContain(event.eventId);
    expect(output).not.toContain('could not merge');
  });
});
