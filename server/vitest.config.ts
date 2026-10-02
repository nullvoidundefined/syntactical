// Vitest for this workspace package, run from its own directory; it keeps
// the repository root's config (which lists every workspace) out of play.
// The shared packages resolve to their TypeScript source, never a stale build.
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
  test: { include: ['src/**/*.test.ts'] },
});
