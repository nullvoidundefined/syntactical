// Native transport for apiFetch: X-Client: native, the Bearer Authorization
// header only when expo-secure-store holds a session value, never
// credentials: 'include', JSON in and out, a fetch rejection as
// ApiUnavailable, and a 401 that clears the stored value and notifies
// onUnauthorized handlers.
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

describe("apiFetch on native", () => {
  beforeEach(() => {
    mockSecureValues.clear();
  });

  it("sends X-Client: native and the Bearer Authorization header with the stored session value", async () => {
    const sessionValue = buildSessionValue();
    mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
    const fetchMock = installFetch({ text: "{}" });
    const { apiFetch } = loadClient();

    await apiFetch("answer-events");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = recordedRequest(fetchMock);
    expect(request.url).toBe(`${PINNED_API_BASE_URL}answer-events`);
    expect(request.headers["x-client"]).toBe("native");
    expect(request.headers.authorization).toBe(`Bearer ${sessionValue}`);
    expect(request.init.credentials).not.toBe("include");
    expect(request.headers["x-requested-with"]).toBeUndefined();
  });

  it("sends no Authorization header when the session store holds no value", async () => {
    const fetchMock = installFetch({ text: "{}" });
    const { apiFetch } = loadClient();

    await apiFetch("answer-events");

    const request = recordedRequest(fetchMock);
    expect(request.headers["x-client"]).toBe("native");
    expect(request.headers).not.toHaveProperty("authorization");
    expect(request.init.credentials).not.toBe("include");
  });

  it("reads the session value from expo-secure-store and never from AsyncStorage", async () => {
    mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
    installFetch({ text: "{}" });
    const { apiFetch } = loadClient();

    await apiFetch("answer-events");

    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
      SESSION_TOKEN_KEY,
    );
    expect(asyncStorageCallCount()).toBe(0);
  });

  it("JSON-encodes a body with Content-Type: application/json and returns the status and parsed JSON body", async () => {
    const fetchMock = installFetch({
      status: 200,
      text: '{"events":[{"eventId":"e1"}],"nextCursor":null}',
    });
    const { apiFetch } = loadClient();
    const payload = { email: "reader@example.test", attempts: [1, 2] };

    const response = await apiFetch("auth/codes", {
      method: "POST",
      body: payload,
    });

    const request = recordedRequest(fetchMock);
    expect(request.init.method).toBe("POST");
    expect(typeof request.init.body).toBe("string");
    expect(JSON.parse(request.init.body as string)).toEqual(payload);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers.accept).toBe("application/json");
    expect(response).toEqual({
      status: 200,
      body: { events: [{ eventId: "e1" }], nextCursor: null },
    });
  });

  it("returns a null body when the response body is empty", async () => {
    installFetch({ status: 204, text: "" });
    const { apiFetch } = loadClient();

    const response = await apiFetch("auth/sessions/current", {
      method: "DELETE",
    });

    expect(response).toEqual({ status: 204, body: null });
  });

  it("returns a null body when the response body is not JSON", async () => {
    installFetch({
      status: 502,
      text: "<html>bad gateway</html>",
      contentType: "text/html",
    });
    const { apiFetch } = loadClient();

    const response = await apiFetch("answer-events");

    expect(response).toEqual({ status: 502, body: null });
  });

  it("turns a fetch rejection into ApiUnavailable", async () => {
    installRejectingFetch();
    const { apiFetch, ApiUnavailable } = loadClient();

    const outcome = await settle(apiFetch("answer-events"));

    expect(outcome.error).toBeInstanceOf(ApiUnavailable);
    expect(outcome.error).toMatchObject({ name: "ApiUnavailable" });
  });

  it("clears the stored session value and calls onUnauthorized handlers on a 401", async () => {
    mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
    installFetch({ status: 401, text: '{"error":"unauthorized"}' });
    const { apiFetch, onUnauthorized } = loadClient();
    const firstHandler = jest.fn();
    const secondHandler = jest.fn();
    onUnauthorized(firstHandler);
    onUnauthorized(secondHandler);

    await settle(apiFetch("answer-events"));

    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
      SESSION_TOKEN_KEY,
    );
    expect(mockSecureValues.has(SESSION_TOKEN_KEY)).toBe(false);
    expect(firstHandler).toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalled();
  });

  it("sends no Authorization header on the request after a 401 cleared the session", async () => {
    const sessionValue = buildSessionValue();
    mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
    const rejectedFetch = installFetch({ status: 401, text: "" });
    const { apiFetch } = loadClient();
    await settle(apiFetch("answer-events"));
    expect(recordedRequest(rejectedFetch).headers.authorization).toBe(
      `Bearer ${sessionValue}`,
    );

    const nextFetch = installFetch({ text: "{}" });
    await apiFetch("answer-events");

    expect(recordedRequest(nextFetch).headers).not.toHaveProperty(
      "authorization",
    );
  });

  it("stops calling a handler after its unsubscribe function runs", async () => {
    installFetch({ status: 401, text: "" });
    const { apiFetch, onUnauthorized } = loadClient();
    const removedHandler = jest.fn();
    const keptNotices: unknown[] = [];
    const keptHandler = jest.fn((info: unknown) => {
      keptNotices.push(info);
    });
    const unsubscribe = onUnauthorized(removedHandler);
    onUnauthorized(keptHandler);
    unsubscribe();

    await settle(apiFetch("answer-events"));

    expect(removedHandler).not.toHaveBeenCalled();
    expect(keptHandler).toHaveBeenCalled();
    // The kept handler receives exactly one notice, naming the first request.
    expect(keptNotices).toEqual([{ requestSeq: 1 }]);
  });

  it.each([200, 403, 500])(
    "keeps the stored session value and calls no handler on a %s response",
    async (status) => {
      const sessionValue = buildSessionValue();
      mockSecureValues.set(SESSION_TOKEN_KEY, sessionValue);
      installFetch({ status, text: "{}" });
      const { apiFetch, onUnauthorized } = loadClient();
      const handler = jest.fn();
      onUnauthorized(handler);

      await settle(apiFetch("answer-events"));

      expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(sessionValue);
      expect(handler).not.toHaveBeenCalled();
    },
  );
});
