// Go track: `runOracle` compiles and executes a complete Go program in the Go runner
// image. Printed output and the runtime version are returned; compile failures, panics,
// deadlocks, and explicit exits are distinguished under the shared runner sandbox.
//
// Set SKIP_DOCKER_TESTS=1 to skip this file where Docker is unavailable; it runs by default.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    releaseDockerTestLock,
    runningRunnerContainers,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

const RUN_TIMEOUT_MS = 60_000;
const GO_VERSION = /^Go 1\.\d+(\.\d+)?$/;

describe.skipIf(SKIP_DOCKER)('runOracle go (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        await ensureRunnerImage('go');
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe('go contract', () => {
        it(
            'reports a printed value and the Go version',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport "fmt"\nfunc main() { fmt.Println(7 / 2) }',
                });

                expect(run).toMatchObject({ outcome: 'value', value: '3' });
                expect(run.runtimeVersion).toMatch(GO_VERSION);
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'reports multi-line output with exactly one trailing newline stripped',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport "fmt"\nfunc main() { fmt.Print("1\\n2\\n\\n") }',
                });

                expect(run).toMatchObject({ outcome: 'value', value: '1\n2\n' });
            },
            RUN_TIMEOUT_MS,
        );

        it.each([
            ['parse error', 'package main\nfunc main( {'],
            ['unused variable', 'package main\nfunc main() { unused := 1 }'],
            ['unused import', 'package main\nimport "fmt"\nfunc main() {}'],
            ['incompatible types', 'package main\nfunc main() { var n int = "text"; _ = n }'],
        ])(
            'records a compile failure (%s) as a syntax error',
            async (_name, code) => {
                const run = await runOracle({ language: 'go', code });

                expect(run.outcome).toBe('syntax-error');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it.each([
            ['explicit panic', 'panic("boom")'],
            ['index out of range', 'items := []int{1}; i := 2; println(items[i])'],
            ['nil map write', 'var items map[string]int; items["x"] = 1'],
            ['integer divide by zero', 'zero := 0; println(1 / zero)'],
        ])(
            'records an unrecovered %s as a panic exception',
            async (_name, body) => {
                const run = await runOracle({ language: 'go', code: `package main\nfunc main() { ${body} }` });

                expect(run).toMatchObject({ outcome: 'exception', exceptionType: 'panic' });
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records a runtime deadlock as a deadlock exception',
            async () => {
                const run = await runOracle({ language: 'go', code: 'package main\nfunc main() { select {} }' });

                expect(run).toMatchObject({ outcome: 'exception', exceptionType: 'deadlock' });
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records os.Exit(3) as an exit exception',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport "os"\nfunc main() { os.Exit(3) }',
                });

                expect(run).toMatchObject({ outcome: 'exception', exceptionType: 'exit' });
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs goroutines, channels, and a WaitGroup to sum values',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: [
                        'package main',
                        'import ("fmt"; "sync")',
                        'func main() {',
                        '    values := make(chan int, 5)',
                        '    var wg sync.WaitGroup',
                        '    for i := 1; i <= 5; i++ {',
                        '        wg.Add(1)',
                        '        go func(n int) { defer wg.Done(); values <- n }(i)',
                        '    }',
                        '    wg.Wait()',
                        '    close(values)',
                        '    total := 0',
                        '    for n := range values { total += n }',
                        '    fmt.Println(total)',
                        '}',
                    ].join('\n'),
                });

                expect(run).toMatchObject({ outcome: 'value', value: '15' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs an oracle far larger than one argv argument',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: `package main\n// ${'x'.repeat(200_000)}\nimport "fmt"\nfunc main() { fmt.Println(1) }`,
                });

                expect(run).toMatchObject({ outcome: 'value', value: '1' });
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'compiles and runs a small program within 4000 ms using the default timeout',
            async () => {
                const startedAt = Date.now();
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport "fmt"\nfunc main() { fmt.Println(42) }',
                });

                expect(run).toMatchObject({ outcome: 'value', value: '42' });
                expect(Date.now() - startedAt).toBeLessThan(4000);
            },
            RUN_TIMEOUT_MS,
        );
    });

    describe('go sandbox', () => {
        it(
            'gives the oracle no network',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: [
                        'package main',
                        'import ("fmt"; "net")',
                        'func main() {',
                        '    connection, err := net.Dial("tcp", "1.1.1.1:53")',
                        '    if err != nil { panic(err) }',
                        '    defer connection.Close()',
                        '    fmt.Println("connected")',
                        '}',
                    ].join('\n'),
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
                const run = await runOracle(
                    { language: 'go', code: 'package main\nfunc main() { for {} }' },
                    { timeoutMs: 3000 },
                );

                expect(run.outcome).toBe('timeout');
                expect(Date.now() - startedAt).toBeLessThan(8000);
                expect(runningRunnerContainers('go')).toBe('');
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'stops an allocation past 256 MB',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: [
                        'package main',
                        'import ("fmt"; "runtime")',
                        'func main() {',
                        '    data := make([]byte, 512 * 1024 * 1024)',
                        '    for i := range data { data[i] = 1 }',
                        '    fmt.Println(len(data))',
                        '    runtime.KeepAlive(data)',
                        '}',
                    ].join('\n'),
                });

                expect(run.outcome).toBe('resource-limit');
                expect(run.value).toBeUndefined();
                expect(run.exceptionType).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'records output past 64 KB as a resource limit',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport ("fmt"; "strings")\nfunc main() { fmt.Print(strings.Repeat("x", 200_000)) }',
                });

                expect(run.outcome).toBe('resource-limit');
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'refuses a write outside the writable tmpfs mounts',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: [
                        'package main',
                        'import ("fmt"; "os")',
                        'func main() {',
                        '    if err := os.WriteFile("/etc/x", []byte("x"), 0644); err != nil { panic(err) }',
                        '    fmt.Println("written")',
                        '}',
                    ].join('\n'),
                });

                expect(run).toMatchObject({ outcome: 'exception', exceptionType: 'panic' });
                expect(run.value).toBeUndefined();
            },
            RUN_TIMEOUT_MS,
        );

        it(
            'runs the oracle as uid 10001, not root',
            async () => {
                const run = await runOracle({
                    language: 'go',
                    code: 'package main\nimport ("fmt"; "os")\nfunc main() { fmt.Println(os.Getuid()) }',
                });

                expect(run).toMatchObject({ outcome: 'value', value: '10001' });
            },
            RUN_TIMEOUT_MS,
        );
    });
});
