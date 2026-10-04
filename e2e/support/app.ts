// Helpers the specs share: reading the captured sign-in code, signing in through the real sign-in
// screen, answering questions with the keyboard, and reading the database the API writes to.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import pg from 'pg';

import { readState } from './e2eEnv';

const CODE_POLL_MS = 100;
const CODE_TIMEOUT_MS = 15_000;
const EMAIL_BYTES = 6;

function createUniqueEmail(): string {
  return `e2e-${randomBytes(EMAIL_BYTES).toString('hex')}@example.test`;
}

async function listSentCodes(email: string): Promise<string[]> {
  const lines = (await readFile(readState().codesFile, 'utf8')).split('\n').filter(Boolean);
  return lines
    .map((line) => JSON.parse(line) as { code: string; email: string })
    .filter((entry) => entry.email.toLowerCase() === email.toLowerCase())
    .map(({ code }) => code);
}

// The newest code the API "sent" to this address once more than `knownCount` have been sent, read
// from the file only the test can reach.
async function readSignInCode(email: string, knownCount = 0): Promise<string> {
  const deadline = Date.now() + CODE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const codes = await listSentCodes(email);
    if (codes.length > knownCount) return codes[codes.length - 1] ?? '';
    await delay(CODE_POLL_MS);
  }
  throw new Error('No sign-in code was captured');
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('sign-in');
  await page.getByLabel('Email address').fill(email);
  const knownCount = (await listSentCodes(email)).length;
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = await readSignInCode(email, knownCount);
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

// Opens a bank's round from the menu with keys only: language 1, difficulty by position, whole bank.
async function openRoundByKeys(page: Page, difficultyKey: string): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: /syntactical/ })).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.getByText('Step 2 / Select difficulty')).toBeVisible();
  await page.keyboard.press(difficultyKey);
  await expect(page.getByText('Step 3 / Select topic')).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.getByRole('progressbar', { name: /^Question 1 of/ })).toBeVisible();
}

// Answers the open question with the first option (a multiple-choice or A/B option, or True) and moves on, `count` times. Returns
// when the next question or the results screen is showing.
async function answerQuestions(page: Page, count: number): Promise<void> {
  for (let answered = 0; answered < count; answered += 1) {
    await page.keyboard.press('1');
    await page.keyboard.press('t');
    await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { exact: true, name: 'Continue' })).toBeHidden();
  }
}

async function queryDatabase<Row extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: readState().databaseUrl });
  await client.connect();
  try {
    return (await client.query<Row>(sql, values)).rows;
  } finally {
    await client.end();
  }
}

async function readUserId(email: string): Promise<string | undefined> {
  const [row] = await queryDatabase<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return row?.id;
}

export { answerQuestions, createUniqueEmail, openRoundByKeys, queryDatabase, readSignInCode, readUserId, signIn };
