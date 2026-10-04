// The entrypoint's wiring against a scratch database and fixture content: it answers /health and
// /health/ready, shuts down cleanly, fails fast on a bad environment, and refuses to start when a
// paid bank is tampered with or missing. Every secret is generated at run time.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH } from '../constants/auth.js';
import { startServer } from '../startServer.js';
import type { RunningServer } from '../startServer.js';

import { createMigratedDatabase } from './integration/createMigratedDatabase.js';

const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;
const SETUP_TIMEOUT_MS = 120_000;
const SECRET_BYTES = 24;
const HTTP_OK = 200;

const PROVENANCE = {
  isHumanReviewed: false,
  source: 'original',
  validation: { method: 'judged', status: 'pending' },
};

function serializeBank(id: string): Buffer {
  const question = {
    answerIndex: 1,
    choices: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
    id,
    prompt: 'A prompt',
    provenance: PROVENANCE,
    query: { explanation: 'Because.', title: 'A rule' },
    type: 'mc',
  };
  return Buffer.from(`${JSON.stringify({ questions: [question], schemaVersion: 2 }, null, 2)}\n`, 'utf8');
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function bankEntry(path: string, bytes: Buffer, access: 'free' | 'paid', productId?: string) {
  return {
    access,
    contentVersion: 1,
    hash: sha256Hex(bytes),
    path,
    topicCounts: {},
    ...(productId ? { productId } : {}),
  };
}

const FREE_BANK = serializeBank('py-easy-1');
const PAID_BANK = serializeBank('py-medium-1');

async function writeUnder(root: string, relativePath: string, bytes: Buffer | string): Promise<void> {
  const file = join(root, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function writeContent(contentDir: string, paidDir: string, options: { hasPaidFile?: boolean } = {}) {
  const { hasPaidFile = true } = options;
  const banks = {
    easy: bankEntry('python/easy.json', FREE_BANK, 'free'),
    medium: bankEntry('python/medium.json', PAID_BANK, 'paid', 'syntactical.python.medium'),
  };
  const language = {
    banks,
    glyph: 'PY',
    grammar: 'python',
    id: 'python',
    label: 'Python',
    misconceptions: [],
    tagline: 'Tagline.',
    topics: [],
  };
  await writeUnder(contentDir, 'manifest.json', JSON.stringify({ languages: [language], schemaVersion: 2 }));
  await writeUnder(contentDir, 'python/easy.json', FREE_BANK);
  if (hasPaidFile) await writeUnder(paidDir, 'python/medium.json', PAID_BANK);
}

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

describe.skipIf(SKIP_DATABASE_TESTS)('startServer', () => {
  let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let contentDir: string;
  let paidDir: string;
  let running: RunningServer | undefined;
  const logger = pino({ level: 'silent' });

  function buildSource(): NodeJS.ProcessEnv {
    return {
      ALLOWED_ORIGINS: 'https://syntactical.dev',
      CONTENT_DIR: contentDir,
      DATABASE_URL: database.databaseUrl,
      EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
      NODE_ENV: 'test',
      PAID_CONTENT_DIR: paidDir,
      PORT: '0',
      PUBLIC_BASE_URL: 'https://api.syntactical.dev',
      RATE_LIMIT_KEY_SECRET: randomSecret(),
      RESEND_API_KEY: randomSecret(),
      REVENUECAT_WEBHOOK_AUTH: randomSecret(),
    };
  }

  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    contentDir = await mkdtemp(join(tmpdir(), 'start-server-content-'));
    paidDir = await mkdtemp(join(tmpdir(), 'start-server-paid-'));
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
    await rm(contentDir, { force: true, recursive: true });
    await rm(paidDir, { force: true, recursive: true });
  });

  it('answers /health and /health/ready once started', async () => {
    await writeContent(contentDir, paidDir);
    running = await startServer(buildSource(), { logger });

    const health = await fetch(`http://127.0.0.1:${running.port}/health`);
    expect(health.status).toBe(HTTP_OK);
    expect(await health.json()).toEqual({ status: 'ok' });

    const ready = await fetch(`http://127.0.0.1:${running.port}/health/ready`);
    expect(ready.status).toBe(HTTP_OK);
    expect(await ready.json()).toEqual({ database: 'ok', status: 'ok' });
  });

  it('serves a paid bank route only behind a session', async () => {
    await writeContent(contentDir, paidDir);
    running = await startServer(buildSource(), { logger });

    const response = await fetch(`http://127.0.0.1:${running.port}/v1/banks/python/medium`);
    expect(response.status).toBe(401);
  });

  it('wires CORS and the CSRF guard to the one allowed origin', async () => {
    await writeContent(contentDir, paidDir);
    running = await startServer(buildSource(), { logger });
    const base = `http://127.0.0.1:${running.port}`;

    const foreign = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const allowed = await fetch(`${base}/health`, { headers: { Origin: 'https://syntactical.dev' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://syntactical.dev');

    const cookie = `${AUTH.SESSION.COOKIE_NAME}=${randomSecret()}`;
    const withoutHeader = await fetch(`${base}/v1/auth/sessions`, {
      body: '{}',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      method: 'POST',
    });
    expect(withoutHeader.status).toBe(403);
    const foreignWithHeader = await fetch(`${base}/v1/auth/sessions`, {
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://evil.example',
        'X-Requested-With': 'XMLHttpRequest',
      },
      method: 'POST',
    });
    expect(foreignWithHeader.status).toBe(403);
  });

  it('stops accepting connections after close', async () => {
    await writeContent(contentDir, paidDir);
    const started = await startServer(buildSource(), { logger });
    await started.close();

    await expect(fetch(`http://127.0.0.1:${started.port}/health`)).rejects.toThrow();
  });

  it('refuses to start when a paid bank does not match its manifest hash', async () => {
    await writeContent(contentDir, paidDir);
    await writeUnder(paidDir, 'python/medium.json', Buffer.concat([PAID_BANK, Buffer.from(' ')]));

    await expect(startServer(buildSource(), { logger })).rejects.toThrow(/Bank hash mismatch/);
  });

  it('refuses to start when a paid bank file is missing', async () => {
    await writeContent(contentDir, paidDir, { hasPaidFile: false });

    await expect(startServer(buildSource(), { logger })).rejects.toThrow(/Paid bank missing/);
  });

  it('fails fast on a missing variable, naming it and never a value', async () => {
    await writeContent(contentDir, paidDir);
    const source = buildSource();
    const secret = source.RESEND_API_KEY ?? '';
    delete source.REVENUECAT_WEBHOOK_AUTH;

    const failure = await startServer(source, { logger }).then(
      () => new Error('started'),
      (error: Error) => error,
    );
    expect(failure.message).toContain('REVENUECAT_WEBHOOK_AUTH');
    expect(failure.message).not.toContain(secret);
  });
});
