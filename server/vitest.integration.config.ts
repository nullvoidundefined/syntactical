// Vitest for the server's integration tests (npm run test:integration), which
// run against a real Postgres: globalSetup starts a throwaway local container,
// or uses the local database TEST_DATABASE_URL names (CI's service container).
// Each test creates its own scratch database, so files may run in parallel.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['src/__tests__/integration/globalSetup.ts'],
    include: ['src/__tests__/migrations/**/*.test.ts', 'src/**/*.integration.test.ts'],
  },
});
