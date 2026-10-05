import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../support/test';

import { answerQuestions, openRoundByKeys } from '../support/app';
import { readState } from '../support/e2eEnv';

const LONG_TEST_TIMEOUT_MS = 240_000;

test('a guest plays an easy round end to end and sees the stats update', async ({ page }) => {
  test.setTimeout(LONG_TEST_TIMEOUT_MS);
  // Every question in the bank, whatever its type (multiple choice, true/false, A/B), is one answer.
  const bank = JSON.parse(await readFile(join(readState().contentDir, 'python/easy.json'), 'utf8')) as {
    questions: unknown[];
  };
  const bankSize = bank.questions.length;
  await page.goto('./');
  await expect(page.getByText('Python')).toBeVisible();
  await expect(page.getByText('Lifetime accuracy')).toBeHidden();

  await openRoundByKeys(page, '1');
  await answerQuestions(page, bankSize);

  await expect(page.getByRole('heading', { level: 1, name: 'Python / Easy / Complete' })).toBeVisible();
  const summary = await page.getByText(/^\d+ of \d+ correct$/).innerText();
  const [, correct, total] = /^(\d+) of (\d+) correct$/.exec(summary) ?? [];
  expect(Number(total)).toBe(bankSize);
  const accuracy = Math.round((Number(correct) / Number(total)) * 100);
  await expect(page.getByText(`${accuracy}%`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByText('Lifetime accuracy')).toBeVisible();
  await expect(page.getByText(`${accuracy}%`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('none yet')).toBeHidden();
  await expect(page.getByText('PY / Easy')).toBeVisible();

  // The stats are the guest's own on this device: they survive a reload.
  await page.reload();
  await expect(page.getByText('PY / Easy')).toBeVisible();
  await expect(page.getByText('none yet')).toBeHidden();
});
