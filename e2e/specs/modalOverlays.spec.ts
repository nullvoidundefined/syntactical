import type { Locator } from '@playwright/test';

import { answerQuestions, createUniqueEmail, openRoundByKeys, signIn } from '../support/app';
import { expect, test } from '../support/test';

// True when a pointer at the control's center would land on the control itself, not on whatever
// covers it. An aria-modal dialog must cover the whole page, the app bar included.
function isHitTestable(control: Locator): Promise<boolean> {
  return control.evaluate((element) => {
    const { height, left, top, width } = element.getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    return hit !== null && element.contains(hit);
  });
}

test.describe('modal dialogs cover the whole page', () => {
  test('the Pro sheet covers the app bar', async ({ page }) => {
    await signIn(page, createUniqueEmail());
    await page.goto('settings');
    const settings = page.getByRole('link', { name: 'Settings' });
    expect(await isHitTestable(settings)).toBe(true);
    await page.getByRole('button', { name: 'Go Pro' }).click();
    const dialog = page.getByRole('dialog', { name: 'Syntactical Pro' });
    await expect(dialog).toBeVisible();
    // The sheet slides up from below the viewport; hit-test where it comes to rest.
    await dialog.evaluate((element) => Promise.all(element.getAnimations().map(({ finished }) => finished)));
    expect(await isHitTestable(settings)).toBe(false);
    // Settings has its own Sign out beside the app bar's; neither may be reachable under the sheet.
    expect(await isHitTestable(page.getByRole('button', { name: 'Sign out' }).first())).toBe(false);
    expect(await isHitTestable(dialog.getByRole('button', { name: 'Not now' }))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the Pro sheet opened from the Ask limit holds focus and Escape closes only it', async ({ page }) => {
    await signIn(page, createUniqueEmail());
    // The real ask runs; its answer is replaced by the free tier's daily-limit refusal.
    await page.route('**/v1/ask', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      const error = { code: 'ASK_DAILY_LIMIT_REACHED', limit: 5, message: 'limit', proLimit: 20, tier: 'free' };
      return route.fulfill({ body: JSON.stringify({ error }), response, status: 429 });
    });
    await openRoundByKeys(page, '1');
    await page.keyboard.press('1');
    await page.keyboard.press('t');
    await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
    await page.keyboard.press('q');
    await page.getByLabel('Your question about this card').fill('Why is this the answer?');
    await page.getByRole('button', { exact: true, name: 'Ask' }).click();
    await page.getByRole('button', { name: 'See Pro' }).focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Syntactical Pro' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('query-modal')).toHaveCount(0);
    const isFocusInside = () => dialog.evaluate((element) => element.contains(document.activeElement));
    expect(await isFocusInside()).toBe(true);
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await isFocusInside()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('query-modal')).toHaveCount(0);
    await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
  });

  test('the delete-account dialog covers the app bar', async ({ page }) => {
    await signIn(page, createUniqueEmail());
    await page.goto('settings');
    await page.getByRole('button', { exact: true, name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete account' });
    await expect(dialog).toBeVisible();
    expect(await isHitTestable(page.getByRole('link', { name: 'Settings' }))).toBe(false);
    expect(await isHitTestable(page.getByRole('button', { name: 'Sign out' }).first())).toBe(false);
    expect(await isHitTestable(dialog.getByRole('button', { name: 'Cancel' }))).toBe(true);
  });

  test('the sign-out dialog covers the app bar and its own buttons are clickable', async ({ page }) => {
    await signIn(page, createUniqueEmail());
    await page.route('**/v1/answer-events', (route) =>
      route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
    );
    await openRoundByKeys(page, '1');
    await answerQuestions(page, 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sign out' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unsynced answers' });
    await expect(dialog).toBeVisible();
    expect(await isHitTestable(page.getByRole('link', { name: 'Settings' }))).toBe(false);
    for (const name of ['Sync now', 'Discard', 'Cancel']) {
      expect(await isHitTestable(dialog.getByRole('button', { name }))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Sync now' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
