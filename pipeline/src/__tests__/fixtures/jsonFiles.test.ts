import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { readJson, writeJson } from './jsonFiles.js';

describe('JSON file fixtures', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'json-files-'));
    });

    afterEach(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it('writeJson creates missing parent directories', async () => {
        const file = join(root, 'a', 'b', 'c.json');
        const value = { questions: ['What is JSON?'] };

        await writeJson(file, value);

        expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(value);
    });

    it('writeJson writes pretty JSON with exactly one trailing newline', async () => {
        const file = join(root, 'pretty.json');
        const value = { bank: { questions: ['First question', 'Second question'] } };

        await writeJson(file, value);

        expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(value, null, 2)}\n`);
    });

    it('readJson round-trips a value and supports a generic result type', async () => {
        const file = join(root, 'round-trip.json');
        const value = { questions: ['What is JSON?', 'What is UTF-8?'] };

        await writeJson(file, value);
        const result = await readJson<{ questions: string[] }>(file);
        const questions: string[] = result.questions;

        expect(result).toEqual(value);
        expect(questions).toEqual(value.questions);
    });
});
