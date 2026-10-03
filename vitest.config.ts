// Vitest runs the workspace packages' suites from the repository root (the
// app's own tests run under Jest). The TDD harness resolves the hoisted root
// Vitest, so this keeps its runs scoped to workspace tests. The shared
// packages resolve to their TypeScript source, so tests never read a stale build.
// The server's integration tests run here too, so globalSetup provides them a
// throwaway local Postgres (server/vitest.integration.config.ts runs them alone).
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const sourceOf = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@syntactical/content-schema': sourceOf('content-schema'),
      '@syntactical/progress': sourceOf('progress'),
    },
  },
  test: {
    globalSetup: ['server/src/__tests__/integration/globalSetup.ts'],
    include: ['packages/*/src/**/*.test.ts', 'pipeline/src/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
