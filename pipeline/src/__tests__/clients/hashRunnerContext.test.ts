// B-8d: the runner image tag must change whenever the runner build context
// changes. `hashRunnerContext(directory)` returns a lowercase hex SHA-256 over
// every regular file under the directory, recursive, sorted by relative POSIX
// path, each file contributing its relative path and its bytes. Same contents
// give the same hash regardless of where the directory lives or the order the
// files were written; a changed byte, a rename, or an added file changes it.
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashRunnerContext } from '../../clients/hashRunnerContext.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

const FILES: Array<[string, string]> = [
    ['Dockerfile', 'FROM python:3.12-slim\nCOPY harness.py /harness.py\n'],
    ['harness.py', 'import sys\nprint(sys.stdin.read())\n'],
    ['lib/util.py', 'def helper():\n    return 1\n'],
];

const createdDirs: string[] = [];

function makeContext(files: Array<[string, string]>): string {
    const directory = mkdtempSync(join(tmpdir(), 'syntactical-runner-ctx-'));
    createdDirs.push(directory);
    for (const [relativePath, contents] of files) {
        const fullPath = join(directory, relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, contents);
    }
    return directory;
}

afterEach(() => {
    for (const directory of createdDirs.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('hashRunnerContext', () => {
    it('returns the same 64-char lowercase hex hash for the same contents in two directories', () => {
        const first = hashRunnerContext(makeContext(FILES));
        const second = hashRunnerContext(makeContext(FILES));

        expect(first).toMatch(SHA256_HEX);
        expect(second).toBe(first);
    });

    it('is deterministic across calls on one directory', () => {
        const directory = makeContext(FILES);

        expect(hashRunnerContext(directory)).toBe(hashRunnerContext(directory));
    });

    it('changes when one byte of a file changes', () => {
        const directory = makeContext(FILES);
        const before = hashRunnerContext(directory);

        writeFileSync(join(directory, 'harness.py'), 'import sys\nprint(sys.stdin.read())\r');

        expect(hashRunnerContext(directory)).not.toBe(before);
    });

    it('changes when a file is renamed with the same bytes', () => {
        const directory = makeContext(FILES);
        const before = hashRunnerContext(directory);

        renameSync(join(directory, 'harness.py'), join(directory, 'harness2.py'));

        expect(hashRunnerContext(directory)).not.toBe(before);
    });

    it('changes when a file is moved into a subdirectory with the same bytes', () => {
        const directory = makeContext(FILES);
        const before = hashRunnerContext(directory);

        mkdirSync(join(directory, 'sub'));
        renameSync(join(directory, 'harness.py'), join(directory, 'sub', 'harness.py'));

        expect(hashRunnerContext(directory)).not.toBe(before);
    });

    it('changes when a file is added in a subdirectory', () => {
        const directory = makeContext(FILES);
        const before = hashRunnerContext(directory);

        mkdirSync(join(directory, 'nested', 'deeper'), { recursive: true });
        writeFileSync(join(directory, 'nested', 'deeper', 'extra.txt'), 'x');

        expect(hashRunnerContext(directory)).not.toBe(before);
    });

    it('changes when an empty file is added', () => {
        const directory = makeContext(FILES);
        const before = hashRunnerContext(directory);

        writeFileSync(join(directory, 'empty.txt'), '');

        expect(hashRunnerContext(directory)).not.toBe(before);
    });

    it('does not let bytes shift between a path and its contents', () => {
        // Without a boundary between path and bytes, "ab"+"c" and "a"+"bc"
        // would hash the same stream.
        const first = hashRunnerContext(makeContext([['ab', 'c']]));
        const second = hashRunnerContext(makeContext([['a', 'bc']]));

        expect(first).not.toBe(second);
    });

    it('does not depend on the order files were created', () => {
        const forward = hashRunnerContext(makeContext(FILES));
        const reversed = hashRunnerContext(makeContext([...FILES].reverse()));

        expect(reversed).toBe(forward);
    });
});
