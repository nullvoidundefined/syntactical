// Removes a stale file (for example a review-queue entry the question no longer needs).
import { rm } from 'node:fs/promises';

export async function removeFileIfPresent(file: string): Promise<void> {
    await rm(file, { force: true });
}
