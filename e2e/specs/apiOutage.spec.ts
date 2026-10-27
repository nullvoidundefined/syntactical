import { expect, test } from '../support/test';

import { answerQuestions, createUniqueEmail, pickAllQuestions, signIn } from '../support/app';

const API_PATTERN = '**/v1/**';
const MEDIUM_BANK_PATH = '/content/python/medium.json';
const MEDIUM_BANK_PATTERN = `**${MEDIUM_BANK_PATH}`;

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

  test('a Medium bank cached by its first use still plays when the API and the content host refuse it', async ({
    page,
  }) => {
    await signIn(page, createUniqueEmail());

    // First use, with the API and the content host up. Nothing prefetches a bank the device has
    // never opened, so this visit is what downloads the Medium bank and caches it on the device.
    const mediumDownload = page.waitForResponse(
      (response) => response.url().endsWith(MEDIUM_BANK_PATH) && response.ok(),
    );
    await page.goto('python');
    await expect(page.getByText('Step 2 / Select difficulty')).toBeVisible();
    await mediumDownload;
    await page.getByRole('button', { name: /^Medium/ }).click();
    await pickAllQuestions(page);
    await answerQuestions(page, 1);
    await page.keyboard.press('Escape');

    // The API is down and the content host refuses the Medium bank: only the cached copy is left.
    await page.route(API_PATTERN, (route) => route.abort('connectionrefused'));
    await page.route(MEDIUM_BANK_PATTERN, (route) => route.abort('connectionrefused'));
    await page.goto('python');
    await expect(page.getByText('Step 2 / Select difficulty')).toBeVisible();
    const medium = page.getByRole('button', { name: /^Medium/ });
    await expect(medium).toBeEnabled();
    await medium.click();
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

    // When both are back, no difficulty reports a failed download.
    await page.unroute(API_PATTERN);
    await page.unroute(MEDIUM_BANK_PATTERN);
    await page.goto('python');
    await expect(page.getByRole('button', { name: /^Medium/ })).toBeEnabled();
    await expect(page.getByText('Download failed. Tap to retry')).toHaveCount(0);
  });
});
