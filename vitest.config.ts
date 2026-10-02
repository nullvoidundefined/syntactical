// Vitest runs the workspace packages' suites from the repository root (the
// app's own tests run under Jest). The TDD harness resolves the hoisted root
// Vitest, so this keeps its runs scoped to workspace tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'pipeline/src/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
