// Reads one manifest bank's exact bytes from a root directory, refusing an unsafe path;
// null when the file is absent. With a forbiddenDir (paid reads), the file's real path must
// not lie inside it, and the bytes come from the real path that was checked.
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { isSafeBankPath } from '@syntactical/content-schema';
import type { BankEntry } from '@syntactical/content-schema';

import { isInsideDir } from './isInsideDir.js';

async function readBankBytes(
  root: string,
  { path }: BankEntry,
  forbiddenDir?: string,
): Promise<Buffer | null> {
  if (!isSafeBankPath(path)) throw new Error(`Unsafe bank path: ${path}`);
  const file = join(root, path);
  try {
    if (forbiddenDir === undefined) return await readFile(file);
    const real = await realpath(file);
    if (isInsideDir(await realpath(forbiddenDir), real)) {
      throw new Error(`Paid bank resolves into the content directory: ${path}`);
    }
    return await readFile(real);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export { readBankBytes };
