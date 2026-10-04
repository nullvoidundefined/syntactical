// The Syntactical API: auth, answer event sync, entitlements, account deletion, and paid banks.
import { pathToFileURL } from 'node:url';

import { createLogger } from './clients/logger.js';
import { startServer } from './startServer.js';

export const PACKAGE_NAME = '@syntactical/server';

async function main(): Promise<void> {
  const logger = createLogger({ destination: process.stdout });
  let running: Awaited<ReturnType<typeof startServer>>;
  try {
    running = await startServer(process.env, { logger });
  } catch (error) {
    // The message names variables or files, never values: loadEnv reports names only, and a
    // bank error reports a path.
    const { message, name } = error as Error;
    logger.fatal({ errorName: name, reason: message }, 'server failed to start');
    process.exitCode = 1;
    return;
  }
  process.once('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    running.close().then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        logger.error({ errorName: error instanceof Error ? error.name : typeof error }, 'shutdown failed');
        process.exitCode = 1;
      },
    );
  });
}

// Runs only as the entrypoint, so importing this module (the package test does) starts nothing.
const [, entry] = process.argv;
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
