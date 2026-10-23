// Test support: removes every misconception link from a copied content directory, the choices'
// and true/false questions' misconceptionId and each manifest track's misconceptions, so a test
// that supplies its own small taxonomy starts from banks that reference none of the real one.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Linked = { misconceptionId?: string };
type Bank = { questions: (Linked & { choices?: Linked[] })[] };
type Manifest = { languages: { banks: Record<string, { path: string }>; misconceptions?: unknown[] }[] };

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function stripMisconceptionLinks(contentDir: string): Promise<void> {
  const manifestPath = join(contentDir, 'manifest.json');
  const manifest = await readJson<Manifest>(manifestPath);
  for (const language of manifest.languages) {
    language.misconceptions = [];
    for (const { path } of Object.values(language.banks)) {
      const bankPath = join(contentDir, path);
      const bank = await readJson<Bank>(bankPath).catch(() => null);
      if (bank === null) continue;
      for (const question of bank.questions) {
        delete question.misconceptionId;
        for (const choice of question.choices ?? []) delete choice.misconceptionId;
      }
      await writeFile(bankPath, JSON.stringify(bank, null, 2));
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
