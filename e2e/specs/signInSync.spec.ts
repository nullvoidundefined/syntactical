import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../support/test';
import type { Page } from '@playwright/test';

import { answerQuestions, createUniqueEmail, openRoundByKeys, queryDatabase, readUserId, signIn } from '../support/app';
import { readState } from '../support/e2eEnv';

interface AnswerEventRow {
  bank_key: string;
  choice_index: number;
  is_correct: boolean;
  question_id: string;
  round_kind: string;
}

interface BankQuestion {
  answer?: boolean;
  answerIndex?: number;
  id: string;
  type: string;
}

const GUEST_ANSWER_COUNT = 5;
const LATER_ANSWER_COUNT = 2;
const ANSWER_EVENTS_URL = '**/v1/answer-events';

async function countAnswerEvents(email: string): Promise<number> {
  const rows = await queryDatabase<{ count: string }>(
    'SELECT count(*) FROM answer_events WHERE user_id = (SELECT id FROM users WHERE email = $1)',
    [email],
  );
  return Number(rows[0]?.count ?? 0);
}

// Plays `count` answers of the easy round, then leaves it with Escape.
async function playAndLeave(page: Page, count: number): Promise<void> {
  await openRoundByKeys(page, '1');
  await answerQuestions(page, count);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Step 1 / Select language')).toBeVisible();
}

test.describe('sign-in, claim, and sync', () => {
  test('sign-in claims the guest answers and syncs them with the server-derived result', async ({ page }) => {
    const email = createUniqueEmail();
    await playAndLeave(page, GUEST_ANSWER_COUNT);

    await signIn(page, email);

    await expect.poll(() => countAnswerEvents(email)).toBe(GUEST_ANSWER_COUNT);
    const rows = await queryDatabase<AnswerEventRow>(
      `SELECT bank_key, choice_index, is_correct, question_id, round_kind
         FROM answer_events WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    const bank = JSON.parse(await readFile(join(readState().contentDir, 'python/easy.json'), 'utf8')) as {
      questions: BankQuestion[];
    };
    for (const row of rows) {
      const question = bank.questions.find(({ id }) => id === row.question_id);
      expect(question, `question ${row.question_id} is in the bank`).toBeDefined();
      const answerIndex = question?.type === 'bool' ? (question.answer ? 0 : 1) : question?.answerIndex;
      expect(row.is_correct).toBe(row.choice_index === answerIndex);
      expect(row.round_kind).toBe('bank');
      expect(row.bank_key).toContain('python');
    }
    const [user] = await queryDatabase<{ timezone: string | null }>('SELECT timezone FROM users WHERE email = $1', [
      email,
    ]);
    expect(user?.timezone).toBeTruthy();
  });

  test('signing out with unsynced answers offers Sync now or Discard', async ({ page }) => {
    const email = createUniqueEmail();
    await playAndLeave(page, GUEST_ANSWER_COUNT);
    await signIn(page, email);
    await expect.poll(() => countAnswerEvents(email)).toBe(GUEST_ANSWER_COUNT);

    // Answers given while the API refuses uploads stay unsynced on the device.
    await page.route(ANSWER_EVENTS_URL, (route) =>
      route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
    );
    await playAndLeave(page, LATER_ANSWER_COUNT);
    await page.getByRole('button', { name: 'Sign out' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unsynced answers' });
    await expect(dialog).toBeVisible();

    // Discard drops the unsynced answers and signs out; the server keeps only what it had.
    await dialog.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(await countAnswerEvents(email)).toBe(GUEST_ANSWER_COUNT);
    await page.unroute(ANSWER_EVENTS_URL);

    // Signing back in downloads the synced history; new unsynced answers can be synced at sign-out.
    await signIn(page, email);
    await page.route(ANSWER_EVENTS_URL, (route) =>
      route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
    );
    await playAndLeave(page, LATER_ANSWER_COUNT);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsynced answers' })).toBeVisible();
    await page.unroute(ANSWER_EVENTS_URL);
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(await countAnswerEvents(email)).toBe(GUEST_ANSWER_COUNT + LATER_ANSWER_COUNT);
    expect(await readUserId(email)).toBeDefined();
  });
});
