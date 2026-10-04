// Test support for the sync services: answer event builders and a fake
// idempotent answer-events server reached through a request function shaped
// like apiFetch. Every response the fake builds copies the real server
// (server/src/routes/answerEvents.ts) through syncServerResponses.ts: the
// POST 200 totals body, the GET page body, and the error envelope with its
// codes, in the server's check order (rate limit, batch size, body schema,
// answer key, user row lock, timestamps, event cap).
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import { ApiUnavailable } from '../../../clients/ApiUnavailable';
import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';

import {
  buildDownloadPage,
  buildErrorResponse,
  buildRejectedEvents,
  buildServerBusy,
  buildUploadSuccess,
  SERVER_ERROR_CODES,
} from './syncServerResponses';
import type { ServerResponse } from './syncServerResponses';

export type FakeRequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };
export type FakeResponse = ServerResponse;
export type RecordedRequest = { body: unknown; method: string; path: string };

// A POST override: a response returned without storing anything, 'throw' to
// throw ApiUnavailable without storing, 'store-then-throw' to store the batch
// and then lose the response, or undefined for normal handling.
type PostOverride = FakeResponse | 'throw' | 'store-then-throw' | undefined;

type FakeServerOptions = {
  // POST numbers (1-based) answered 503 SERVER_BUSY, storing nothing, as when a
  // database lock or statement timeout ends the upload.
  busyPostNumbers?: ReadonlySet<number>;
  // Requests allowed per route before the server answers 429 RATE_LIMIT_EXCEEDED.
  downloadLimit?: number;
  // The stored-event cap: a batch that would pass it is 422 SYNC_EVENT_CAP_REACHED.
  maxStoredEvents?: number;
  onGet?: (path: string, getNumber: number) => FakeResponse | undefined;
  onPost?: (events: AnswerEvent[], postNumber: number) => PostOverride;
  // Events the answer key rejects: 422 SYNC_TIMESTAMP_OUT_OF_RANGE for the whole batch.
  outOfRangeEventIds?: ReadonlySet<string>;
  pageSize?: number;
  // Events the answer key rejects: 422 SYNC_INVALID_EVENTS for the whole batch.
  rejectedEventIds?: ReadonlySet<string>;
  uploadLimit?: number;
};

const BANK_KEYS = ['python/easy', 'python/medium', 'typescript/hard'];
const ANSWER_EVENT_KEYS = ['answeredAt', 'bankKey', 'choiceIndex', 'eventId', 'isCorrect', 'questionId', 'roundKind'];
const ROUND_KINDS = new Set(['bank', 'topic', 'review']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 200;
const MAX_BATCH = 200;
const DEFAULT_PAGE_SIZE = 500;
const RECEIVED_BASE_MS = Date.UTC(2026, 9, 2);

export function buildAnswerEvent(index: number): AnswerEvent {
  return {
    answeredAt: new Date(Date.UTC(2026, 9, 1, 12) + index * 1000).toISOString(),
    bankKey: BANK_KEYS[index % BANK_KEYS.length],
    choiceIndex: index % 4,
    eventId: randomUUID(),
    isCorrect: index % 3 !== 0,
    questionId: `question-${index}`,
    roundKind: 'bank',
  };
}

export function toLogged(
  event: AnswerEvent,
  ownerUserId: string | null,
  flags: { isHeld?: boolean; isSynced?: boolean } = {},
): LoggedAnswerEvent {
  return { ...event, isHeld: flags.isHeld ?? false, isSynced: flags.isSynced ?? false, ownerUserId };
}

export function buildOwnedLog(count: number, ownerUserId: string | null, startIndex = 0): LoggedAnswerEvent[] {
  return Array.from({ length: count }, (_unused, offset) => toLogged(buildAnswerEvent(startIndex + offset), ownerUserId));
}

// True when the object carries exactly the server's answer event field set
// (listAnswerEvents.ts), isCorrect included.
export function hasOnlyAnswerEventKeys(event: object): boolean {
  return JSON.stringify(Object.keys(event).sort()) === JSON.stringify(ANSWER_EVENT_KEYS);
}

export function stripToAnswerEvent(entry: LoggedAnswerEvent): AnswerEvent {
  const { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind } = entry;
  return { answeredAt, bankKey, choiceIndex, eventId, isCorrect, questionId, roundKind };
}

function waitForTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEventsArray(body: unknown): unknown[] | null {
  if (!isRecordValue(body)) return null;
  return Array.isArray(body.events) ? body.events : null;
}

// The upload schema (answerEventSchemas.ts): isCorrect is not in it and is ignored.
function isUploadEvent(value: unknown): value is AnswerEvent {
  if (!isRecordValue(value)) return false;
  const { answeredAt, bankKey, choiceIndex, eventId, questionId, roundKind } = value;
  return (
    typeof answeredAt === 'string' &&
    !Number.isNaN(Date.parse(answeredAt)) &&
    typeof bankKey === 'string' &&
    Number.isInteger(choiceIndex) &&
    (choiceIndex as number) >= 0 &&
    typeof eventId === 'string' &&
    UUID_PATTERN.test(eventId) &&
    typeof questionId === 'string' &&
    typeof roundKind === 'string' &&
    ROUND_KINDS.has(roundKind)
  );
}

function decodeCursor(raw: string): boolean {
  if (raw.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(raw)) return false;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    return isRecordValue(value) && typeof value.e === 'string' && typeof value.r === 'string';
  } catch {
    return false;
  }
}

export function createFakeSyncServer(options: FakeServerOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const stored = new Map<string, AnswerEvent>();
  const requests: RecordedRequest[] = [];
  const issuedCursors = new Map<string, number>();
  let postCount = 0;
  let getCount = 0;

  // A cursor shaped like the server's: base64url of {"e": event id, "r": received_at text}
  // for the last event before the offset.
  function issueCursor(offset: number): string {
    const lastId = [...stored.keys()][offset - 1] ?? randomUUID();
    const receivedKey = new Date(RECEIVED_BASE_MS + offset).toISOString().replace('Z', '000Z');
    const cursor = Buffer.from(JSON.stringify({ e: lastId, r: receivedKey })).toString('base64url');
    issuedCursors.set(cursor, offset);
    return cursor;
  }

  function store(events: AnswerEvent[]): number {
    let inserted = 0;
    for (const event of events) {
      if (!stored.has(event.eventId)) {
        stored.set(event.eventId, stripToAnswerEvent(toLogged(event, null)));
        inserted += 1;
      }
    }
    return inserted;
  }

  function namedIn(events: AnswerEvent[], ids: ReadonlySet<string> | undefined): string[] {
    return events.filter(({ eventId }) => ids?.has(eventId)).map(({ eventId }) => eventId);
  }

  function handlePost(body: unknown): FakeResponse {
    postCount += 1;
    if (options.uploadLimit !== undefined && postCount > options.uploadLimit) {
      return buildErrorResponse(SERVER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
    }
    const posted = readEventsArray(body);
    if (posted !== null && posted.length > MAX_BATCH) return buildErrorResponse(SERVER_ERROR_CODES.PAYLOAD_TOO_LARGE);
    if (posted === null || posted.length === 0 || !posted.every(isUploadEvent)) {
      return buildErrorResponse(SERVER_ERROR_CODES.INVALID_BODY);
    }
    const events = posted;
    const override = options.onPost?.(events, postCount);
    if (override === 'throw') throw new ApiUnavailable('network failed');
    if (override === 'store-then-throw') {
      store(events);
      throw new ApiUnavailable('response lost');
    }
    if (override) return override;
    const invalid = namedIn(events, options.rejectedEventIds);
    if (invalid.length > 0) return buildRejectedEvents(SERVER_ERROR_CODES.INVALID_EVENTS, invalid);
    if (options.busyPostNumbers?.has(postCount)) return buildServerBusy();
    const outOfRange = namedIn(events, options.outOfRangeEventIds);
    if (outOfRange.length > 0) return buildRejectedEvents(SERVER_ERROR_CODES.TIMESTAMP_OUT_OF_RANGE, outOfRange);
    const fresh = new Set(events.map(({ eventId }) => eventId).filter((id) => !stored.has(id)));
    if (options.maxStoredEvents !== undefined && stored.size + fresh.size > options.maxStoredEvents) {
      return buildErrorResponse(SERVER_ERROR_CODES.EVENT_CAP_REACHED);
    }
    return buildUploadSuccess(store(events));
  }

  function handleGet(path: string): FakeResponse {
    getCount += 1;
    if (options.downloadLimit !== undefined && getCount > options.downloadLimit) {
      return buildErrorResponse(SERVER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
    }
    const override = options.onGet?.(path, getCount);
    if (override) return override;
    let offset = 0;
    if (path !== 'answer-events') {
      const prefix = 'answer-events?after=';
      if (!path.startsWith(prefix)) return buildErrorResponse(SERVER_ERROR_CODES.INVALID_QUERY);
      const cursor = decodeURIComponent(path.slice(prefix.length));
      const known = issuedCursors.get(cursor);
      // A cursor this fake never issued cannot be paged from; the real server
      // answers a malformed one with the same 400.
      if (!decodeCursor(cursor) || known === undefined) return buildErrorResponse(SERVER_ERROR_CODES.INVALID_QUERY);
      offset = known;
    }
    const all = [...stored.values()];
    const events = all.slice(offset, offset + pageSize).map((event) => ({ ...event }));
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < all.length ? issueCursor(nextOffset) : null;
    return buildDownloadPage(events, nextCursor);
  }

  async function request(path: string, init: FakeRequestInit = {}): Promise<FakeResponse> {
    const method = init.method ?? 'GET';
    requests.push({ body: init.body, method, path });
    await waitForTurn();
    if (method === 'POST' && path === 'answer-events') {
      const response = handlePost(init.body);
      await waitForTurn();
      return response;
    }
    if (method === 'GET' && path.startsWith('answer-events')) return handleGet(path);
    return buildErrorResponse(SERVER_ERROR_CODES.NOT_FOUND);
  }

  return {
    issueCursor,
    postRequests: () => requests.filter(({ method, path }) => method === 'POST' && path === 'answer-events'),
    getRequests: () => requests.filter(({ method }) => method === 'GET'),
    request,
    requests,
    seed: (events: AnswerEvent[]) => store(events),
    storedEvents: () => [...stored.values()],
    storedIds: () => new Set(stored.keys()),
  };
}

export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>;
