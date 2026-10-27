// server/src/__tests__/startServerPublicContent.integration.test.ts
// Area 2: the API starts from one public content directory holding every bank, with no
// PAID_CONTENT_DIR. The paid bank route is gone (404, not 401), and a Medium bank whose bytes do
// not match the manifest still refuses the start. Every secret is generated at run time.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SUPPORTED_SCHEMA_VERSION } from '@syntactical/content-schema';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { startServer } from '../startServer.js';
import type { RunningServer } from '../startServer.js';

import { createMigratedDatabase } from './integration/createMigratedDatabase.js';
import { SKIP_DATABASE_TESTS } from './integration/skipDatabaseTests.js';

const SETUP_TIMEOUT_MS = 120_000;
const SECRET_BYTES = 24;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const PROVENANCE = { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } };

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
  return Buffer.from(`${JSON.stringify({ questions: [question], schemaVersion: SUPPORTED_SCHEMA_VERSION })}\n`, 'utf8');
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeUnder(root: string, relativePath: string, bytes: Buffer | string): Promise<void> {
  const file = join(root, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

// Every bank in the one public directory; the manifest carries no access or productId.
async function writePublicContent(contentDir: string): Promise<void> {
  const banks: Record<string, unknown> = {};
  for (const difficulty of DIFFICULTIES) {
    const bytes = serializeBank(`fixture-${difficulty}-1`);
    const path = `python/${difficulty}.json`;
    await writeUnder(contentDir, path, bytes);
    banks[difficulty] = { contentVersion: 1, hash: sha256Hex(bytes), path, topicCounts: {} };
  }
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
  await writeUnder(
    contentDir,
    'manifest.json',
    JSON.stringify({ languages: [language], schemaVersion: SUPPORTED_SCHEMA_VERSION }),
  );
}

describe.skipIf(SKIP_DATABASE_TESTS)('startServer from public content only', () => {
  let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let contentDir: string;
  let running: RunningServer | undefined;
  const logger = pino({ level: 'silent' });

  function buildSource(): NodeJS.ProcessEnv {
    return {
      ALLOWED_ORIGINS: 'https://syntactical.dev',
      CONTENT_DIR: contentDir,
      DATABASE_URL: database.databaseUrl,
      EMAIL_FROM: 'Syntactical <sign-in@syntactical.dev>',
      NODE_ENV: 'test',
      PORT: '0',
      RATE_LIMIT_KEY_SECRET: randomBytes(SECRET_BYTES).toString('hex'),
      RESEND_API_KEY: randomBytes(SECRET_BYTES).toString('hex'),
      REVENUECAT_WEBHOOK_AUTH: randomBytes(SECRET_BYTES).toString('hex'),
    };
  }

  beforeAll(async () => {
    database = await createMigratedDatabase(inject('testDatabaseUrl'));
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await database?.drop();
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    contentDir = await mkdtemp(join(tmpdir(), 'start-server-public-'));
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
    await rm(contentDir, { force: true, recursive: true });
  });

  it('starts with no PAID_CONTENT_DIR and answers /health/ready', async () => {
    await writePublicContent(contentDir);
    running = await startServer(buildSource(), { logger });

    const ready = await fetch(`http://127.0.0.1:${running.port}/health/ready`);
    expect(ready.status).toBe(HTTP_OK);
  });

  it('has no paid bank route', async () => {
    await writePublicContent(contentDir);
    running = await startServer(buildSource(), { logger });

    const response = await fetch(`http://127.0.0.1:${running.port}/v1/banks/python/medium`);
    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it('refuses to start when a Medium bank does not match its manifest hash', async () => {
    await writePublicContent(contentDir);
    await writeUnder(
      contentDir,
      'python/medium.json',
      Buffer.concat([serializeBank('fixture-medium-1'), Buffer.from(' ')]),
    );

    await expect(startServer(buildSource(), { logger })).rejects.toThrow(/Bank hash mismatch: python\/medium\.json/);
  });

  it('refuses to start when a listed Medium bank file is missing', async () => {
    await writePublicContent(contentDir);
    await rm(join(contentDir, 'python/medium.json'));

    const starting = startServer(buildSource(), { logger }).then((server) => {
      running = server;
      return server;
    });
    await expect(starting).rejects.toThrow(/Bank missing: python\/medium\.json/);
  });
});
