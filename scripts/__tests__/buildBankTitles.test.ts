// scripts/__tests__/buildBankTitles.test.ts
// The crawlable bank pages read their text from services/content/bankTitles.generated.ts, which
// scripts/buildBankTitles.mjs writes from the bank files. For each bank it keeps the question count
// and the distinct query.title values in bank order, and no other question text.
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildBankTitles } from '../buildBankTitles.mjs';
import { BANK_QUESTION_COUNTS, BANK_TITLES } from '../../services/content/bankTitles.generated';

const REPO_ROOT = join(__dirname, '..', '..');
const DIFFICULTY_IDS = ['easy', 'medium', 'hard'];
const HIDDEN_EXPLANATION = 'The pipe passes the left value as the first argument.';

type BankChoice = { rationale?: string; text: string };
type BankQuestion = {
  choices?: BankChoice[];
  query: { explanation: string; syntax?: string; title: string };
  rationale?: string;
};

function buildQuestion(title: string): Record<string, unknown> {
  return { query: { explanation: HIDDEN_EXPLANATION, syntax: 'a |> f()', title } };
}

async function makeContentDir(manifest: unknown, banks: Record<string, unknown>): Promise<string> {
  const contentDir = await mkdtemp(join(tmpdir(), 'titles-'));
  await writeFile(join(contentDir, 'manifest.json'), JSON.stringify(manifest));
  for (const [path, bank] of Object.entries(banks)) {
    await mkdir(join(contentDir, path, '..'), { recursive: true });
    await writeFile(join(contentDir, path), JSON.stringify(bank));
  }
  return contentDir;
}

function listHiddenText(question: BankQuestion): string[] {
  const { choices = [], query, rationale } = question;
  const texts = [query.explanation, query.syntax, rationale, ...choices.map((choice) => choice.rationale)];
  return texts.filter((text): text is string => typeof text === 'string' && text.length > 0);
}

describe('buildBankTitles', () => {
  it("writes each bank's question count and its distinct titles in bank order", async () => {
    const contentDir = await makeContentDir(
      {
        languages: [
          { banks: { easy: { path: 'elixir/easy.json' }, hard: { path: 'elixir/hard.json' } }, id: 'elixir' },
        ],
      },
      {
        'elixir/easy.json': {
          questions: [buildQuestion('Pipes'), buildQuestion('Pattern matching'), buildQuestion('Pipes')],
        },
        'elixir/hard.json': { questions: [buildQuestion('Processes')] },
      },
    );
    const outputPath = join(contentDir, 'bankTitles.generated.ts');

    expect(await buildBankTitles(contentDir, outputPath)).toBe(2);
    const source = await readFile(outputPath, 'utf8');
    expect(source).toContain('"elixir/easy": 3,');
    expect(source).toContain('"elixir/easy": ["Pipes","Pattern matching"],');
    expect(source).toContain('"elixir/hard": ["Processes"],');
    expect(source).not.toContain(HIDDEN_EXPLANATION);
    expect(source).not.toContain('a |> f()');
  });

  it('refuses a bank path outside the content directory', async () => {
    const contentDir = await makeContentDir(
      { languages: [{ banks: { easy: { path: '../outside.json' } }, id: 'elixir' }] },
      {},
    );
    await expect(buildBankTitles(contentDir, join(contentDir, 'out.ts'))).rejects.toThrow(
      '../outside.json is not a safe bank path',
    );
  });
});

describe('the committed bankTitles.generated.ts', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'content/manifest.json'), 'utf8')) as {
    languages: { id: string }[];
  };
  const expectedKeys = manifest.languages.flatMap(({ id }) => DIFFICULTY_IDS.map((d) => `${id}/${d}`)).sort();

  it('lists all 36 banks, 12 tracks by 3 difficulties, in both exports', () => {
    expect(expectedKeys).toHaveLength(36);
    expect(Object.keys(BANK_TITLES).sort()).toEqual(expectedKeys);
    expect(Object.keys(BANK_QUESTION_COUNTS).sort()).toEqual(expectedKeys);
  });

  it('holds the python/easy count and distinct titles from content/python/easy.json', () => {
    const bank = JSON.parse(readFileSync(join(REPO_ROOT, 'content/python/easy.json'), 'utf8')) as {
      questions: BankQuestion[];
    };
    expect(BANK_QUESTION_COUNTS['python/easy']).toBe(bank.questions.length);
    expect(BANK_TITLES['python/easy']).toEqual([...new Set(bank.questions.map(({ query }) => query.title))]);
  });

  it('holds no explanation, syntax, or rationale from content/python/easy.json', () => {
    const bank = JSON.parse(readFileSync(join(REPO_ROOT, 'content/python/easy.json'), 'utf8')) as {
      questions: BankQuestion[];
    };
    const values = Object.values(BANK_TITLES).flat();
    for (const question of bank.questions) {
      for (const hidden of listHiddenText(question)) {
        expect(values.filter((value) => value.includes(hidden))).toEqual([]);
      }
    }
  });
});
