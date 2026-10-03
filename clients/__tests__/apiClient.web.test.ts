// Web transport for apiFetch: credentials: 'include' and
// X-Requested-With: XMLHttpRequest, no X-Client or Authorization header, and
// no session value read or written (expo-secure-store and AsyncStorage
// untouched), including on a 401, which still notifies onUnauthorized handlers.
import {
  PINNED_API_BASE_URL,
  SESSION_TOKEN_KEY,
  asyncStorageCallCount,
  buildSessionValue,
  installFetch,
  installRejectingFetch,
  recordedRequest,
  settle,
} from "./apiTestSupport";

const mockSecureValues = new Map<string, string>();

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { apiBaseUrl: "https://api.syntactical.dev/v1/" } },
}));

// One shared mock object, so the module registry that apiFetch loads in and
// the test body see the same jest.fn instances.
const mockSecureStore = {
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(mockSecureValues.get(key) ?? null),
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureValues.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureValues.delete(key);
    return Promise.resolve();
  }),
};

jest.mock("expo-secure-store", () => mockSecureStore);

type ApiClientModule = typeof import("../apiClient");
type OnUnauthorizedModule = typeof import("../onUnauthorized");
type ApiUnavailableModule = typeof import("../ApiUnavailable");

type LoadedClient = {
  apiFetch: ApiClientModule["apiFetch"];
  onUnauthorized: OnUnauthorizedModule["onUnauthorized"];
  ApiUnavailable: ApiUnavailableModule["ApiUnavailable"];
};

function loadClient(): LoadedClient {
  let loaded: LoadedClient | undefined;
  jest.isolateModules(() => {
    const client = require("../apiClient") as ApiClientModule;
    const unauthorized = require("../onUnauthorized") as OnUnauthorizedModule;
    const errors = require("../ApiUnavailable") as ApiUnavailableModule;
    loaded = {
      apiFetch: client.apiFetch,
      onUnauthorized: unauthorized.onUnauthorized,
      ApiUnavailable: errors.ApiUnavailable,
    };
  });
  if (!loaded) {
    throw new Error("expected the API client to load");
  }
  return loaded;
}

function expectNoSessionStorageTouched(): void {
  expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(asyncStorageCallCount()).toBe(0);
}

describe("apiFetch on web", () => {
  beforeEach(() => {
    mockSecureValues.clear();
  });

  it("sends credentials: 'include' and X-Requested-With: XMLHttpRequest", async () => {
    const fetchMock = installFetch({ text: "{}" });
    const { apiFetch } = loadClient();

    await apiFetch("answer-events");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = recordedRequest(fetchMock);
    expect(request.url).toBe(`${PINNED_API_BASE_URL}answer-events`);
    expect(request.init.credentials).toBe("include");
    expect(request.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(request.headers).not.toHaveProperty("x-client");
  });

  it("sends no Authorization header and reads no session value even when secure storage holds one", async () => {
    mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
    const fetchMock = installFetch({ text: "{}" });
    const { apiFetch } = loadClient();

    await apiFetch("answer-events");

    const request = recordedRequest(fetchMock);
    expect(request.init.credentials).toBe("include");
    expect(request.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(request.headers).not.toHaveProperty("authorization");
    expectNoSessionStorageTouched();
  });

  it("JSON-encodes a body with Content-Type: application/json and parses the JSON response", async () => {
    const fetchMock = installFetch({ status: 201, text: '{"accepted":2}' });
    const { apiFetch } = loadClient();
    const payload = { events: [{ eventId: "e1" }, { eventId: "e2" }] };

    const response = await apiFetch("answer-events", {
      method: "POST",
      body: payload,
    });

    const request = recordedRequest(fetchMock);
    expect(JSON.parse(request.init.body as string)).toEqual(payload);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.init.credentials).toBe("include");
    expect(response).toEqual({ status: 201, body: { accepted: 2 } });
  });

  it("returns a null body when the response body is empty", async () => {
    installFetch({ status: 204, text: "" });
    const { apiFetch } = loadClient();

    const response = await apiFetch("auth/sessions/current", {
      method: "DELETE",
    });

    expect(response).toEqual({ status: 204, body: null });
  });

  it("turns a fetch rejection into ApiUnavailable", async () => {
    installRejectingFetch();
    const { apiFetch, ApiUnavailable } = loadClient();

    const outcome = await settle(apiFetch("answer-events"));

    expect(outcome.error).toBeInstanceOf(ApiUnavailable);
  });

  it("calls onUnauthorized handlers on a 401 without touching session storage", async () => {
    const sessionValue = buildSessionValue();
    mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
    installFetch({ status: 401, text: '{"error":"unauthorized"}' });
    const { apiFetch, onUnauthorized } = loadClient();
    const handler = jest.fn();
    onUnauthorized(handler);

    await settle(apiFetch("answer-events"));

    expect(handler).toHaveBeenCalled();
    expectNoSessionStorageTouched();
    // The web build never clears a stored value: the cookie is the session.
    expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(sessionValue);
  });

  it("calls no onUnauthorized handler on a 403", async () => {
    installFetch({ status: 403, text: "{}" });
    const { apiFetch, onUnauthorized } = loadClient();
    const handler = jest.fn();
    onUnauthorized(handler);

    const outcome = await settle(apiFetch("answer-events"));

    expect(handler).not.toHaveBeenCalled();
    // A 403 reaches the caller as an ordinary response.
    expect(outcome).toEqual({ value: { status: 403, body: {} } });
  });
});
