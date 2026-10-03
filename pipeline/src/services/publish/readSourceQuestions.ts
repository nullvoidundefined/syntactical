// Reads a bank's current questions from the first of `files` that exists. A paid bank already
// published lives in the private content root; one not yet moved is still in the content dir.
import { readFile } from 'node:fs/promises';

import type { Question } from '@syntactical/content-schema';

export async function readSourceQuestions(files: string[]): Promise<Question[]> {
    for (const file of files) {
        try {
            return (JSON.parse(await readFile(file, 'utf8')) as { questions: Question[] }).questions;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }
    throw new Error('bank file not found');
}
