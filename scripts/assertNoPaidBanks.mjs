// The last step of the web build (B-60): fails when the export holds a paid bank. A file counts
// as a paid bank when its path ends with a paid manifest entry's path, or when its bytes hash to a
// paid entry's SHA-256 (a copy under any other name). Paid banks live in the private
// syntactical-content repo and reach owners only through the API.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function listPaidEntries(manifest) {
  return manifest.languages.flatMap((language) =>
    Object.values(language.banks).filter((bank) => bank.access === 'paid'),
  );
}

async function listFiles(rootDir) {
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(rootDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

// Returns the paths, relative to `rootDir` and sorted, of every file that is a paid bank.
export async function findPaidBankFiles(rootDir, manifest) {
  const paid = listPaidEntries(manifest);
  const paidHashes = new Set(paid.map((bank) => bank.hash));
  const found = [];
  for (const file of await listFiles(rootDir)) {
    const isAtPaidPath = paid.some(({ path }) => file === path || file.endsWith(`/${path}`));
    const hash = createHash('sha256')
      .update(await readFile(join(rootDir, file)))
      .digest('hex');
    if (isAtPaidPath || paidHashes.has(hash)) found.push(file);
  }
  return found;
}

async function assertNoPaidBanks(rootDir) {
  const manifest = JSON.parse(await readFile(join('content', 'manifest.json'), 'utf8'));
  const found = await findPaidBankFiles(rootDir, manifest);
  if (found.length > 0) throw new Error(`paid bank in the web export: ${found.join(', ')}`);
}

// Compared as real-path URLs, as Node resolves the entry module, so a symlinked path or one with
// a space or other encoded character still runs the check instead of exiting 0 unchecked.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  assertNoPaidBanks(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
