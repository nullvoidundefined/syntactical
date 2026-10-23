// Production startup fails when a fake model provider is injected, so a deployed server can never
// answer POST /v1/ask from a test double. The guard runs before startup reads anything else or
// opens a database connection, like the email and breach client guards.
import { describe, expect, it } from 'vitest';

import { createFakeModelProvider } from '../testing/fakeModelProvider.js';
import { startServer } from '../startServer.js';

const GUARD_MESSAGE = /injected model provider/i;

describe('startServer modelProvider option', () => {
  it.each([['development'], ['production'], [undefined]])(
    'refuses an injected model provider when NODE_ENV is %s',
    async (nodeEnv) => {
      const source: NodeJS.ProcessEnv = { DATABASE_URL: 'postgres://postgres@127.0.0.1:1/none' };
      if (nodeEnv !== undefined) source.NODE_ENV = nodeEnv;

      await expect(startServer(source, { modelProvider: createFakeModelProvider() })).rejects.toThrow(GUARD_MESSAGE);
    },
  );
});
