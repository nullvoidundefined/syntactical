// How one sync pass answers each server response, a user change mid-pass, and
// a failing storage callback, as one table. Every server body comes from
// syncServerResponses.ts; every callback is async, and no request may go out
// while one is still pending.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';
import { mergeDownloadedEvents } from '../mergeDownloadedEvents';
import { runSyncPass } from '../runSyncPass';
import { buildAnswerEvent, buildOwnedLog, createFakeSyncServer } from './fakeSyncServer';
import type { FakeRequestInit, FakeResponse } from './fakeSyncServer';
import { buildDownloadPage, buildErrorResponse, buildFailure, buildRejectedEvents, buildUploadSuccess, SERVER_ERROR_CODES } from './syncServerResponses';

type ServerOptions = NonNullable<Parameters<typeof createFakeSyncServer>[0]>;
type Callback = 'markHeld' | 'markSynced' | 'mergeDownloaded';

type Case = {
  name: string;
  logSize?: number;
  seeded?: number;
  // Indexes into the log of the events the server names in a 422.
  rejected?: number[];
  outOfRange?: number[];
  onPost?: (events: AnswerEvent[], postNumber: number) => FakeResponse | undefined;
  onGet?: (path: string, getNumber: number) => FakeResponse | undefined;
  maxStoredEvents?: number;
  // The user changes before the pass starts, or once a POST or GET is answered.
  userChangesAt?: 'start' | 'POST' | 'GET';
  failing?: Callback;
  expected: { result: object; posts: number; gets: number; held?: number[]; heldCount?: number; synced: number; merged?: number };
};

const INVALID_EVENTS = SERVER_ERROR_CODES.INVALID_EVENTS;
const onFirstPost = (response: FakeResponse) => (_events: AnswerEvent[], postNumber: number) => (postNumber === 1 ? response : undefined);
const always = (response: FakeResponse) => () => response;
const failed = { isOk: false };
const ok = { isOk: true };

const cases: Case[] = [
  { name: 'uploads and downloads nothing when the user changed before the pass', userChangesAt: 'start', expected: { result: failed, posts: 0, gets: 0, synced: 0 } },
  { name: 'marks nothing synced when the user changes during the upload', userChangesAt: 'POST', expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'holds nothing when the user changes during a 422', rejected: [2], userChangesAt: 'POST', expected: { result: failed, posts: 1, gets: 0, held: [], synced: 0 } },
  { name: 'merges nothing when the user changes during the download', seeded: 2, userChangesAt: 'GET', expected: { result: failed, posts: 1, gets: 1, synced: 5, merged: 0 } },
  { name: 'holds the events a 422 SYNC_INVALID_EVENTS names and syncs the rest', rejected: [1, 3], expected: { result: ok, posts: 2, gets: 1, held: [1, 3], synced: 3 } },
  { name: 'holds the events a 422 SYNC_TIMESTAMP_OUT_OF_RANGE names and syncs the rest', outOfRange: [0, 4], expected: { result: ok, posts: 2, gets: 1, held: [0, 4], synced: 3 } },
  { name: 'holds nothing and still downloads for a 422 naming no events', seeded: 2, onPost: onFirstPost(buildRejectedEvents(INVALID_EVENTS, [])), expected: { result: failed, posts: 1, gets: 1, held: [], synced: 0, merged: 2 } },
  { name: 'holds nothing for a 422 naming only events outside the batch', onPost: onFirstPost(buildRejectedEvents(INVALID_EVENTS, [randomUUID()])), expected: { result: failed, posts: 1, gets: 1, held: [], synced: 0 } },
  { name: 'holds nothing for a 422 whose eventIds is not an array', onPost: onFirstPost(buildRejectedEvents(INVALID_EVENTS, 'everything')), expected: { result: failed, posts: 1, gets: 1, held: [], synced: 0 } },
  { name: 'holds a batch refused 400 INPUT_INVALID_BODY whole and uploads the next', logSize: 250, onPost: onFirstPost(buildErrorResponse(SERVER_ERROR_CODES.INVALID_BODY)), expected: { result: ok, posts: 2, gets: 1, heldCount: 200, synced: 50 } },
  { name: 'holds a batch refused 413 INPUT_PAYLOAD_TOO_LARGE whole and uploads the next', logSize: 250, onPost: onFirstPost(buildErrorResponse(SERVER_ERROR_CODES.PAYLOAD_TOO_LARGE)), expected: { result: ok, posts: 2, gets: 1, heldCount: 200, synced: 50 } },
  { name: 'stops uploading at the event cap with no retry of a smaller batch, and still downloads', logSize: 250, seeded: 2, maxStoredEvents: 2, expected: { result: { isOk: false, isUploadCapReached: true }, posts: 1, gets: 1, held: [], synced: 0, merged: 2 } },
  { name: 'stops on a 500 upload and still downloads', seeded: 2, onPost: always(buildFailure(500)), expected: { result: failed, posts: 1, gets: 1, synced: 0, merged: 2 } },
  { name: 'stops on a 503 upload and still downloads', onPost: always(buildFailure(503)), expected: { result: failed, posts: 1, gets: 1, synced: 0 } },
  { name: 'marks nothing synced for a 200 with a null body', onPost: always({ status: 200, body: null }), expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'marks nothing synced for a 204 with no body', onPost: always({ status: 204, body: null }), expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'marks nothing synced for a 200 without data', onPost: always({ status: 200, body: { insertedCount: 3 } }), expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'marks nothing synced for a 200 whose data is an array', onPost: always({ status: 200, body: { data: [] } }), expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'accepts a 200 that stored nothing new (a re-post)', onPost: always(buildUploadSuccess(0)), expected: { result: ok, posts: 1, gets: 1, synced: 5 } },
  { name: 'stops when markSynced fails, sending nothing more', logSize: 250, failing: 'markSynced', expected: { result: failed, posts: 1, gets: 0, synced: 0 } },
  { name: 'stops when markHeld fails, re-posting nothing', rejected: [1], failing: 'markHeld', expected: { result: failed, posts: 1, gets: 0, held: [], synced: 0 } },
  { name: 'stops when mergeDownloaded fails, requesting no next page', logSize: 0, onGet: (_path, n) => buildDownloadPage([buildAnswerEvent(n)], `c${n}`), failing: 'mergeDownloaded', expected: { result: failed, posts: 0, gets: 1, synced: 0, merged: 0 } },
  { name: 'stops when nextCursor repeats', logSize: 0, onGet: (_path, n) => buildDownloadPage([buildAnswerEvent(n)], 'c'), expected: { result: failed, posts: 0, gets: 2, synced: 0, merged: 1 } },
  { name: 'stops on a cursor cycle c1, c2, c1', logSize: 0, onGet: (_path, n) => buildDownloadPage([buildAnswerEvent(n)], `c${n % 2}`), expected: { result: failed, posts: 0, gets: 3, synced: 0, merged: 2 } },
  { name: 'ends the pass after 100 pages, having merged each', logSize: 0, onGet: (_path, n) => buildDownloadPage([buildAnswerEvent(n)], `c${n}`), expected: { result: ok, posts: 0, gets: 100, synced: 0, merged: 100 } },
  { name: 'merges a duplicated event of one page once', logSize: 0, onGet: () => { const event = buildAnswerEvent(0); return buildDownloadPage([event, { ...event }], null); }, expected: { result: ok, posts: 0, gets: 1, synced: 0, merged: 1 } },
  { name: 'merges nothing from a page holding an invalid event', logSize: 0, onGet: () => buildDownloadPage([buildAnswerEvent(0), { ...buildAnswerEvent(1), answeredAt: 'not a date' }], null), expected: { result: failed, posts: 0, gets: 1, synced: 0, merged: 0 } },
];

class StorageFailure extends Error {
  name = 'StorageFailure';
}

function idsAt(log: LoggedAnswerEvent[], indexes: number[] = []): Set<string> {
  return new Set(indexes.map((index) => log[index].eventId));
}

async function runCase(testCase: Case) {
  const userId = randomUUID();
  const initial = buildOwnedLog(testCase.logSize ?? 5, userId);
  const options: ServerOptions = {
    maxStoredEvents: testCase.maxStoredEvents,
    onGet: testCase.onGet,
    onPost: testCase.onPost,
    outOfRangeEventIds: idsAt(initial, testCase.outOfRange),
    rejectedEventIds: idsAt(initial, testCase.rejected),
  };
  const server = createFakeSyncServer(options);
  server.seed(Array.from({ length: testCase.seeded ?? 0 }, (_unused, index) => buildAnswerEvent(9000 + index)));
  const state = { held: [] as string[], isCurrent: testCase.userChangesAt !== 'start', log: initial, merged: [] as string[], overlaps: 0, pending: 0 };

  function callback<T extends unknown[]>(name: Callback, apply: (...args: T) => void) {
    return async (...args: T): Promise<void> => {
      state.pending += 1;
      await new Promise((resolve) => setImmediate(resolve));
      state.pending -= 1;
      if (testCase.failing === name) throw new StorageFailure(`could not store ${JSON.stringify(args)}`);
      apply(...args);
    };
  }
  async function request(path: string, init: FakeRequestInit = {}) {
    if (state.pending > 0) state.overlaps += 1;
    const response = await server.request(path, init);
    if ((init.method ?? 'GET') === testCase.userChangesAt) state.isCurrent = false;
    return response;
  }
  const markHeld = callback('markHeld', (ids: string[]) => {
    state.held.push(...ids);
    state.log = state.log.map((entry) => (ids.includes(entry.eventId) ? { ...entry, isHeld: true } : entry));
  });
  const markSynced = callback('markSynced', (ids: string[]) => {
    state.log = state.log.map((entry) => (ids.includes(entry.eventId) ? { ...entry, isSynced: true } : entry));
  });
  const mergeDownloaded = callback('mergeDownloaded', (events: AnswerEvent[]) => {
    state.merged.push(...events.map(({ eventId }) => eventId));
    state.log = mergeDownloadedEvents(state.log, events, userId);
  });

  const result = await runSyncPass({ eventLog: initial, isCurrent: () => state.isCurrent, markHeld, markSynced, mergeDownloaded, request, syncCursor: null, userId });
  return { initial, result, server, state };
}

describe('runSyncPass cases', () => {
  it.each(cases.map((testCase) => [testCase.name, testCase] as const))('%s', async (_name, testCase) => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { expected } = testCase;
    const { initial, result, server, state } = await runCase(testCase);

    expect(result).toEqual(expected.result);
    expect(server.postRequests()).toHaveLength(expected.posts);
    expect(server.getRequests()).toHaveLength(expected.gets);
    if (expected.held) expect(new Set(state.held)).toEqual(idsAt(initial, expected.held));
    if (expected.heldCount !== undefined) expect(state.held).toHaveLength(expected.heldCount);
    const synced = initial.filter(({ eventId }) => state.log.find((entry) => entry.eventId === eventId)?.isSynced);
    expect(synced).toHaveLength(expected.synced);
    // A scripted POST answer stores nothing; otherwise synced means stored.
    if (!testCase.onPost) for (const entry of synced) expect(server.storedIds().has(entry.eventId)).toBe(true);
    if (expected.merged !== undefined) expect(state.merged).toHaveLength(expected.merged);
    expect(state.overlaps).toBe(0);
  });

  it('logs only the error name when a callback throws, never an event id or answer time', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initial } = await runCase({ name: 'log', failing: 'markSynced', expected: { result: failed, posts: 1, gets: 0, synced: 0 } });

    const output = warn.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(output).toContain('StorageFailure');
    expect(output).not.toContain('could not store');
    for (const { answeredAt, eventId } of initial) {
      expect(output).not.toContain(eventId);
      expect(output).not.toContain(answeredAt);
    }
  });
});
