// extractPageText in a worker thread, so no page can stall or crash the pipeline. The in-parse
// limits in extractPageText refuse the known pathological shapes quickly; this is the backstop for
// the ones they do not meter (an adoption-agency cycle with 2 MB of children took about 100 s, one
// tag with 60,000 attributes 5.9 s, and formatting reconstruction once exhausted the heap). A
// worker that has not answered in time, runs out of heap, or fails in any other way yields '', so
// the quote check fails and the draft is dropped, never verified.
import { Worker } from 'node:worker_threads';

// Measured from the start of the call, including worker start (about 0.1 to 0.2 s). The largest
// allowlisted page measured parses in about 0.15 s.
export const PAGE_PARSE_TIMEOUT_MS = 2000;
const PAGE_PARSE_MAX_HEAP_MB = 256;
const WORKER_URL = new URL('./pageTextWorker.ts', import.meta.url);

export type PageParseLimits = { timeoutMs?: number; maxHeapMb?: number };

export async function extractPageTextIsolated(
    body: string,
    contentType: string,
    { timeoutMs = PAGE_PARSE_TIMEOUT_MS, maxHeapMb = PAGE_PARSE_MAX_HEAP_MB }: PageParseLimits = {},
): Promise<string> {
    return new Promise((resolve) => {
        let settled = false;
        const worker = new Worker(WORKER_URL, {
            resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
            workerData: { body, contentType },
        });
        function settle(text: string): void {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            void worker.terminate();
            resolve(text);
        }
        const timer = setTimeout(() => {
            console.warn('page parse timed out; treating the page as having no visible text', { timeoutMs });
            settle('');
        }, timeoutMs);
        worker.once('message', (text: unknown) => settle(typeof text === 'string' ? text : ''));
        worker.once('error', (error) => {
            console.warn('page parse worker failed; treating the page as having no visible text', error);
            settle('');
        });
        worker.once('exit', () => settle(''));
    });
}
