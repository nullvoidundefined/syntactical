// Test support for the sync services: answer event builders and a fake
// idempotent answer-events server reached through a request function shaped
// like apiFetch.
import { randomUUID } from 'node:crypto';

import type { AnswerEvent } from '@syntactical/progress';

import { ApiUnavailable } from '../../../clients/ApiUnavailable';
import type { LoggedAnswerEvent } from '../../stats/types/LoggedAnswerEvent';

export type FakeRequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };
export type FakeResponse = { status: number; body: unknown };
export type RecordedRequest = { body: unknown; method: string; path: string };

// A POST override: a response returned without storing anything, 'throw' to
// throw ApiUnavailable without storing, 'store-then-throw' to store the batch
// and then lose the response, or undefined for normal handling.
type PostOverride = FakeResponse | 'throw' | 'store-then-throw' | undefined;

type FakeServerOptions = {
  onGet?: (path: string, getNumber: number) => FakeResponse | undefined;
  onPost?: (events: AnswerEvent[], postNumber: number) => PostOverride;
  pageSize?: number;
  rejectedEventIds?: ReadonlySet<string>;
};

const BANK_KEYS = ['python/easy', 'python/medium', 'typescript/hard'];
const ANSWER_EVENT_KEYS = ['answeredAt', 'bankKey', 'choiceIndex', 'eventId', 'isCorrect', 'questionId', 'roundKind'];
const MAX_BATCH = 200;
const DEFAULT_PAGE_SIZE = 500;

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

function readPostedEvents(body: unknown): AnswerEvent[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const { events } = body as { events?: unknown };
  return Array.isArray(events) ? (events as AnswerEvent[]) : null;
}

export function createFakeSyncServer(options: FakeServerOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const stored = new Map<string, AnswerEvent>();
  const requests: RecordedRequest[] = [];
  const issuedCursors = new Map<string, number>();
  let postCount = 0;
  let getCount = 0;

  function issueCursor(offset: number): string {
    // Characters that must be URL-encoded, so an unencoded cursor is unknown.
    const cursor = `cursor/${offset}+&=`;
    issuedCursors.set(cursor, offset);
    return cursor;
  }

  function store(events: AnswerEvent[]): number {
    let inserted = 0;
    for (const event of events) {
      if (!stored.has(event.eventId)) {
        stored.set(event.eventId, { ...event });
        inserted += 1;
      }
    }
    return inserted;
  }

  function handlePost(body: unknown): FakeResponse {
    const events = readPostedEvents(body);
    postCount += 1;
    if (events === null || events.length === 0 || events.length > MAX_BATCH) {
      return { status: 400, body: { error: { code: 'VALIDATION_FAILED', message: 'bad batch', requestId: 'req' } } };
    }
    const override = options.onPost?.(events, postCount);
    if (override === 'throw') throw new ApiUnavailable('network failed');
    if (override === 'store-then-throw') {
      store(events);
      throw new ApiUnavailable('response lost');
    }
    if (override) return override;
    const rejected = events.filter(({ eventId }) => options.rejectedEventIds?.has(eventId)).map(({ eventId }) => eventId);
    if (rejected.length > 0) {
      return {
        status: 422,
        body: { error: { code: 'EVENT_OUT_OF_BOUNDS', message: 'out of bounds', requestId: 'req', eventIds: rejected } },
      };
    }
    return { status: 200, body: { data: { inserted: store(events) } } };
  }

  function handleGet(path: string): FakeResponse {
    getCount += 1;
    const override = options.onGet?.(path, getCount);
    if (override) return override;
    let offset = 0;
    if (path !== 'answer-events') {
      const prefix = 'answer-events?after=';
      if (!path.startsWith(prefix)) return { status: 404, body: null };
      const cursor = decodeURIComponent(path.slice(prefix.length));
      const known = issuedCursors.get(cursor);
      if (known === undefined) return { status: 400, body: { error: { code: 'BAD_CURSOR', message: 'bad', requestId: 'req' } } };
      offset = known;
    }
    const all = [...stored.values()];
    const events = all.slice(offset, offset + pageSize).map((event) => ({ ...event }));
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < all.length ? issueCursor(nextOffset) : null;
    return { status: 200, body: { data: { events, nextCursor } } };
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
    return { status: 404, body: null };
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
