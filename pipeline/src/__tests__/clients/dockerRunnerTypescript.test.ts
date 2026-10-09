// TypeScript track: `runOracle` transpiles the oracle with the TypeScript compiler and runs it
// under the node harness. Type questions are proven by the in-image helpers, which call the
// compiler in-process.
//
// Set SKIP_DOCKER_TESTS=1 to skip this file where Docker is unavailable; it runs by default.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { acquireDockerTestLock, DOCKER_LOCK_WAIT_MS, releaseDockerTestLock } from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';
const RUN_TIMEOUT_MS = 60_000;

async function runTypescript(code: string) {
    return runOracle({ language: 'typescript', code });
}

describe.skipIf(SKIP_DOCKER)('runOracle typescript (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('typescript');
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    it(
        'prints the value of a typed generic program',
        async () => {
            const run = await runTypescript(
                [
                    'function first<T>(items: T[]): T | undefined { return items[0]; }',
                    'const n: number | undefined = first<number>([4, 5]);',
                    'console.log(n);',
                ].join('\n'),
            );

            expect(run).toMatchObject({ outcome: 'value', value: '4' });
            expect(run.runtimeVersion).toMatch(/\d+\.\d+\.\d+/);
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'runs type-only constructs by erasing them',
        async () => {
            const run = await runTypescript(
                'interface P { a: number }\ntype Q = P & { b: string };\nenum E { A = 1, B }\nconsole.log(E.B);',
            );

            expect(run).toMatchObject({ outcome: 'value', value: '2' });
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'reports a thrown Error subclass as an exception',
        async () => {
            const run = await runTypescript('const x: number = 1;\nthrow new RangeError("bad " + x);');

            expect(run).toMatchObject({ outcome: 'exception', exceptionType: 'RangeError' });
            expect(run.value).toBeUndefined();
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'reports a syntax error as syntax-error',
        async () => {
            const run = await runTypescript('const x: number = ;');

            expect(run.outcome).toBe('syntax-error');
            expect(run.value).toBeUndefined();
        },
        RUN_TIMEOUT_MS,
    );

    it(
        'lets the oracle require the typescript compiler',
        async () => {
            const run = await runTypescript(
                'const ts = require("typescript");\nconsole.log(typeof ts.transpileModule);',
            );

            expect(run).toMatchObject({ outcome: 'value', value: 'function' });
        },
        RUN_TIMEOUT_MS,
    );

    describe('tsHelpers', () => {
        it(
            'countTypeErrors returns 1 for a type mismatch',
            async () => {
                const run = await runTypescript(
                    'const { countTypeErrors } = require("/harness/tsHelpers.js");\nconsole.log(countTypeErrors("const n: number = \\"x\\";"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'countTypeErrors returns 0 for valid code',
            async () => {
                const run = await runTypescript(
                    'const { countTypeErrors } = require("/harness/tsHelpers.js");\nconsole.log(countTypeErrors("const n: number = 1; const s: string = `a${n}`;"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: '0' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'countTypeErrors applies strict mode (implicit any is an error)',
            async () => {
                const run = await runTypescript(
                    'const { countTypeErrors } = require("/harness/tsHelpers.js");\nconsole.log(countTypeErrors("function f(a) { return a; }"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'typeOf returns the checker type string of a declaration',
            async () => {
                const run = await runTypescript(
                    'const { typeOf } = require("/harness/tsHelpers.js");\nconsole.log(typeOf("const s = \\"a\\" as string;", "s"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: 'string' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'typeOf shows a literal type for a const',
            async () => {
                const run = await runTypescript(
                    'const { typeOf } = require("/harness/tsHelpers.js");\nconsole.log(typeOf("const k = \\"a\\";", "k"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: '"a"' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'countTypeErrors cannot read host files: an import of /etc/passwd is an unresolved module and only a count is printed',
            async () => {
                const run = await runTypescript(
                    'const { countTypeErrors } = require("/harness/tsHelpers.js");\nconsole.log(countTypeErrors(\'import x from "/etc/passwd";\\n/// <reference path="/etc/hostname" />\\nexport const y = x;\'));',
                );

                expect(run.outcome).toBe('value');
                expect(run.value).toMatch(/^[1-9]\d*$/);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'type-checks against ES2022 only, without the DOM library',
            async () => {
                const run = await runTypescript(
                    'const { countTypeErrors } = require("/harness/tsHelpers.js");\nconsole.log(countTypeErrors("const t: string = document.title;"));',
                );

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs both helpers in one oracle within the sandbox limits',
            async () => {
                const run = await runTypescript(
                    [
                        'const { countTypeErrors, typeOf } = require("/harness/tsHelpers.js");',
                        'console.log(countTypeErrors("const n: number = 1;") + " " + typeOf("const xs = [1, 2];", "xs"));',
                    ].join('\n'),
                );

                expect(run).toMatchObject({ outcome: 'value', value: '0 number[]' });
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe('sandbox', () => {
        it(
            'gives the oracle no network',
            async () => {
                const run = await runTypescript(
                    [
                        'const net = require("node:net");',
                        'const socket = net.connect(53, "1.1.1.1");',
                        'socket.on("connect", () => console.log("connected"));',
                        'socket.on("error", (e: Error) => { throw e; });',
                    ].join('\n'),
                );

                expect(run.outcome).not.toBe('value');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records output past 64 KB as a resource limit',
            async () => {
                const run = await runTypescript('process.stdout.write("x".repeat(200000));');

                expect(run.outcome).toBe('resource-limit');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'kills a run past the wall-clock limit',
            async () => {
                const run = await runOracle({ language: 'typescript', code: 'while (true) {}' }, { timeoutMs: 3000 });

                expect(run.outcome).toBe('timeout');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs the oracle as uid 10001, not root',
            async () => {
                const run = await runTypescript('console.log(process.getuid());');

                expect(run).toMatchObject({ outcome: 'value', value: '10001' });
            },
            RUN_TIMEOUT_MS,
        );
    });
});
