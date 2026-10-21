// The expo-constants stand-in jest.setup.ts installs for every suite. A suite
// that needs other build-time values calls setExpoExtra at module scope with
// the whole extra it wants, as its own jest.mock factory used to supply; the
// app reads extra at call time, so the replacement is seen by every request.
// The value lives on the suite's global (one per test file under Jest), so a
// jest.resetModules() in the suite keeps it, as a re-run factory would have.
type ExpoExtra = Record<string, unknown>;
type ExtraStore = { extra: ExpoExtra };

const DEFAULT_EXTRA: ExpoExtra = { contentBaseUrl: 'https://example.test/content/' };
const STORE_KEY = Symbol.for('syntactical.test.expoExtra');

const store: ExtraStore = ((globalThis as Record<symbol, unknown>)[STORE_KEY] ??= {
  extra: { ...DEFAULT_EXTRA },
}) as ExtraStore;

export const expoConstantsMock = {
  get expoConfig(): { extra: ExpoExtra } {
    return { extra: store.extra };
  },
};

export function setExpoExtra(extra: ExpoExtra): void {
  store.extra = extra;
}
