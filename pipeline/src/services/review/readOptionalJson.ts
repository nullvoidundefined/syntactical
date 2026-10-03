// Reads a JSON file, or returns undefined when it does not exist. A file that exists but
// is not JSON throws, so a bad file is never silently treated as absent.
import { readFile } from 'node:fs/promises';

export async function readOptionalJson(file: string): Promise<unknown> {
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
