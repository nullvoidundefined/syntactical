// Reads one manifest bank's exact bytes from a root directory, refusing an unsafe path;
// null when the file is absent.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isSafeBankPath } from '@syntactical/content-schema';
import type { BankEntry } from '@syntactical/content-schema';

async function readBankBytes(root: string, { path }: BankEntry): Promise<Buffer | null> {
  if (!isSafeBankPath(path)) throw new Error(`Unsafe bank path: ${path}`);
  try {
    return await readFile(join(root, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export { readBankBytes };
