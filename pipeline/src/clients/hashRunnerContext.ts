import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function listFiles(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(({ name, parentPath }) => join(parentPath, name));
}

/**
 * SHA-256 over every regular file under `directory`, in sorted relative-path order. Each file
 * contributes its path and its bytes, each length-prefixed, so renames and moves change the hash.
 */
export function hashRunnerContext(directory: string): string {
    const hash = createHash('sha256');
    const files = listFiles(directory)
        .map((file) => ({ file, path: relative(directory, file).split(sep).join('/') }))
        .sort((left, right) => (left.path < right.path ? -1 : Number(left.path > right.path)));
    for (const { file, path } of files) {
        const bytes = readFileSync(file);
        hash.update(`${Buffer.byteLength(path)}:${path}\0${bytes.length}:`);
        hash.update(bytes);
    }
    return hash.digest('hex');
}
