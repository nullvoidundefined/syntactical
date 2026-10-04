// IAN-626: every connection the pool opens ends a session left idle inside a transaction.
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabasePool, IDLE_IN_TRANSACTION_TIMEOUT_MS } from '../../clients/createDatabasePool.js';
import { createScratchDatabase } from '../integration/createScratchDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;
const SETUP_TIMEOUT_MS = 120_000;
const MS_PER_SECOND = 1000;

describe.skipIf(SKIP_DATABASE_TESTS)('createDatabasePool against a real database', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    scratch = await createScratchDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.drop();
  }, SETUP_TIMEOUT_MS);

  it('sets idle_in_transaction_session_timeout on a new connection before its first query', async () => {
    const pool = createDatabasePool(scratch.databaseUrl, 'test', pino({ level: 'silent' }));
    try {
      const { rows } = await pool.query<{ setting: string }>(
        "SELECT current_setting('idle_in_transaction_session_timeout') AS setting",
      );
      expect(rows[0]?.setting).toBe(`${IDLE_IN_TRANSACTION_TIMEOUT_MS / MS_PER_SECOND}s`);
    } finally {
      await pool.end();
    }
  });
});
