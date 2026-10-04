import { expect, test } from '../support/test';

import { readState } from '../support/e2eEnv';
import { answerQuestions, createUniqueEmail, openRoundByKeys, queryDatabase, readUserId, signIn } from '../support/app';

const ANSWER_COUNT = 3;

async function countRows(table: 'answer_events' | 'sessions', userId: string): Promise<number> {
  const rows = await queryDatabase<{ count: string }>(`SELECT count(*) FROM ${table} WHERE user_id = $1`, [userId]);
  return Number(rows[0]?.count ?? 0);
}

test('deleting the account from Settings removes the user, their answers, and their sessions', async ({ page }) => {
  const email = createUniqueEmail();
  await openRoundByKeys(page, '1');
  await answerQuestions(page, ANSWER_COUNT);
  await page.keyboard.press('Escape');
  await signIn(page, email);
  const userId = await readUserId(email);
  expect(userId).toBeDefined();
  await expect.poll(() => countRows('answer_events', userId ?? '')).toBe(ANSWER_COUNT);

  await page.goto('settings');
  await page.getByRole('button', { exact: true, name: 'Delete account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete account' });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.click();

  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await expect.poll(() => readUserId(email)).toBeUndefined();
  expect(await countRows('answer_events', userId ?? '')).toBe(0);
  expect(await countRows('sessions', userId ?? '')).toBe(0);

  // The device is a guest again, and the deleted session no longer works.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  const response = await page.request.get(`${readState().apiUrl}/v1/me`);
  expect(response.status()).toBe(401);
});
