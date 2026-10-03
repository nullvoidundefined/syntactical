// Shared helpers for the AuthProvider tests: a fetch stand-in that answers
// by method and API path, run-time identities and secrets (so no
// credential-shaped literal sits in source), and readers that collect every
// AsyncStorage value and every console call for leak checks.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { buildFakeResponse } from '../../clients/__tests__/apiTestSupport';

export const PINNED_API_BASE_URL = 'https://api.syntactical.dev/v1/';
export const SESSION_TOKEN_KEY = 'syntactical.session-token';
export const AUTH_STORAGE_KEY = 'syntactical.auth.v1';

export type FakeReply = { status: number; body?: unknown } | 'reject';

export type RoutedRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  credentials: unknown;
  body: unknown;
};

export type SignInIdentity = {
  email: string;
  code: string;
  sessionValue: string;
  userId: string;
};

export function buildIdentity(): SignInIdentity {
  return {
    email: `reader-${randomBytes(6).toString('hex')}@example.test`,
    code: String(randomInt(0, 1_000_000)).padStart(6, '0'),
    sessionValue: randomBytes(24).toString('hex'),
    userId: randomUUID(),
  };
}

function normaliseHeaders(raw: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) {
    return headers;
  }
  if (typeof (raw as { forEach?: unknown }).forEach === 'function' && !Array.isArray(raw)) {
    (raw as { forEach(cb: (value: string, name: string) => void): void }).forEach((value, name) => {
      headers[name.toLowerCase()] = String(value);
    });
    return headers;
  }
  const entries = Array.isArray(raw) ? (raw as Array<[string, string]>) : Object.entries(raw as Record<string, unknown>);
  for (const [name, value] of entries) {
    if (value !== undefined) {
      headers[String(name).toLowerCase()] = String(value);
    }
  }
  return headers;
}

function buildRoutedResponse(status: number, body: unknown, requestUrl: string): unknown {
  const text = body === undefined ? '' : JSON.stringify(body);
  return buildFakeResponse({ status, text }, requestUrl);
}

// A reply the test releases later, so a request can be held in flight while
// other auth calls run, then answered (or rejected) at a chosen moment.
export type HeldReply = {
  kind: 'held';
  promise: Promise<FakeReply>;
  release(reply: FakeReply): void;
};

export function holdReply(): HeldReply {
  let release: (reply: FakeReply) => void = () => undefined;
  const promise = new Promise<FakeReply>((resolve) => {
    release = resolve;
  });
  return { kind: 'held', promise, release: (reply) => release(reply) };
}

export type RouteReply = FakeReply | HeldReply;

function answer(reply: FakeReply, requestUrl: string): Promise<unknown> {
  if (reply === 'reject') {
    return Promise.reject(new TypeError('Network request failed'));
  }
  return Promise.resolve(buildRoutedResponse(reply.status, reply.body, requestUrl));
}

// Installs a fetch that answers each `METHOD path` from its own queue (the
// last reply repeats), records every request, and fails loudly on an
// unrouted request so a wrong path or method shows up as an assertion.
export function installRoutedFetch(routes: Record<string, RouteReply | RouteReply[]>): {
  fetchMock: jest.Mock;
  requests: RoutedRequest[];
  setRoute(key: string, reply: RouteReply | RouteReply[]): void;
} {
  const queues = new Map<string, RouteReply[]>();
  function setRoute(key: string, reply: RouteReply | RouteReply[]): void {
    queues.set(key, Array.isArray(reply) ? [...reply] : [reply]);
  }
  for (const [key, reply] of Object.entries(routes)) {
    setRoute(key, reply);
  }
  const requests: RoutedRequest[] = [];
  const fetchMock = jest.fn((input: unknown, init: Record<string, unknown> = {}) => {
    const url = String(input);
    const method = String(init.method ?? 'GET').toUpperCase();
    const path = url.startsWith(PINNED_API_BASE_URL) ? url.slice(PINNED_API_BASE_URL.length) : url;
    let body: unknown = init.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as unknown;
      } catch {
        // keep the raw string
      }
    }
    requests.push({ method, path, headers: normaliseHeaders(init.headers), credentials: init.credentials, body });
    const queue = queues.get(`${method} ${path}`);
    if (!queue || queue.length === 0) {
      return Promise.resolve(
        buildRoutedResponse(599, { error: { code: 'UNROUTED', message: `${method} ${path}` } }, url),
      );
    }
    const reply = queue.length > 1 ? (queue.shift() as RouteReply) : queue[0];
    if (reply !== 'reject' && 'kind' in reply) {
      return reply.promise.then((released) => answer(released, url));
    }
    return answer(reply, url);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, requests, setRoute };
}

export async function readAllStoredValues(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  return pairs.flatMap(([key, value]) => [key, value ?? '']);
}

export async function readStoredAuth(): Promise<{ userId: string | null; knownUserIds: string[] } | null> {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { userId: string | null; knownUserIds: string[] });
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

// Silences and records every console call so a test can assert that no
// secret reached any of them.
export function captureConsole(): {
  serialised(): string;
  serialisedFor(method: (typeof CONSOLE_METHODS)[number]): string;
  restore(): void;
} {
  const spies = CONSOLE_METHODS.map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
  function serialiseCalls(calls: unknown[][]): string {
    return calls
      .map((args) =>
        args
          .map((arg: unknown) => {
            if (arg instanceof Error) {
              return `${arg.name} ${arg.message} ${arg.stack ?? ''}`;
            }
            try {
              return typeof arg === 'string' ? arg : JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(' '),
      )
      .join('\n');
  }
  return {
    serialised: () => serialiseCalls(spies.flatMap((spy) => spy.mock.calls)),
    serialisedFor: (method) => serialiseCalls(spies[CONSOLE_METHODS.indexOf(method)].mock.calls),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

// Makes the device time zone a known IANA value for the duration of a test,
// keeping every other formatter behaviour real.
export function pinDeviceTimeZone(timeZone: string): () => void {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((
    ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
  ) => {
    const formatter = new RealDateTimeFormat(...args);
    const realResolved = formatter.resolvedOptions.bind(formatter);
    formatter.resolvedOptions = () => ({ ...realResolved(), timeZone });
    return formatter;
  }) as unknown as typeof Intl.DateTimeFormat);
  return () => spy.mockRestore();
}
