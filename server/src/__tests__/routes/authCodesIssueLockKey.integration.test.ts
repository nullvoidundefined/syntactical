// B-3.3 security round 2: the advisory lock that serializes code issues per email is keyed by
// a 64-bit hash of the normalized email (hashtextextended), not the 32-bit hashtext, whose
// collisions an attacker could find offline to stall a victim's issue. While a send is held,
// pg_locks shows the issue's advisory lock under exactly the 64-bit key.
import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const HTTP_ACCEPTED = 202;
const SETUP_TIMEOUT_MS = 120_000;
const EMAIL_BYTES = 6;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

// A gate the send waits on: reached resolves when the send starts, open() lets it finish.
function createGate() {
  let open = (): void => undefined;
  let markReached = (): void => undefined;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    open: () => open(),
    reached,
    async wait(): Promise<void> {
      markReached();
      await opened;
    },
  };
}

describe.skipIf(SKIP_DATABASE_TESTS)('the per-email issue lock', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('is held under the 64-bit hashtextextended key of the normalized email', async () => {
    const gate = createGate();
    const { app } = createAuthTestApp({ pool: database.pool, sendSignInCode: () => gate.wait() });
    const email = `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;

    const issuing = request(app).post(CODES_ROUTE).send({ email: ` ${email.toUpperCase()}` }).then((response) => response);
    await gate.reached;
    const { rows } = await database.pool.query<{ held: string; wanted: string }>(
      `SELECT ((classid::bigint << 32) | objid::bigint)::text AS held,
              hashtextextended($1, 0)::text AS wanted
       FROM pg_locks
       WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      [email],
    );
    gate.open();
    const response = await issuing;

    expect(response.status).toBe(HTTP_ACCEPTED);
    expect(rows).toHaveLength(1);
    const [{ held, wanted }] = rows;
    expect(held).toBe(wanted);
  });
});
