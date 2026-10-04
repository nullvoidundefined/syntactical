// Refuses a paid content directory equal to or inside the public content directory, comparing
// real paths so a symlink alias cannot slip through.
import { realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { isInsideDir } from './isInsideDir.js';

// The real path of the directory, or of its nearest existing ancestor with the rest appended
// when it does not exist yet.
async function resolveReal(dir: string): Promise<string> {
  const absolute = resolve(dir);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;
    return join(await resolveReal(parent), basename(absolute));
  }
}

async function assertPaidDirSeparate(contentDir: string, paidContentDir: string): Promise<void> {
  const [content, paid] = await Promise.all([resolveReal(contentDir), resolveReal(paidContentDir)]);
  if (isInsideDir(content, paid) || isInsideDir(paid, content)) {
    throw new Error('PAID_CONTENT_DIR must be outside the content directory and not contain it');
  }
}

export { assertPaidDirSeparate };
