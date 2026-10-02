// Vitest for this workspace package, run from its own directory; it keeps
// the repository root's config (which lists every workspace) out of play.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
