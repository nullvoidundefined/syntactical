import { expect, test } from '../support/test';
import type { Page } from '@playwright/test';

const MAX_TABS = 25;

// Presses Tab until the focused element's text matches, so the test follows the real focus order.
async function tabTo(page: Page, text: RegExp): Promise<void> {
  for (let presses = 0; presses < MAX_TABS; presses += 1) {
    await page.keyboard.press('Tab');
    const focusedText = await page.evaluate(() => {
      const element = document.activeElement;
      return `${element?.getAttribute('aria-label') ?? ''} ${element?.textContent ?? ''}`;
    });
    if (text.test(focusedText)) return;
  }
  throw new Error(`Tab never reached an element matching ${text}`);
}

// Presses Tab until focus is on an answer option: inside the page content, not the Back or Query
// buttons. The first question may be multiple choice or true/false, so the options are not named.
async function tabToAnswerOption(page: Page): Promise<void> {
  for (let presses = 0; presses < MAX_TABS; presses += 1) {
    await page.keyboard.press('Tab');
    const isOption = await page.evaluate(() => {
      const element = document.activeElement;
      const label = element?.getAttribute('aria-label') ?? '';
      return (
        element?.tagName === 'BUTTON' &&
        element.closest('[role="main"]') !== null &&
        !/^(Back to menu|Query)$/i.test(label) &&
        !/query/i.test(element.textContent ?? '')
      );
    });
    if (isOption) return;
  }
  throw new Error('Tab never reached an answer option');
}

test('a round can be played with the keyboard alone', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Step 1 / Select language')).toBeVisible();

  // Menus: Tab to a card and press Enter.
  await tabTo(page, /^\s*Python/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Step 2 / Select difficulty')).toBeVisible();
  await tabTo(page, /^\s*Easy/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Step 3 / Select topic')).toBeVisible();
  await tabTo(page, /^\s*Whole bank/);
  await page.keyboard.press('Enter');
  // With no question count in the manifest the length step shows; Tab to "All questions".
  const lengthStep = page.getByText('Step 4 / Select length');
  const round = page.getByRole('progressbar', { name: /^Question 1 of/ });
  await expect(lengthStep.or(round)).toBeVisible();
  if (await lengthStep.isVisible()) {
    await tabTo(page, /^\s*All/);
    await page.keyboard.press('Enter');
  }
  await expect(round).toBeVisible();

  // Question 1: Tab to a choice, answer with Enter, then Continue with Enter.
  await tabToAnswerOption(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('progressbar', { name: /^Question 2 of/ })).toBeVisible();

  // Question 2: answer with a key binding, open and close the query with Q and Escape.
  await page.keyboard.press('1');
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
  await page.keyboard.press('q');
  await expect(page.getByRole('button', { name: 'Close query' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Close query' })).toBeHidden();
  await expect(page.getByRole('progressbar', { name: /^Question 2 of/ })).toBeVisible();

  // Escape with nothing open leaves the round for the menu.
  await page.keyboard.press('Escape');
  await expect(page.getByText('Step 1 / Select language')).toBeVisible();
});
