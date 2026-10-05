import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../support/test';
import type { Page } from '@playwright/test';

// When SHOT_DIR is set, the spec also saves a screenshot per viewport for the PR.
async function saveShot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOT_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

test.describe('the app bar layout', () => {
  test('at 1440px the app bar contents line up with the page column', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible();
    await saveShot(page, 'app-bar-1440');
    const column = await page.locator('[role="main"] .max-w-xl').first().boundingBox();
    const logo = await page.getByText('SYNTACTICAL', { exact: true }).boundingBox();
    const signInBox = await signIn.boundingBox();
    if (!column || !logo || !signInBox) throw new Error('Missing a bounding box');
    expect(logo.x).toBeGreaterThanOrEqual(column.x - 1);
    expect(logo.x).toBeLessThanOrEqual(column.x + 1);
    expect(signInBox.x + signInBox.width).toBeLessThanOrEqual(column.x + column.width + 1);
  });

  test('at 375px nothing in the app bar overflows the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('./');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await saveShot(page, 'app-bar-375');
    const overflow = await page.getByRole('banner').evaluate((banner) => {
      const limit = document.documentElement.clientWidth;
      const boxes = [banner, ...banner.querySelectorAll('*')].map((node) => node.getBoundingClientRect());
      return {
        hasPageScroll: document.documentElement.scrollWidth > limit,
        widest: Math.max(...boxes.map((box) => box.right)),
        limit,
      };
    });
    expect(overflow.hasPageScroll).toBe(false);
    expect(overflow.widest).toBeLessThanOrEqual(overflow.limit);
  });
});
