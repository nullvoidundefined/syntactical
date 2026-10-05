import { expect, test } from '../support/test';

import { answerQuestions, createUniqueEmail, pickAllQuestions, signIn } from '../support/app';

const API_PATTERN = '**/v1/**';

test.describe('an API outage', () => {
  test('sign-in says the service is unavailable instead of failing silently', async ({ page }) => {
    await page.route(API_PATTERN, (route) => route.abort('connectionrefused'));
    await page.goto('sign-in');
    await page.getByRole('button', { name: 'Use a code instead' }).click();
    await page.getByLabel('Email address').fill(createUniqueEmail());
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText('Sign-in is unavailable right now');
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('a signed-in user keeps the free banks and sees the paid banks as unavailable, then recovers', async ({
    page,
  }) => {
    await signIn(page, createUniqueEmail());
    await page.route(API_PATTERN, (route) => route.abort('connectionrefused'));
    await page.goto('python');

    // The app renders, the free bank still plays, and the paid banks say they could not load.
    await expect(page.getByText('Step 2 / Select difficulty')).toBeVisible();
    await expect(page.getByText('Download failed. Tap to retry')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Easy/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Easy/ }).click();
    await page.keyboard.press('1');
    await pickAllQuestions(page);
    await answerQuestions(page, 2);
    await page.keyboard.press('Escape');

    // The account page still opens, and a delete attempt fails with a message and changes nothing.
    await page.goto('settings');
    await page.getByRole('button', { exact: true, name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete account' });
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await dialog.getByRole('button', { name: 'Delete my account' }).click();
    await expect(dialog.getByRole('alert')).toContainText('could not be deleted');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();

    // When the API is back, the paid banks recover to their real state (locked, no entitlement).
    await page.unroute(API_PATTERN);
    await page.goto('python');
    await expect(page.getByRole('button', { name: 'Medium, locked' })).toBeVisible();
    await expect(page.getByText('Download failed. Tap to retry')).toHaveCount(0);
  });
});
