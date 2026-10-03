// Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line.
// The harness stays PID 1 and never runs user code. The oracle runs in a child process whose
// stdout and stderr are pipes the harness reads, so nothing the child writes or closes can
// forge or suppress the result line. The harness owns the timeout and SIGKILLs the child's
// process group.
import { spawn } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';

const OUTPUT_CAP_BYTES = 64 * 1024;
const STDERR_CAP_BYTES = 64 * 1024;
const VERSION = `Node ${process.version}`;
const FAILURE_EXIT_CODE = 70;
const UNSETTLED_EXIT_CODE = 13;
const SYNTAX_MARKER = '\u0000oracle-syntax-error';
const EXCEPTION_MARKER = '\u0000oracle-exception:';

function buildChildSource(code) {
    return `
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fail = (marker) => { process.stderr.write('\\n' + marker + '\\n', () => process.exit(${FAILURE_EXIT_CODE})); };
let compiled;
try {
    compiled = new AsyncFunction(${JSON.stringify(code)});
} catch (error) {
    if (error instanceof SyntaxError) { fail(${JSON.stringify(SYNTAX_MARKER)}); }
    else { throw error; }
}
if (compiled) {
    try {
        await compiled();
    } catch (error) {
        const name = error && typeof error === 'object' && error.name ? String(error.name) : 'Error';
        fail(${JSON.stringify(EXCEPTION_MARKER)} + name);
        await new Promise(() => {});
    }
}
`;
}

function finish(result) {
    writeSync(1, JSON.stringify({ ...result, runtimeVersion: VERSION }) + '\n');
    process.exit(0);
}

function classify(code, signal, out, err) {
    if (code === FAILURE_EXIT_CODE) {
        if (err.includes(SYNTAX_MARKER)) return { outcome: 'syntax-error' };
        const line = err
            .split('\n')
            .reverse()
            .find((candidate) => candidate.startsWith(EXCEPTION_MARKER));
        if (line) return { outcome: 'exception', exceptionType: line.slice(EXCEPTION_MARKER.length) };
    }
    if (code === UNSETTLED_EXIT_CODE) return { outcome: 'exception', exceptionType: 'UnsettledPromise' };
    if (signal !== null || code === 134 || code === 137 || /heap out of memory/.test(err)) {
        return { outcome: 'resource-limit' };
    }
    if (code !== 0) return { outcome: 'exception', exceptionType: 'RunnerFailure' };
    return { outcome: 'value', value: out.endsWith('\n') ? out.slice(0, -1) : out };
}

const payload = JSON.parse(readFileSync(0, 'utf8'));
const child = spawn(
    process.execPath,
    ['--max-old-space-size=160', '--input-type=module', '-e', buildChildSource(payload.code)],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
);

function killGroup() {
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        // group already gone
    }
    child.kill('SIGKILL');
}

const outChunks = [];
const errChunks = [];
let outSize = 0;
let errSize = 0;

setTimeout(() => {
    killGroup();
    finish({ outcome: 'timeout' });
}, payload.timeoutMs ?? 5000);

child.stdout.on('data', (chunk) => {
    outSize += chunk.length;
    if (outSize > OUTPUT_CAP_BYTES) {
        killGroup();
        finish({ outcome: 'resource-limit' });
    }
    outChunks.push(chunk);
});
child.stderr.on('data', (chunk) => {
    if (errSize < STDERR_CAP_BYTES) {
        errSize += chunk.length;
        errChunks.push(chunk);
    }
});
child.on('error', () => finish({ outcome: 'exception', exceptionType: 'RunnerFailure' }));
child.on('close', (code, signal) => {
    killGroup();
    finish(
        classify(
            code,
            signal,
            Buffer.concat(outChunks).toString('utf8'),
            Buffer.concat(errChunks).toString('utf8'),
        ),
    );
});
