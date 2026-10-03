import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeFileAtomic } from '../../services/writeFileAtomic.js';

describe('writeFileAtomic', () => {
    it('replaces the target and leaves no temp file behind', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'atomic-'));
        const file = join(dir, 'out.json');
        await writeFile(file, 'old');
        await writeFileAtomic(file, 'new');
        expect(await readFile(file, 'utf8')).toBe('new');
        expect(await readdir(dir)).toEqual(['out.json']);
    });

    it('leaves the target alone and removes its temp file when the rename fails', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'atomic-'));
        // A non-empty directory at the target path makes the rename fail after the temp file is written.
        const target = join(dir, 'out.json');
        await mkdir(target);
        await writeFile(join(target, 'keep.txt'), 'keep');
        await expect(writeFileAtomic(target, 'new')).rejects.toThrow();
        expect(await readdir(dir)).toEqual(['out.json']);
        expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('keep');
    });
});
