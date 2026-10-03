// Reads `classifications/<language>/<difficulty>.json`: question id to its accepted topic.
// A missing file is empty; a file that does not match the shape throws.
import { join } from 'node:path';

import { z } from 'zod';

import { readJsonIfPresent } from '../gapFill/readJsonIfPresent.js';

const SCHEMA = z.record(z.string(), z.looseObject({ topic: z.string() }));

export async function readClassifiedTopics(
    outRoot: string,
    languageId: string,
    difficulty: string,
): Promise<Map<string, string>> {
    const raw = await readJsonIfPresent(join(outRoot, 'classifications', languageId, `${difficulty}.json`));
    return raw === undefined ? new Map() : new Map(Object.entries(SCHEMA.parse(raw)).map(([id, { topic }]) => [id, topic]));
}
