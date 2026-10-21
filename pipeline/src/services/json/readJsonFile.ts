// Reads and parses a JSON file that must exist. A missing file or malformed JSON throws
// the underlying error; callers that tolerate a missing file use readJsonIfPresent.
import { readFile } from 'node:fs/promises';

export async function readJsonFile(file: string): Promise<unknown> {
    return JSON.parse(await readFile(file, 'utf8'));
}
