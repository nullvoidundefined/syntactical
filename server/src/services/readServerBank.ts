// Loads every paid bank's exact bytes from the paid content directory at startup, verified
// against the manifest hash, so a paid bank is never read from the public content directory.
import type { PaidBank } from '../types/PaidBank.js';
import type { PaidBanks } from '../types/PaidBanks.js';

import { assertPaidDirSeparate } from './assertPaidDirSeparate.js';
import { readBankBytes } from './readBankBytes.js';
import { readManifest } from './readManifest.js';
import { sha256 } from './sha256.js';

async function readPaidBanks(contentDir: string, paidContentDir: string): Promise<PaidBanks> {
  await assertPaidDirSeparate(contentDir, paidContentDir);
  const manifest = await readManifest(contentDir);
  const banks = new Map<string, PaidBank>();
  for (const { banks: entries, id } of manifest.languages) {
    for (const [difficulty, entry] of Object.entries(entries)) {
      const { access, hash, path, productId } = entry;
      if (access !== 'paid' || !productId) continue;
      const body = await readBankBytes(paidContentDir, entry);
      if (body === null) throw new Error(`Paid bank missing: ${path}`);
      if (sha256(body).toString('hex') !== hash) throw new Error(`Bank hash mismatch: ${path}`);
      banks.set(`${id}/${difficulty}`, { body, productId });
    }
  }
  return banks;
}

export { readPaidBanks };
