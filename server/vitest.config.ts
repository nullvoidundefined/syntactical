// Vitest for this workspace package, run from its own directory; it keeps
// the repository root's config (which lists every workspace) out of play.
// The shared packages resolve to their TypeScript source, never a stale build.
// Integration tests need a real Postgres, so they run in
// vitest.integration.config.ts (npm run test:integration) instead: the
// migrations tests and every *.integration.test.ts file.
import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

const sourceOf = (name: string) => fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@syntactical/content-schema': sourceOf('content-schema'),
      '@syntactical/progress': sourceOf('progress'),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'src/__tests__/migrations/**', 'src/**/*.integration.test.ts'],
    include: ['src/**/*.test.ts'],
  },
});
