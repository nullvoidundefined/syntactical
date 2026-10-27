// e2e/specs/proPurchase.spec.ts
// Buying Pro on the web through the fixture store, which the e2e build uses because its API base
// URL is a loopback URL: the purchase posts a synthetic RevenueCat event to the test-mode webhook,
// the server's real webhook handling grants Pro, and the app confirms through GET /me. Settings
// then shows the plan, the database holds the granted row, and Ask answers count against 20 a day.
import { createUniqueEmail, openRoundByKeys, queryDatabase, signIn } from '../support/app';
import { expect, test } from '../support/test';

interface EntitlementRow {
  expires_at: Date | null;
  product_id: string;
  status: string;
}

async function readEntitlements(email: string): Promise<EntitlementRow[]> {
  return queryDatabase<EntitlementRow>(
    `SELECT product_id, status, expires_at FROM entitlements
      WHERE user_id = (SELECT id FROM users WHERE email = $1) ORDER BY product_id`,
    [email],
  );
}

test.describe('buying Pro', () => {
  test('the annual plan: the sheet closes, Settings reads "Pro until", and Ask counts against 20', async ({ page }) => {
    const email = createUniqueEmail();
    await signIn(page, email);
    await page.goto('settings');
    await page.getByRole('button', { name: 'Go Pro' }).click();
    const dialog = page.getByRole('dialog', { name: 'Syntactical Pro' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'A year for $19.99' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Pro until /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go Pro' })).toHaveCount(0);
    const rows = await readEntitlements(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ product_id: 'syntactical.pro.annual', status: 'granted' });
    expect(rows[0].expires_at?.getTime() ?? 0).toBeGreaterThan(Date.now());

    await openRoundByKeys(page, '1');
    await page.keyboard.press('1');
    await page.keyboard.press('t');
    await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
    await page.keyboard.press('q');
    await page.getByLabel('Your question about this card').fill('Why is this the answer?');
    await page.getByRole('button', { exact: true, name: 'Ask' }).click();
    await expect(page.getByText(/^\d+ of 20 left today$/)).toBeVisible();
  });

  test('the lifetime plan: Settings reads "Pro, lifetime" and the row has no expiry', async ({ page }) => {
    const email = createUniqueEmail();
    await signIn(page, email);
    await page.goto('settings');
    await page.getByRole('button', { name: 'Go Pro' }).click();
    const dialog = page.getByRole('dialog', { name: 'Syntactical Pro' });
    await dialog.getByRole('button', { name: 'Forever for $39.99' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Pro, lifetime')).toBeVisible();
    expect(await readEntitlements(email)).toEqual([
      { expires_at: null, product_id: 'syntactical.pro.lifetime', status: 'granted' },
    ]);
  });
});
