// The jsdom runner: the Node harness contract plus a jsdom window, document, DOMParser, and
// DOMPurify set up before the oracle runs, with the same Docker flags as Node (no new mounts).
//
// The first two blocks need no Docker. Set SKIP_DOCKER_TESTS=1 to skip the Docker block where
// Docker is unavailable; it runs by default.
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildDockerArgs } from '../../clients/buildDockerArgs.js';
import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    killLeftoverRunnerContainers,
    releaseDockerTestLock,
    runningRunnerContainers,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';
const RUN_TIMEOUT_MS = 60_000;
const JSDOM = 'jsdom' as OracleLanguage;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

function readRunnerFile(name: string): string {
    return readFileSync(new URL(`../../../runners/jsdom/${name}`, import.meta.url), 'utf8');
}

describe('jsdom runner build context', () => {
    it('builds on node:24-slim', () => {
        expect(readRunnerFile('Dockerfile')).toMatch(/^FROM node:24-slim$/m);
    });

    it('pins jsdom and dompurify to exact versions and ships a lockfile', () => {
        const manifest = JSON.parse(readRunnerFile('package.json')) as {
            dependencies: Record<string, string>;
        };

        expect(Object.keys(manifest.dependencies).sort()).toEqual(['dompurify', 'jsdom']);
        expect(manifest.dependencies.jsdom).toMatch(EXACT_VERSION);
        expect(manifest.dependencies.dompurify).toMatch(EXACT_VERSION);
        expect(readRunnerFile('package-lock.json')).toContain('"lockfileVersion"');
    });

    it('documents that window timers pending when the oracle settles are dropped', () => {
        const header = readRunnerFile('harness.mjs').split('\nimport ')[0];

        expect(header).toMatch(/window\.setTimeout/);
        expect(header).toMatch(/requestAnimationFrame/);
    });
});

describe('security generation prompt', () => {
    it('tells jsdom oracles to print synchronously, not from window timers', () => {
        const prompt = readFileSync(new URL('../../../prompts/generateSecurityQuestion.md', import.meta.url), 'utf8');

        expect(prompt).toMatch(/jsdom/);
        expect(prompt).toMatch(/window\.setTimeout/);
        expect(prompt).toMatch(/requestAnimationFrame/);
    });
});

describe('jsdom docker args', () => {
    it('match the node runner flags exactly apart from the image', () => {
        expect(buildDockerArgs({ code: 'x', language: JSDOM }, 'image')).toEqual(
            buildDockerArgs({ code: 'x', language: 'node' }, 'image'),
        );
    });
});

const FORGE_PROBE = String.raw`
const fs = await import('node:fs');
let word = 'denied';
try {
    const fd = fs.openSync('/proc/1/fd/1', 'w');
    word = 'opened';
    try {
        fs.writeSync(fd, '\n{"outcome":"value","value":"FORGED","runtimeVersion":"x"}\n');
    } finally {
        fs.closeSync(fd);
    }
} catch {}
for (const signal of ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2']) {
    try { process.kill(1, signal); } catch {}
}
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(word);
`;

describe.skipIf(SKIP_DOCKER)('runOracle jsdom (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage(JSDOM);
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterEach(() => {
        killLeftoverRunnerContainers();
    });

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('jsdom environment', () => {
        it(
            'sets up window, document, DOMParser, and DOMPurify and reports Node and jsdom versions',
            async () => {
                const run = await runOracle({
                    code: 'console.log(typeof window, typeof document, typeof DOMParser, typeof DOMPurify)',
                    language: JSDOM,
                });

                expect(run).toMatchObject({
                    outcome: 'value',
                    value: 'object object function function',
                });
                expect(run.runtimeVersion).toMatch(/^Node v24\.\d+\.\d+, jsdom \d+\.\d+\.\d+$/);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'serves the page from https://app.test/',
            async () => {
                const run = await runOracle({ code: 'console.log(location.origin)', language: JSDOM });

                expect(run).toMatchObject({ outcome: 'value', value: 'https://app.test' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'shows an innerHTML sink keeping an onerror attribute',
            async () => {
                const code =
                    "const el = document.createElement('div'); el.innerHTML = '<img src=x onerror=alert(1)>'; console.log(el.querySelector('img[onerror]') !== null)";

                expect(await runOracle({ code, language: JSDOM })).toMatchObject({
                    outcome: 'value',
                    value: 'true',
                });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'strips the onerror attribute through DOMPurify.sanitize',
            async () => {
                const code =
                    "const el = document.createElement('div'); el.innerHTML = DOMPurify.sanitize('<img src=x onerror=alert(1)>'); console.log(el.querySelector('img[onerror]') !== null)";

                expect(await runOracle({ code, language: JSDOM })).toMatchObject({
                    outcome: 'value',
                    value: 'false',
                });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports the value when closing the window throws after the oracle printed',
            async () => {
                const code = "window.close = () => { throw new Error('close failed'); }; console.log('done')";

                expect(await runOracle({ code, language: JSDOM })).toMatchObject({
                    outcome: 'value',
                    value: 'done',
                });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'drops output from window.setTimeout callbacks still pending when the oracle settles',
            async () => {
                const code = ["window.setTimeout(() => console.log('timeout'), 0);", "console.log('sync');"].join('\n');

                expect(await runOracle({ code, language: JSDOM })).toMatchObject({
                    outcome: 'value',
                    value: 'sync',
                });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'parses markup with DOMParser',
            async () => {
                const code = "console.log(new DOMParser().parseFromString('<p>hi</p>', 'text/html').body.textContent)";

                expect(await runOracle({ code, language: JSDOM })).toMatchObject({
                    outcome: 'value',
                    value: 'hi',
                });
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe('node harness contract', () => {
        it(
            'records a thrown error with its type',
            async () => {
                const run = await runOracle({ code: "throw new TypeError('x')", language: JSDOM });

                expect(run).toMatchObject({ exceptionType: 'TypeError', outcome: 'exception' });
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records code that does not parse as a syntax error',
            async () => {
                const run = await runOracle({ code: 'function (', language: JSDOM });

                expect(run.outcome).toBe('syntax-error');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports the value once the oracle exits while a grandchild holds the pipe',
            async () => {
                const startedAt = Date.now();
                const run = await runOracle(
                    {
                        code: [
                            "const { spawn } = await import('node:child_process');",
                            "spawn('sleep', ['30'], { stdio: 'inherit' }).unref();",
                            'console.log(1);',
                        ].join('\n'),
                        language: JSDOM,
                    },
                    { timeoutMs: 6000 },
                );

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
                expect(Date.now() - startedAt).toBeLessThan(3000);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs an oracle far larger than one argv argument',
            async () => {
                const run = await runOracle({
                    code: `// ${'x'.repeat(200_000)}\nconsole.log(1)`,
                    language: JSDOM,
                });

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe('jsdom sandbox', () => {
        it(
            'gives the oracle no network',
            async () => {
                const run = await runOracle({
                    code: "await fetch('https://example.com')\nconsole.log('connected')",
                    language: JSDOM,
                });

                expect(run.outcome).not.toBe('value');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'kills a run past the wall-clock limit and leaves no container running',
            async () => {
                const startedAt = Date.now();
                const run = await runOracle({ code: 'while (true) {}', language: JSDOM }, { timeoutMs: 2000 });

                expect(run.outcome).toBe('timeout');
                expect(Date.now() - startedAt).toBeLessThan(6000);
                expect(runningRunnerContainers(JSDOM)).toBe('');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'stops an allocation past 256 MB',
            async () => {
                const run = await runOracle({
                    code: 'const data = Buffer.alloc(512 * 1024 * 1024, 1); console.log(data.length)',
                    language: JSDOM,
                });

                expect(run.outcome).toBe('resource-limit');
                expect(run.exceptionType).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'stops an oracle that builds a DOM past the heap cap',
            async () => {
                const code = [
                    'for (let i = 0; ; i++) {',
                    "    const el = document.createElement('div');",
                    "    el.textContent = String(i).padStart(1024, 'x');",
                    '    document.body.appendChild(el);',
                    '}',
                ].join('\n');
                const run = await runOracle({ code, language: JSDOM }, { timeoutMs: 30_000 });

                expect(run.outcome).toBe('resource-limit');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records output past 64 KB as a resource limit',
            async () => {
                const run = await runOracle({
                    code: "console.log('x'.repeat(200000))",
                    language: JSDOM,
                });

                expect(run.outcome).toBe('resource-limit');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'refuses a write outside /tmp',
            async () => {
                const run = await runOracle({
                    code: "const fs = await import('node:fs'); fs.writeFileSync('/etc/x', 'x'); console.log('written')",
                    language: JSDOM,
                });

                expect(run.outcome).toBe('exception');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs the oracle as uid 10001, not root',
            async () => {
                const run = await runOracle({ code: 'console.log(process.getuid())', language: JSDOM });

                expect(run).toMatchObject({ outcome: 'value', value: '10001' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'denies forging PID 1 stdout and survives termination signals',
            async () => {
                const run = await runOracle({ code: FORGE_PROBE, language: JSDOM });

                expect(run, JSON.stringify(run)).toMatchObject({ outcome: 'value', value: 'denied' });
            },
            RUN_TIMEOUT_MS,
        );
    });
});
