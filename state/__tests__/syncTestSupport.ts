// Shared support for the client sync tests (Task 3.11): an apiFetch stand-in
// that sends answer-event requests to a fake idempotent server per signed-in
// user (the session in force when the request was sent decides the account),
// answers the auth routes, can hold a chosen request in flight, and records
// the peak number of concurrent requests; plus readers and writers for the
// stored event log and stats.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';

import { EVENT_LOG_STORAGE_KEY, STORAGE_KEY } from '../../constants/appConfig';
import { readLocalToday } from '../../services/progress/readLocalToday';
import { createEmptyStats } from '../../services/stats/createEmptyStats';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import type { Stats } from '../../services/stats/types/Stats';
import { createFakeSyncServer, type FakeSyncServer } from '../../services/sync/__tests__/fakeSyncServer';
import { buildErrorResponse, SERVER_ERROR_CODES } from '../../services/sync/__tests__/syncServerResponses';

type RequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };
type Response = { status: number; body: unknown };
type Predicate = (path: string, method: string) => boolean;

export type SentRequest = { method: string; path: string; sessionUserId: string | null };

export type Hold = { isReached: () => boolean; release: () => void };

// The server's own failure: 500 SERVER_INTERNAL_ERROR in the error envelope.
const FAILURE = buildErrorResponse(SERVER_ERROR_CODES.INTERNAL_ERROR);

export function createApiRouter(options: { pageSize?: number } = {}) {
  const servers = new Map<string, FakeSyncServer>();
  const holds: { predicate: Predicate; gate: Promise<void>; isUsed: boolean; release: () => void }[] = [];
  const sent: SentRequest[] = [];
  const state = {
    activeUserId: null as string | null,
    inFlight: 0,
    isFailing: false,
    maxInFlight: 0,
    signInUserId: null as string | null,
    signInSessionValue: null as string | null,
  };

  function serverFor(userId: string): FakeSyncServer {
    let server = servers.get(userId);
    if (!server) {
      server = createFakeSyncServer({
        onGet: () => (state.isFailing ? FAILURE : undefined),
        onPost: () => (state.isFailing ? FAILURE : undefined),
        pageSize: options.pageSize,
      });
      servers.set(userId, server);
    }
    return server;
  }

  // Holds the next request matching the predicate until release().
  function holdNext(predicate: Predicate): Hold {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hold = { gate, isUsed: false, predicate, release: () => release() };
    holds.push(hold);
    return { isReached: () => hold.isUsed, release: hold.release };
  }

  function answerAuth(path: string, method: string): Response {
    if (method === 'POST' && path === 'auth/codes') return { status: 202, body: { data: { status: 'code-sent' } } };
    if (method === 'POST' && path === 'auth/sessions') {
      if (state.signInUserId === null) return { status: 400, body: { error: { code: 'AUTH_INVALID_CODE' } } };
      state.activeUserId = state.signInUserId;
      return { status: 201, body: { data: { token: state.signInSessionValue, userId: state.signInUserId } } };
    }
    if (method === 'DELETE' && path === 'auth/sessions/current') {
      state.activeUserId = null;
      return { status: 204, body: null };
    }
    return { status: 404, body: null };
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? 'GET';
    const sessionUserId = state.activeUserId;
    sent.push({ method, path, sessionUserId });
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      const hold = holds.find((candidate) => !candidate.isUsed && candidate.predicate(path, method));
      if (hold) {
        hold.isUsed = true;
        await hold.gate;
      }
      if (!path.startsWith('answer-events')) return answerAuth(path, method);
      // No session: the server refuses, as the real one would.
      if (sessionUserId === null) return buildErrorResponse(SERVER_ERROR_CODES.SESSION_REQUIRED);
      return await serverFor(sessionUserId).request(path, init);
    } finally {
      state.inFlight -= 1;
    }
  }

  return {
    holdNext,
    request,
    sent,
    serverFor,
    state,
    syncRequestsWithoutSession: () => sent.filter(({ path, sessionUserId }) => path.startsWith('answer-events') && sessionUserId === null),
  };
}

export type ApiRouter = ReturnType<typeof createApiRouter>;

export async function seedEventLog(log: LoggedAnswerEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(log));
}

export async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]') as LoggedAnswerEvent[];
}

export async function seedStats(change: Partial<Stats>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createEmptyStats(readLocalToday()), ...change }));
}

export async function readStoredStats(): Promise<Stats | null> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null') as Stats | null;
}

export function idsOf(log: { eventId: string }[]): string[] {
  return log.map(({ eventId }) => eventId);
}

// Lets promise chains and the fake server's setImmediate turns run, without
// moving fake clocks.
export async function flush(rounds = 60): Promise<void> {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}
