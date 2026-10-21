// Reads and parses a JSON file; a missing file is `undefined`. Any other failure (a file
// that exists but is not JSON, a permission error) throws, so a bad file is never silently
// treated as empty and overwritten.
import { readFile } from 'node:fs/promises';

export async function readJsonIfPresent(file: string): Promise<unknown> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
    return JSON.parse(text);
}
