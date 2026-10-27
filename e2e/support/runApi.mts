// The e2e API process: the real server, started through startServer, with three test-only seams:
// an email client that appends each sign-in code to a file (E2E_CODES_FILE) instead of sending it;
// the test-only webhook (POST /v1/test/webhook), which the fixture purchase store posts synthetic
// RevenueCat events to; and a fake model that gives every ask and study note one fixed answer, so
// no model key is needed. The codes file lives in the run's private state directory (mode 0700
// from mkdtemp; the file is 0600). startServer refuses every seam unless NODE_ENV is test, which
// the global setup sets, and this is the only caller that asks for the test-only webhook.
import { appendFileSync, writeFileSync } from 'node:fs';

import { startServer } from '../../server/src/startServer.js';
import { createFakeModelProvider } from '../../server/src/testing/fakeModelProvider.js';

const CODES_FILE_MODE = 0o600;
const FIXTURE_ANSWER = 'This is the e2e model answer.';

function readCodesFile(): string {
  const file = process.env.E2E_CODES_FILE;
  if (file === undefined || file === '') throw new Error('E2E_CODES_FILE is not set');
  return file;
}

const codesFile = readCodesFile();
writeFileSync(codesFile, '', { mode: CODES_FILE_MODE });

const running = await startServer(process.env, {
  emailClient: {
    sendSignInCode(email, code) {
      appendFileSync(codesFile, `${JSON.stringify({ code, email })}\n`);
      return Promise.resolve();
    },
  },
  modelProvider: createFakeModelProvider({ answer: FIXTURE_ANSWER }),
  testWebhook: true,
});

function shutDown(): void {
  void running.close().finally(() => process.exit(0));
}
process.once('SIGTERM', shutDown);
process.once('SIGINT', shutDown);
