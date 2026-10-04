// The test-only email client seam: startServer accepts an injected email client only when
// NODE_ENV is exactly `test`, and refuses before it reads anything else or opens a database
// connection. The e2e suite uses it to capture sign-in codes; production can never enable it.
import { describe, expect, it } from 'vitest';

import type { EmailClient } from '../clients/emailTypes.js';
import { startServer } from '../startServer.js';

const GUARD_MESSAGE = 'An injected email client is allowed only when NODE_ENV is test';

function createCapturingClient(): EmailClient {
  return { sendSignInCode: () => Promise.resolve() };
}

describe('startServer emailClient option', () => {
  it.each([['production'], ['development'], [undefined]])(
    'refuses an injected email client when NODE_ENV is %s',
    async (nodeEnv) => {
      const source: NodeJS.ProcessEnv = { DATABASE_URL: 'postgres://postgres@127.0.0.1:1/none' };
      if (nodeEnv !== undefined) source.NODE_ENV = nodeEnv;
      await expect(startServer(source, { emailClient: createCapturingClient() })).rejects.toThrow(GUARD_MESSAGE);
    },
  );
});
