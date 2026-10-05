import { expect, test } from '../support/test';

import {
  answerQuestions,
  createUniqueEmail,
  pickAllQuestions,
  queryDatabase,
  readUserId,
  signIn,
} from '../support/app';

const PRODUCT_ID = 'syntactical.python.medium';
const PAID_BANK_SIZE = 5;

test.describe('a paid bank', () => {
  test('shows locked with no entitlement and plays after one is granted in the database', async ({ page }) => {
    const email = createUniqueEmail();
    await signIn(page, email);
    await page.goto('python');

    const locked = page.getByRole('button', { name: 'Medium, locked' });
    await expect(locked).toBeVisible();
    await locked.click();
    await expect(page.getByRole('dialog', { name: 'Unlock Medium' })).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // A deep link to the locked bank does not play it either.
    await page.goto('python/medium/play');
    await expect(page.getByRole('progressbar', { name: /^Question 1 of/ })).toBeHidden();

    const userId = await readUserId(email);
    await queryDatabase(
      `INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, $2, 'e2e', 'granted')`,
      [userId, PRODUCT_ID],
    );

    await page.goto('python');
    await expect(page.getByRole('button', { name: 'Medium, locked' })).toBeHidden();
    await page.getByRole('button', { name: /^Medium/ }).click();
    await expect(page.getByText('Step 3 / Select topic')).toBeVisible();
    await page.keyboard.press('1');
    await pickAllQuestions(page);
    await expect(page.getByRole('progressbar', { name: /^Question 1 of 5$/ })).toBeVisible();
    await answerQuestions(page, PAID_BANK_SIZE);
    await expect(page.getByRole('heading', { level: 1, name: 'Python / Medium / Complete' })).toBeVisible();

    // Passes run on sign-in, on return to the app, and every five minutes; a reload starts one.
    await page.reload();
    // The server accepts the entitled user's paid-bank answers.
    await expect
      .poll(async () => {
        const rows = await queryDatabase<{ count: string }>(
          `SELECT count(*) FROM answer_events WHERE user_id = $1 AND bank_key = 'python/medium'`,
          [userId],
        );
        return Number(rows[0]?.count ?? 0);
      })
      .toBe(PAID_BANK_SIZE);
  });

  test('the paywall slide is switched off under reduced motion', async ({ page }) => {
    await signIn(page, createUniqueEmail());

    async function readPaywallAnimation(): Promise<string> {
      await page.goto('python');
      await page.getByRole('button', { name: 'Medium, locked' }).click();
      const sheet = page.getByRole('dialog', { name: 'Unlock Medium' });
      await expect(sheet).toBeVisible();
      return sheet.evaluate((element) => getComputedStyle(element).animationName);
    }

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await readPaywallAnimation()).toBe('paywall-slide-up');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await readPaywallAnimation()).toBe('none');
  });
});
