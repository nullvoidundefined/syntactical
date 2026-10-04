// The e2e API process: the real server, started through startServer, with one test-only seam, an
// email client that appends each sign-in code to a file (E2E_CODES_FILE) instead of sending it.
// The file lives in the run's private state directory (mode 0700 from mkdtemp; the file is 0600).
// The seam is refused unless NODE_ENV is test, which the global setup sets.
import { appendFileSync, writeFileSync } from 'node:fs';

import { startServer } from '../../server/src/startServer.js';

const CODES_FILE_MODE = 0o600;

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
});

function shutDown(): void {
  void running.close().finally(() => process.exit(0));
}
process.once('SIGTERM', shutDown);
process.once('SIGINT', shutDown);
