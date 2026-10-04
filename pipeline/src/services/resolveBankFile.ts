// Where a bank's file lives (B-60): a free bank under the public content dir, a paid bank under
// the private content root (the syntactical-content repo). Paid banks are never in the public tree.
import { join } from 'node:path';

import type { BankEntry } from '@syntactical/content-schema';

export function resolveBankFile(
    contentDir: string,
    contentRoot: string,
    { access, path }: Pick<BankEntry, 'access' | 'path'>,
): string {
    return join(access === 'free' ? contentDir : contentRoot, path);
}
