// scripts/__tests__/noFixtureInProduction.test.ts
// The fixture purchase store (clients/purchaseStoreClient.fixture.ts) is reachable only through
// the lazy require in clients/selectPurchaseStoreClient.ts, behind the loopback API URL guard. No
// file outside __tests__ directories, other than the fixture itself, may import it with a static
// import or export-from statement, so no production code path can pick it up by accident.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_DIR = join(__dirname, '..', '..');
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.expo',
  '.claude',
  'coverage',
  '__tests__',
  'packages',
  'pipeline',
  'server',
  'e2e',
]);
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const FIXTURE_FILE = join('clients', 'purchaseStoreClient.fixture.ts');
const SELECTOR_FILE = join(REPO_DIR, 'clients', 'selectPurchaseStoreClient.ts');
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\b[^;]*?(?:from\s*)?['"][^'"]*purchaseStoreClient\.fixture(?:\.ts)?['"]/;

async function listSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listSourceFiles(path)));
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) files.push(path);
  }
  return files;
}

describe('the fixture purchase store', () => {
  it('is imported statically by no app source file', async () => {
    const offending: string[] = [];
    for (const file of await listSourceFiles(REPO_DIR)) {
      const path = relative(REPO_DIR, file);
      if (path === FIXTURE_FILE) continue;
      if (STATIC_IMPORT.test(await readFile(file, 'utf8'))) offending.push(path);
    }
    expect(offending).toEqual([]);
  });

  it('is reached by the store selector only through a lazy require', async () => {
    const selector = await readFile(SELECTOR_FILE, 'utf8');
    expect(selector).toContain("require('./purchaseStoreClient.fixture')");
    expect(STATIC_IMPORT.test(selector)).toBe(false);
  });

  it.each([
    ["import { buyStoreProduct } from './purchaseStoreClient.fixture';", true],
    ["import * as store from '../clients/purchaseStoreClient.fixture';", true],
    ["export * from './purchaseStoreClient.fixture';", true],
    ["import './purchaseStoreClient.fixture';", true],
    ["const store = require('./purchaseStoreClient.fixture');", false],
    ["import { buyStoreProduct } from './purchaseStoreClient';", false],
  ])('classifies %s as a static import: %s', (source, expected) => {
    expect(STATIC_IMPORT.test(source)).toBe(expected);
  });
});
