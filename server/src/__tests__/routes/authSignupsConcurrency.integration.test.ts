// Task 7.4 (B-75 race, B-79 at sign-up): two concurrent POST /v1/auth/signups/verify requests
// with one correct code create one user and one session; with every hash slot held, a verify
// answers 503 SERVER_BUSY after the queue timeout, stores nothing, and leaves the code usable;
// and a verify waiting for a slot, or running its derivation, holds no pooled client (a pool
// with max 1 still serves /health/ready); and the breach check runs before a verify waits for a
// slot. Every password is built at run time.
import { randomBytes, scrypt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { PasswordBreachClient } from '../../clients/passwordBreachClient.js';
import { AUTH } from '../../constants/auth.js';
import type { DeriveKey } from '../../services/passwordHash.js';
import { createPasswordHashSlots } from '../../services/passwordHashSlots.js';
import { createAuthTestApp } from '../integration/createAuthTestApp.js';
import { createMigratedDatabase } from '../integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;

const CODES_ROUTE = '/v1/auth/codes';
const VERIFY_ROUTE = '/v1/auth/signups/verify';
const READY_ROUTE = '/health/ready';
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const RESPONSE_DEADLINE_MS = 1_500;
const EMAIL_BYTES = 6;
const PASSWORD_BYTES = 12;
const ONE_SLOT = 1;
const DEADLINE_PASSED = 'deadline passed';

const realDeriveKey = promisify(scrypt) as DeriveKey;

let database: Awaited<ReturnType<typeof createMigratedDatabase>>;

type TestApp = ReturnType<typeof createAuthTestApp>;

interface PasswordHashSlots {
  run<T>(task: () => Promise<T>): Promise<T>;
}

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function buildPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

function withPassword(value: string): Record<'password', string> {
  return { password: value };
}

async function issueCode({ app, sentCodes }: TestApp, email: string): Promise<string> {
  const response = await request(app).post(CODES_ROUTE).send({ email });
  expect(response.status).toBe(HTTP_ACCEPTED);
  const { code } = sentCodes[sentCodes.length - 1];
  return code;
}

function postVerify({ app }: TestApp, body: Record<string, unknown>): Promise<request.Response> {
  return request(app)
    .post(VERIFY_ROUTE)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send(body)
    .then((response) => response);
}

async function within<T>(pending: PromiseLike<T>, milliseconds: number): Promise<T | typeof DEADLINE_PASSED> {
  const passed = delay(milliseconds).then((): typeof DEADLINE_PASSED => DEADLINE_PASSED);
  return Promise.race([Promise.resolve(pending), passed]);
}

function createGate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

// Holds the only slot of `slots` until release() is called.
function holdSlot(slots: PasswordHashSlots) {
  const gate = createGate();
  const held = slots.run(() => gate.opened);
  return { held, release: gate.open };
}

// Wraps slots so the test learns when a request has asked for one.
function createSignallingSlots(inner: PasswordHashSlots) {
  const asked = createGate();
  const slots: PasswordHashSlots = {
    run(task) {
      asked.open();
      return inner.run(task);
    },
  };
  return { asked: asked.opened, slots };
}

async function countRows(table: 'sessions' | 'users'): Promise<number> {
  const { rows } = await database.pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(rows[0]?.count);
}

async function readCodes(email: string) {
  const { rows } = await database.pool.query<{ attempts: number; used_at: Date | null }>(
    'SELECT attempts, used_at FROM one_time_codes WHERE email = $1 ORDER BY created_at',
    [email],
  );
  return rows.map(({ attempts, used_at: usedAt }) => ({ attempts, usedAt }));
}

describe.skipIf(SKIP_DATABASE_TESTS)('POST /v1/auth/signups/verify under concurrency', () => {
  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it(
    'creates exactly one user and one session when two verifies race with one correct code',
    async () => {
      const testApp = createAuthTestApp({ pool: database.pool });
      const email = buildEmail();
      const code = await issueCode(testApp, email);

      const responses = await Promise.all([
        postVerify(testApp, { code, email, ...withPassword(buildPassword()) }),
        postVerify(testApp, { code, email, ...withPassword(buildPassword()) }),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([HTTP_CREATED, HTTP_BAD_REQUEST]);
      expect(await countRows('users')).toBe(1);
      expect(await countRows('sessions')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'answers 503 SERVER_BUSY when no slot frees within the queue timeout, storing nothing and keeping the code usable',
    async () => {
      const passwordHashSlots = createPasswordHashSlots({
        concurrency: ONE_SLOT,
        queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
      });
      const testApp = createAuthTestApp({ passwordHashSlots, pool: database.pool });
      const email = buildEmail();
      const code = await issueCode(testApp, email);
      const { held, release } = holdSlot(passwordHashSlots);

      let busy: request.Response;
      try {
        busy = await postVerify(testApp, { code, email, ...withPassword(buildPassword()) });
      } finally {
        release();
        await held;
      }
      const codesAfterBusy = await readCodes(email);
      const usersAfterBusy = await countRows('users');
      const sessionsAfterBusy = await countRows('sessions');
      const retried = await postVerify(testApp, { code, email, ...withPassword(buildPassword()) });

      expect(busy.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect((busy.body as { error?: { code?: string } }).error?.code).toBe('SERVER_BUSY');
      expect(usersAfterBusy).toBe(0);
      expect(sessionsAfterBusy).toBe(0);
      expect(codesAfterBusy).toEqual([{ attempts: 0, usedAt: null }]);
      expect(retried.status).toBe(HTTP_CREATED);
      expect(await countRows('users')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'holds no pooled client while waiting for a slot: a pool with max 1 still serves /health/ready',
    async () => {
      const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
      const inner = createPasswordHashSlots({
        concurrency: ONE_SLOT,
        queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
      });
      const { asked, slots } = createSignallingSlots(inner);
      const testApp = createAuthTestApp({ passwordHashSlots: slots, pool: singleClientPool });
      const email = buildEmail();
      const { held, release } = holdSlot(inner);
      try {
        const code = await issueCode(testApp, email);
        const verifying = postVerify(testApp, { code, email, ...withPassword(buildPassword()) });
        const hasAsked = await within(asked, RESPONSE_DEADLINE_MS);

        const ready = await within(request(testApp.app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);
        release();
        const verified = await within(verifying, TEST_TIMEOUT_MS / 2);

        expect(hasAsked).not.toBe(DEADLINE_PASSED);
        expect(ready).not.toBe(DEADLINE_PASSED);
        expect((ready as request.Response).status).toBe(HTTP_OK);
        expect((verified as request.Response).status).toBe(HTTP_CREATED);
      } finally {
        release();
        await held;
        await singleClientPool.end();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'holds no pooled client while deriving: a pool with max 1 still serves /health/ready',
    async () => {
      const singleClientPool = new pg.Pool({ connectionString: database.databaseUrl, max: 1 });
      const started = createGate();
      const finish = createGate();
      const deriveKey: DeriveKey = async (input, salt, keyBytes, options) => {
        started.open();
        await finish.opened;
        return realDeriveKey(input, salt, keyBytes, options);
      };
      const testApp = createAuthTestApp({ deriveKey, pool: singleClientPool });
      const email = buildEmail();
      try {
        const code = await issueCode(testApp, email);
        const verifying = postVerify(testApp, { code, email, ...withPassword(buildPassword()) });
        const hasStarted = await within(started.opened, RESPONSE_DEADLINE_MS);

        const ready = await within(request(testApp.app).get(READY_ROUTE), RESPONSE_DEADLINE_MS);
        finish.open();
        const verified = await within(verifying, TEST_TIMEOUT_MS / 2);

        expect(hasStarted).not.toBe(DEADLINE_PASSED);
        expect(ready).not.toBe(DEADLINE_PASSED);
        expect((ready as request.Response).status).toBe(HTTP_OK);
        expect((verified as request.Response).status).toBe(HTTP_CREATED);
      } finally {
        finish.open();
        await singleClientPool.end();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'runs the breach check before waiting for a hash slot: the breach client is asked while every slot is held',
    async () => {
      const passwordHashSlots = createPasswordHashSlots({
        concurrency: ONE_SLOT,
        queueTimeoutMs: AUTH.PASSWORD.HASH_QUEUE_TIMEOUT_MS,
      });
      const { held, release } = holdSlot(passwordHashSlots);
      let isSlotHeld = true;
      const askedWhileHeld: boolean[] = [];
      const breachAsked = createGate();
      const passwordBreachClient: PasswordBreachClient = {
        fetchRange() {
          askedWhileHeld.push(isSlotHeld);
          breachAsked.open();
          return Promise.resolve('');
        },
      };
      const testApp = createAuthTestApp({ passwordBreachClient, passwordHashSlots, pool: database.pool });
      const email = buildEmail();
      try {
        const code = await issueCode(testApp, email);
        const verifying = postVerify(testApp, { code, email, ...withPassword(buildPassword()) });
        const hasAsked = await within(breachAsked.opened, RESPONSE_DEADLINE_MS);
        isSlotHeld = false;
        release();
        const verified = await within(verifying, TEST_TIMEOUT_MS / 2);

        expect(hasAsked).not.toBe(DEADLINE_PASSED);
        expect(askedWhileHeld).toEqual([true]);
        expect((verified as request.Response).status).toBe(HTTP_CREATED);
      } finally {
        isSlotHeld = false;
        release();
        await held;
      }
    },
    TEST_TIMEOUT_MS,
  );
});
