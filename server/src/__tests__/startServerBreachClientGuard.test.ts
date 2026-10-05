// B-71 (Task 7.3): production startup fails when the fake password breach client is configured,
// so a deployed server can never skip the real breach check. The guard runs before startup reads
// anything else or opens a database connection, like the email client guard.
import { describe, expect, it } from 'vitest';

import { createFakePasswordBreachClient } from '../clients/fakePasswordBreachClient.js';
import { startServer } from '../startServer.js';

const GUARD_MESSAGE = /fake password breach client/i;

describe('startServer passwordBreachClient option', () => {
  it('refuses the fake breach client when NODE_ENV is production', async () => {
    const source: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgres://postgres@127.0.0.1:1/none',
      NODE_ENV: 'production',
    };

    await expect(startServer(source, { passwordBreachClient: createFakePasswordBreachClient({}) })).rejects.toThrow(
      GUARD_MESSAGE,
    );
  });
});
