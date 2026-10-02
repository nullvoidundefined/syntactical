// One-time conversion of the bundled src/data question banks into the
// content/ JSON tree: one file per language and difficulty, plus the
// initial manifest. Bank hashes stay empty here; buildContentManifest
// fills them in before publishing.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LANGUAGES } from '../src/constants/appConfig.js';
import { getQuestionBank } from '../src/data/index.js';

const SCHEMA_VERSION = 1;

const GRAMMAR_BY_LANGUAGE = {
  python: 'python',
  postgres: 'sql',
  javascript: 'javascript',
};

async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildManifestLanguage({ id, label, glyph, tagline, difficulties }) {
  const banks = {};
  for (const difficulty of difficulties) {
    banks[difficulty] = { path: `${id}/${difficulty}.json`, hash: '' };
  }
  return { id, label, glyph, tagline, grammar: GRAMMAR_BY_LANGUAGE[id], banks };
}

export async function exportQuestionBanks(contentDir) {
  for (const { id, difficulties } of LANGUAGES) {
    for (const difficulty of difficulties) {
      await writeJsonFile(join(contentDir, id, `${difficulty}.json`), {
        schemaVersion: SCHEMA_VERSION,
        questions: getQuestionBank(id, difficulty),
      });
    }
  }
  await writeJsonFile(join(contentDir, 'manifest.json'), {
    schemaVersion: SCHEMA_VERSION,
    languages: LANGUAGES.map(buildManifestLanguage),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportQuestionBanks(process.argv[2] ?? 'content').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
