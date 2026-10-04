// B-60: paid question text lives only in the private syntactical-content repo. Paid questions
// carry ids with these prefixes, so no file in this repo (fixtures, docs, and tests included)
// may contain one. Fixtures that stand in for a paid bank use made-up questions and ids.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_DIR = join(__dirname, '..', '..');
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', '.expo', '.claude', 'coverage']);
// Built from parts so this file does not match itself.
const PAID_ID_PREFIXES = ['py', 'pg', 'js'].flatMap((language) =>
  ['med', 'hard'].map((difficulty) => [language, difficulty, ''].join('-')),
);
const PAID_ID_PATTERN = new RegExp(`\\b(${PAID_ID_PREFIXES.join('|')})\\d`);

async function listRepoFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listRepoFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

describe('the public repo', () => {
  it('holds no paid question id in any file', async () => {
    const offending: string[] = [];
    for (const file of await listRepoFiles(REPO_DIR)) {
      if (PAID_ID_PATTERN.test(await readFile(file, 'utf8'))) offending.push(relative(REPO_DIR, file));
    }

    expect(offending).toEqual([]);
  });

  it('recognizes a paid question id', () => {
    expect(PAID_ID_PATTERN.test(`"id": "${PAID_ID_PREFIXES[0]}01"`)).toBe(true);
    expect(PAID_ID_PATTERN.test('"id": "py-easy-01"')).toBe(false);
  });
});
