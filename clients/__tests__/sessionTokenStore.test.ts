// Native session store: the session value lives in expo-secure-store under
// one key, round-trips through write, read, and clear, and never touches
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

type SessionTokenStoreModule = typeof import("../sessionTokenStore");

function loadStore(): SessionTokenStoreModule {
  let loaded: SessionTokenStoreModule | undefined;
  jest.isolateModules(() => {
    loaded = require("../sessionTokenStore") as SessionTokenStoreModule;
  });
  if (!loaded) {
    throw new Error("expected the session store to load");
  }
  return loaded;
}

describe("sessionTokenStore on native", () => {
  beforeEach(() => {
    mockSecureValues.clear();
  });

  it("reads null when nothing is stored", async () => {
    const { readSessionToken } = loadStore();

    await expect(readSessionToken()).resolves.toBeNull();
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
      SESSION_TOKEN_KEY,
    );
  });

  it("writes the value to expo-secure-store under its key and reads it back", async () => {
    const { readSessionToken, writeSessionToken } = loadStore();
    const sessionValue = buildSessionValue();

    await writeSessionToken(sessionValue);

    // An options argument (keychain accessibility) is allowed; key and value are fixed.
    const [writtenKey, writtenValue] = mockSecureStore.setItemAsync.mock
      .calls[0] as unknown[];
    expect(writtenKey).toBe(SESSION_TOKEN_KEY);
    expect(writtenValue).toBe(sessionValue);
    expect(mockSecureValues.get(SESSION_TOKEN_KEY)).toBe(sessionValue);
    await expect(readSessionToken()).resolves.toBe(sessionValue);
  });

  it("clears the stored value with deleteItemAsync", async () => {
    const { clearSessionToken, readSessionToken } = loadStore();
    mockSecureValues.set(SESSION_TOKEN_KEY, buildSessionValue());

    await clearSessionToken();

    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
      SESSION_TOKEN_KEY,
    );
    expect(mockSecureValues.has(SESSION_TOKEN_KEY)).toBe(false);
    await expect(readSessionToken()).resolves.toBeNull();
  });

  it("never touches AsyncStorage", async () => {
    const { clearSessionToken, readSessionToken, writeSessionToken } =
      loadStore();

    await writeSessionToken(buildSessionValue());
    await readSessionToken();
    await clearSessionToken();

    expect(asyncStorageCallCount()).toBe(0);
  });
});
