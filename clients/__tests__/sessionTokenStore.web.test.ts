// Web session store: a no-op. The cookie carries the session on web, so
// read always returns null and nothing reaches expo-secure-store or
// AsyncStorage.
import {
  SESSION_TOKEN_KEY,
  asyncStorageCallCount,
  buildSessionValue,
} from "./apiTestSupport";

const mockSecureValues = new Map<string, string>();

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

type SessionTokenStoreModule = {
  readSessionToken: typeof import("../readSessionToken")["readSessionToken"];
  writeSessionToken: typeof import("../writeSessionToken")["writeSessionToken"];
  clearSessionToken: typeof import("../clearSessionToken")["clearSessionToken"];
};

function loadStore(): SessionTokenStoreModule {
  let loaded: SessionTokenStoreModule | undefined;
  jest.isolateModules(() => {
    loaded = {
      readSessionToken: (
        require("../readSessionToken") as typeof import("../readSessionToken")
      ).readSessionToken,
      writeSessionToken: (
        require("../writeSessionToken") as typeof import("../writeSessionToken")
      ).writeSessionToken,
      clearSessionToken: (
        require("../clearSessionToken") as typeof import("../clearSessionToken")
      ).clearSessionToken,
    };
  });
  if (!loaded) {
    throw new Error("expected the session store to load");
  }
  return loaded;
}

describe("sessionTokenStore on web", () => {
  beforeEach(() => {
    mockSecureValues.clear();
  });

  it("reads null even when secure storage holds a value", async () => {
    mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());
    const { readSessionToken } = loadStore();

    await expect(readSessionToken()).resolves.toBeNull();
    expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("writes and clears without touching expo-secure-store or AsyncStorage", async () => {
    const { clearSessionToken, readSessionToken, writeSessionToken } =
      loadStore();

    await writeSessionToken(buildSessionValue());
    await expect(readSessionToken()).resolves.toBeNull();
    await clearSessionToken();

    expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockSecureValues.size).toBe(0);
    expect(asyncStorageCallCount()).toBe(0);
  });
});
