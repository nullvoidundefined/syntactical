// Pins the import-time database skip decision across Docker and database URL settings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAVED_KEYS = ['SKIP_DOCKER_TESTS', 'TEST_DATABASE_URL'] as const;

describe('SKIP_DATABASE_TESTS', () => {
  const saved: Partial<Record<(typeof SAVED_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of SAVED_KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SAVED_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('skips only when Docker tests are disabled and no database URL is supplied', async () => {
    for (const skipDockerTests of [undefined, '', '0', 'true', '1']) {
      for (const databaseUrl of [undefined, '', 'postgresql://localhost/test']) {
        if (skipDockerTests === undefined) {
          delete process.env.SKIP_DOCKER_TESTS;
        } else {
          process.env.SKIP_DOCKER_TESTS = skipDockerTests;
        }
        if (databaseUrl === undefined) {
          delete process.env.TEST_DATABASE_URL;
        } else {
          process.env.TEST_DATABASE_URL = databaseUrl;
        }

        vi.resetModules();
        const { SKIP_DATABASE_TESTS } = await import('../integration/skipDatabaseTests.js');

        expect(SKIP_DATABASE_TESTS, JSON.stringify({ skipDockerTests, databaseUrl })).toBe(
          skipDockerTests === '1' && !databaseUrl,
        );
      }
    }
  });
});
