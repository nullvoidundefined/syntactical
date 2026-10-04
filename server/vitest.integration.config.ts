// Vitest for the server's integration tests (npm run test:integration), which
// run against a real Postgres: globalSetup starts a throwaway local container,
// or uses the local database TEST_DATABASE_URL names (CI's service container).
// Each test creates its own scratch database, so files may run in parallel.
// The shared packages resolve to their TypeScript source, as in vitest.config.ts.
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const sourceOf = (name: string) => fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@syntactical/content-schema': sourceOf('content-schema'),
      '@syntactical/progress': sourceOf('progress'),
    },
  },
  test: {
    globalSetup: ['src/__tests__/integration/globalSetup.ts'],
    include: ['src/__tests__/migrations/**/*.test.ts', 'src/**/*.integration.test.ts'],
  },
});
