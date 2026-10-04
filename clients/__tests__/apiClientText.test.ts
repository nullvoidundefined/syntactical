// apiFetch with responseType 'text' returns the body exactly as received, so a
// paid bank's bytes can be checked against the manifest hash; the default still
// parses JSON.
import { apiFetch } from "../apiClient";

import { installFetch } from "./apiTestSupport";

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { apiBaseUrl: "https://api.syntactical.dev/v1/" } },
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

// Pretty-printed with a trailing newline, so a parse and re-serialize would change it.
const BANK_TEXT = '{\n  "schemaVersion": 2,\n  "questions": []\n}\n';

describe("apiFetch responseType", () => {
  it("returns the raw body text unchanged with responseType text", async () => {
    installFetch({ text: BANK_TEXT });

    const { body, status } = await apiFetch("banks/python/medium", { responseType: "text" });

    expect(status).toBe(200);
    expect(body).toBe(BANK_TEXT);
  });

  it("parses JSON by default", async () => {
    installFetch({ text: BANK_TEXT });

    const { body } = await apiFetch("banks/python/medium");

    expect(body).toEqual({ questions: [], schemaVersion: 2 });
  });
});
