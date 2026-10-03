// Reads `generated/<language>/<difficulty>.json`: the questions gap-fill drafted and staged.
// A missing file is empty; a file that does not match the shape throws.
import { join } from 'node:path';

import type { Question } from '@syntactical/content-schema';
import { z } from 'zod';

import { readJsonIfPresent } from '../gapFill/readJsonIfPresent.js';

const SCHEMA = z.looseObject({ questions: z.array(z.looseObject({ id: z.string() })) });

export async function readGeneratedQuestions(
    outRoot: string,
    languageId: string,
    difficulty: string,
): Promise<Question[]> {
    const raw = await readJsonIfPresent(join(outRoot, 'generated', languageId, `${difficulty}.json`));
    return raw === undefined ? [] : (SCHEMA.parse(raw).questions as unknown as Question[]);
}
