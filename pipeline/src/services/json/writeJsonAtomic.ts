// Writes one JSON file (creating its directory) through writeFileAtomic.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { writeFileAtomic } from '../writeFileAtomic.js';

const JSON_INDENT = 2;

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFileAtomic(file, `${JSON.stringify(value, null, JSON_INDENT)}\n`);
}
