// JSON file helpers for the command tests: write a fixture file (creating its
// directory) in the same shape `services/json/writeJsonAtomic.ts` produces, and
// read one back.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T = Record<string, unknown>>(file: string): Promise<T> {
    return JSON.parse(await readFile(file, 'utf8')) as T;
}
