// Writes a file by writing a temp file in the same directory and renaming it over the
// target, so a crash or a failed write never leaves a half-written file where a good one
// was. A failed attempt removes its temp file.
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

export async function writeFileAtomic(file: string, text: string): Promise<void> {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temp, text);
        await rename(temp, file);
    } catch (error) {
        await rm(temp, { force: true });
        throw error;
    }
}
