// Reads pipeline/topics.json: the closed topic list per language id, used only for a
// language whose manifest entry has no topics yet. Each id must be a kebab-case slug.
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

const TOPIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const topicsFileSchema = z.record(z.string(), z.array(z.string().regex(TOPIC_ID)));

export async function readFallbackTopics(file: string): Promise<Record<string, string[]>> {
    return topicsFileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}
