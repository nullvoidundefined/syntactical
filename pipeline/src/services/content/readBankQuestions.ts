// Reads the questions of one bank file. Bank files are trusted committed content, so the shape is
// not re-validated here; the content build
// and `pipeline validate` are the gates on their contents.
import type { Question } from '@syntactical/content-schema';

import { readJsonFile } from '../json/readJsonFile.js';

export async function readBankQuestions(file: string): Promise<Question[]> {
    return ((await readJsonFile(file)) as { questions: Question[] }).questions;
}
