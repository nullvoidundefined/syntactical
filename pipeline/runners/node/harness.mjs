// Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line.
// The oracle runs in a worker thread so a busy loop cannot stop the timer.
import { writeSync, readFileSync } from 'node:fs';
import { format } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const OUTPUT_CAP_BYTES = 64 * 1024;
const VERSION = `Node ${process.version}`;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function finish(result) {
    writeSync(1, JSON.stringify({ ...result, runtimeVersion: VERSION }) + '\n');
    process.exit(0);
}

async function runInWorker(code) {
    let compiled;
    try {
        compiled = new AsyncFunction(code);
    } catch (error) {
        if (error instanceof SyntaxError) {
            parentPort.postMessage({ outcome: 'syntax-error' });
            return;
        }
        throw error;
    }
    const lines = [];
    let size = 0;
    let exceeded = false;
    console.log = (...args) => {
        const line = format(...args);
        size += Buffer.byteLength(line) + 1;
        if (size > OUTPUT_CAP_BYTES) {
            exceeded = true;
            throw new Error('output limit');
        }
        lines.push(line);
    };
    try {
        await compiled();
    } catch (error) {
        if (!exceeded) {
            const name = error && typeof error === 'object' && error.name ? String(error.name) : 'Error';
            parentPort.postMessage({ outcome: 'exception', exceptionType: name });
            return;
        }
    }
    if (exceeded) {
        parentPort.postMessage({ outcome: 'resource-limit' });
        return;
    }
    parentPort.postMessage({ outcome: 'value', value: lines.join('\n') });
}

if (isMainThread) {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    setTimeout(() => finish({ outcome: 'timeout' }), payload.timeoutMs ?? 5000);
    process.on('SIGTERM', () => finish({ outcome: 'timeout' }));
    const worker = new Worker(new URL(import.meta.url), {
        workerData: { code: payload.code },
        resourceLimits: { maxOldGenerationSizeMb: 160 },
    });
    worker.on('message', (result) => finish(result));
    worker.on('error', (error) => {
        if (error && error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
            finish({ outcome: 'resource-limit' });
        }
        finish({ outcome: 'exception', exceptionType: error?.name ?? 'Error' });
    });
    worker.on('exit', () => finish({ outcome: 'exception', exceptionType: 'UnsettledPromise' }));
} else {
    runInWorker(workerData.code);
}
