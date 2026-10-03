// Shared helpers for the API client transport and session store tests: a
// recording fetch with a configurable response, header normalisation that
// accepts a plain object, a Headers instance, or an entries array, and a
// session value built at run time so no credential-shaped literal sits in source.
import { randomBytes } from "node:crypto";

export const PINNED_API_BASE_URL = "https://api.syntactical.dev/v1/";
export const SESSION_TOKEN_KEY = "syntactical.session-token";

export type FakeResponseInit = {
  status?: number;
  text?: string;
  contentType?: string;
  // The final response URL; defaults to the URL the request was sent to.
  url?: string;
  redirected?: boolean;
  // text() rejects with this value, simulating a body stream that fails mid-read.
  textError?: unknown;
  // text() never settles, simulating a body read that stalls.
  isTextPending?: boolean;
};

export type RecordedRequest = {
  url: string;
  init: Record<string, unknown>;
  headers: Record<string, string>;
};

export function buildSessionValue(): string {
  return randomBytes(24).toString("hex");
}

export function buildFakeResponse(
  response: FakeResponseInit,
  requestUrl = "",
): unknown {
  const status = response.status ?? 200;
  const text = response.text ?? "";
  const contentType = response.contentType ?? "application/json";
  return {
    ok: status >= 200 && status < 300,
    status,
    url: response.url ?? requestUrl,
    redirected: response.redirected ?? false,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
      has: (name: string) => name.toLowerCase() === "content-type",
    },
    text: () => {
      if (response.isTextPending) {
        return new Promise<string>(() => {});
      }
      if (response.textError !== undefined) {
        return Promise.reject(response.textError);
      }
      return Promise.resolve(text);
    },
    json: () => Promise.resolve().then(() => JSON.parse(text) as unknown),
  };
}

export function installFetch(response: FakeResponseInit = {}): jest.Mock {
  const fetchMock = jest.fn((input: unknown) =>
    Promise.resolve(buildFakeResponse(response, String(input))),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function installRejectingFetch(): jest.Mock {
  const fetchMock = jest.fn(() =>
    Promise.reject(new TypeError("Network request failed")),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function normaliseHeaders(raw: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (raw === undefined || raw === null) {
    return headers;
  }
  if (Array.isArray(raw)) {
    for (const [name, value] of raw as Array<[string, string]>) {
      headers[name.toLowerCase()] = String(value);
    }
    return headers;
  }
  const maybeIterable = raw as { forEach?: unknown };
  if (typeof maybeIterable.forEach === "function") {
    (
      raw as { forEach(cb: (value: string, name: string) => void): void }
    ).forEach((value, name) => {
      headers[name.toLowerCase()] = String(value);
    });
    return headers;
  }
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value !== undefined) {
      headers[name.toLowerCase()] = String(value);
    }
  }
  return headers;
}

export function recordedRequest(
  fetchMock: jest.Mock,
  index = 0,
): RecordedRequest {
  const call = fetchMock.mock.calls[index] as unknown[] | undefined;
  if (!call) {
    throw new Error(`expected fetch call ${index} to exist`);
  }
  const init = (call[1] ?? {}) as Record<string, unknown>;
  return {
    url: String(call[0]),
    init,
    headers: normaliseHeaders(init.headers),
  };
}

// Awaits a promise and returns how it settled, so a test can assert side
// effects without fixing whether a 401 resolves or rejects.
export async function settle(
  promise: Promise<unknown>,
): Promise<{ value?: unknown; error?: unknown }> {
  try {
    return { value: await promise };
  } catch (error) {
    return { error };
  }
}

// Every jest.fn on the in-memory AsyncStorage mock, so a test can assert
// that no AsyncStorage method was touched.
export function asyncStorageCallCount(): number {
  const storage =
    require("@react-native-async-storage/async-storage") as Record<
      string,
      unknown
    >;
  const resolved = (storage.default ?? storage) as Record<string, unknown>;
  let count = 0;
  for (const member of Object.values(resolved)) {
    if (typeof member === "function" && "mock" in member) {
      count += (member as jest.Mock).mock.calls.length;
    }
  }
  return count;
}
