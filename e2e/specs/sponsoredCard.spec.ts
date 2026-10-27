// e2e/specs/sponsoredCard.spec.ts
// The sponsored card on the real web build, fed by the fixture sponsor the e2e content serves
// (e2e/fixtures/sponsor.json, far-future end date): a guest sees one sponsored group on the track list; the
// results card arrives on the third round, in a slot that is there from the results screen's first frame,
// so Retry does not move when the card shows; a Pro user sees neither.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { answerQuestions, createUniqueEmail, queryDatabase, readUserId, signIn } from '../support/app';
import { readState } from '../support/e2eEnv';
import { expect, test } from '../support/test';

const SPONSOR_NAME = 'Sponsored: E2E Sponsor';
const ANY_SPONSORED = { name: /^Sponsored:/ };
const CADENCE_KEY = 'syntactical.sponsor.v1';
const LONG_TEST_TIMEOUT_MS = 240_000;

interface Manifest {
  languages: Array<{ banks: Record<string, { topicCounts?: Record<string, number> }>; id: string }>;
}

// The smallest topic of any Easy bank, so a round stays short.
async function findShortRound(): Promise<{ path: string; size: number }> {
  const manifest = JSON.parse(await readFile(join(readState().contentDir, 'manifest.json'), 'utf8')) as Manifest;
  const rounds = manifest.languages.flatMap(({ banks, id }) =>
    Object.entries(banks.easy?.topicCounts ?? {}).map(([topic, size]) => ({
      path: `${id}/easy/play?topic=${topic}`,
      size,
    })),
  );
  rounds.sort((left, right) => left.size - right.size);
  const [shortest] = rounds;
  if (shortest === undefined) throw new Error('no Easy bank lists topic counts');
  return shortest;
}

async function finishRound(page: Page, size: number): Promise<void> {
  await expect(page.getByRole('progressbar', { name: /^Question 1 of/ })).toBeVisible();
  await answerQuestions(page, size);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
}

test.describe('the sponsored card', () => {
  test('a guest sees one sponsored card on the track list, from the fixture sponsor', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('group', { name: SPONSOR_NAME })).toBeVisible();
    await expect(page.getByRole('group', ANY_SPONSORED)).toHaveCount(1);
    await expect(page.getByRole('link', { name: `${SPONSOR_NAME}. Learn more` })).toBeVisible();
  });

  test('a guest gets the results card on the third round, and Retry does not move when it shows', async ({ page }) => {
    test.setTimeout(LONG_TEST_TIMEOUT_MS);
    const { path, size } = await findShortRound();
    await page.goto(path);
    await finishRound(page, size);
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('group', ANY_SPONSORED)).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry' }).click();
    await finishRound(page, size);
    await expect(page.getByRole('group', ANY_SPONSORED)).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry' }).click();
    await finishRound(page, size);
    const retry = page.getByRole('button', { name: 'Retry' });
    const before = await retry.boundingBox();
    await expect(page.getByRole('group', { name: SPONSOR_NAME })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await retry.boundingBox()).toEqual(before);
  });

  test('a Pro user sees no sponsored card on the track list or the results screen', async ({ page }) => {
    test.setTimeout(LONG_TEST_TIMEOUT_MS);
    const email = createUniqueEmail();
    await signIn(page, email);
    await page.goto('./');
    await expect(page.getByRole('group', { name: SPONSOR_NAME })).toBeVisible();

    await queryDatabase(
      `INSERT INTO entitlements (user_id, product_id, source, status) VALUES ($1, 'syntactical.pro.lifetime', 'e2e', 'granted')`,
      [await readUserId(email)],
    );
    await page.goto('settings');
    await expect(page.getByText('Pro, lifetime')).toBeVisible();

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/v1/me') && response.ok()),
      page.goto('./'),
    ]);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('group', ANY_SPONSORED)).toHaveCount(0);

    // A due results card, as the third round would make it, still shows nothing for Pro.
    await page.evaluate(
      (key) => window.localStorage.setItem(key, JSON.stringify({ completedRounds: 2, roundsSinceLastCard: 2 })),
      CADENCE_KEY,
    );
    const { path, size } = await findShortRound();
    await page.goto(path);
    await finishRound(page, size);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('group', ANY_SPONSORED)).toHaveCount(0);
  });
});
