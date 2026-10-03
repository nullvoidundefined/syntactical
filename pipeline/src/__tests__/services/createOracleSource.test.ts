import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOracleSource } from '../../services/createOracleSource.js';
import type { Oracle } from '../../types/Oracle.js';

const ORACLE: Oracle = { code: 'print(1)', language: 'python' };

describe('createOracleSource', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'oracles-'));
        await mkdir(join(dir, 'python'), { recursive: true });
    });

    afterEach(async () => {
        await rm(dir, { force: true, recursive: true });
    });

    it('returns the oracle for a known id', async () => {
        await writeFile(join(dir, 'python/easy.json'), JSON.stringify({ 'p-1': ORACLE }));

        expect(await createOracleSource(dir)('python/easy', 'p-1')).toEqual(ORACLE);
    });

    it('returns null for an unknown id', async () => {
        await writeFile(join(dir, 'python/easy.json'), JSON.stringify({ 'p-1': ORACLE }));

        expect(await createOracleSource(dir)('python/easy', 'p-2')).toBeNull();
    });

    it('returns null for ids that exist only on Object.prototype', async () => {
        await writeFile(join(dir, 'python/easy.json'), JSON.stringify({ 'p-1': ORACLE }));
        const source = createOracleSource(dir);

        expect(await source('python/easy', 'constructor')).toBeNull();
        expect(await source('python/easy', '__proto__')).toBeNull();
    });

    it('returns null when the bank file is missing', async () => {
        expect(await createOracleSource(dir)('python/hard', 'p-1')).toBeNull();
    });

    it('throws an error naming the bank key and file for a malformed file', async () => {
        await writeFile(join(dir, 'python/easy.json'), '{not json');

        await expect(createOracleSource(dir)('python/easy', 'p-1')).rejects.toThrow(
            /python\/easy.*easy\.json/,
        );
    });

    it('recovers once a malformed file is fixed instead of caching the failure', async () => {
        const file = join(dir, 'python/easy.json');
        await writeFile(file, '{not json');
        const source = createOracleSource(dir);
        await expect(source('python/easy', 'p-1')).rejects.toThrow();

        await writeFile(file, JSON.stringify({ 'p-1': ORACLE }));

        expect(await source('python/easy', 'p-1')).toEqual(ORACLE);
    });
});
