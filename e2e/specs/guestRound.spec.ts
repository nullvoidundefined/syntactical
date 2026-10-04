import { expect, test } from '../support/test';

import { answerQuestions, openRoundByKeys } from '../support/app';

const EASY_BANK_SIZE = 100;
const LONG_TEST_TIMEOUT_MS = 240_000;

test('a guest plays an easy round end to end and sees the stats update', async ({ page }) => {
  test.setTimeout(LONG_TEST_TIMEOUT_MS);
  await page.goto('./');
  await expect(page.getByText('none yet')).toBeVisible();

  await openRoundByKeys(page, '1');
  await answerQuestions(page, EASY_BANK_SIZE);

  await expect(page.getByRole('heading', { level: 1, name: 'Python / Easy / Complete' })).toBeVisible();
  const summary = await page.getByText(/^\d+ of \d+ correct$/).innerText();
  const [, correct, total] = /^(\d+) of (\d+) correct$/.exec(summary) ?? [];
  expect(Number(total)).toBe(EASY_BANK_SIZE);
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
