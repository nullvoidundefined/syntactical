// The worker side of extractPageTextIsolated: extract one page's visible text and post it back.
// It imports with a .ts extension because a worker is loaded by Node itself (type stripping under
// Vitest, tsx's hooks under the CLI), not by the bundler that maps .js to .ts.
import { parentPort, workerData } from 'node:worker_threads';

import { extractPageText } from './extractPageText.ts';

const { body, contentType } = workerData as { body: string; contentType: string };
parentPort?.postMessage(extractPageText(body, contentType));
