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
  test('the paywall covers the app bar', async ({ page }) => {
    await signIn(page, createUniqueEmail());
    await page.goto('python');
    const settings = page.getByRole('link', { name: 'Settings' });
    expect(await isHitTestable(settings)).toBe(true);
    await page.getByRole('button', { name: 'Medium, locked' }).click();
    await expect(page.getByRole('dialog', { name: 'Unlock Medium' })).toBeVisible();
    expect(await isHitTestable(settings)).toBe(false);
    expect(await isHitTestable(page.getByRole('button', { name: 'Sign out' }))).toBe(false);
    expect(await isHitTestable(page.getByRole('button', { name: 'Not now' }))).toBe(true);
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
    await dialog.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Sync now' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
