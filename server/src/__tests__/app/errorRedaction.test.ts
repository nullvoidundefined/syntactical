// B-62e: an error after headers were sent leaks nothing to stderr or the log, and
// X-Forwarded-Host is ignored.
import { randomBytes } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';

const HTTP_OK = 200;
const TOKEN_BYTES = 12;
const PG_UNIQUE_VIOLATION = '23505';
const PG_CONSTRAINT = 'users_email_key';

function capture() {
  const lines: string[] = [];
  return {
    destination: {
      write(chunk: string) {
        lines.push(...chunk.split('\n').filter((line) => line.length > 0));
      },
    },
    lines,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function runTimeEmail(): string {
  return `${randomBytes(TOKEN_BYTES).toString('hex')}@example.test`;
}

function pgError(email: string): Error {
  return Object.assign(new Error(`duplicate key for ${email}`), {
    code: PG_UNIQUE_VIOLATION,
    constraint: PG_CONSTRAINT,
    detail: `Key (email)=(${email}) already exists.`,
    where: `row for ${email}`,
  });
}

function okDb() {
  return { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errors after headers were sent', () => {
  it('writes the pg error detail neither to stderr nor to the log', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const email = runTimeEmail();
    const stderr: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
      stderr.push(parts.map(String).join(' '));
    });
    const { destination, lines } = capture();
    const app = createApp({
      db: okDb(),
      extraRoutes: (router: Router) => {
        router.get('/partial', (_req, res) => {
          res.status(HTTP_OK).write('partial');
          throw pgError(email);
        });
      },
      logger: createLogger({ destination }),
    });
    await request(app)
      .get('/partial')
      .catch(() => undefined);
    await flush();
    expect(stderr.join('\n')).not.toContain(email);
    expect(lines.join('\n')).not.toContain(email);
    expect(lines.some((line) => line.includes(PG_UNIQUE_VIOLATION))).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('forwarded host', () => {
  it('never takes req.hostname from X-Forwarded-Host', async () => {
    let seenHost = '';
    const app = createApp({
      db: okDb(),
      extraRoutes: (router: Router) => {
        router.get('/host', (req, res) => {
          seenHost = req.hostname;
          res.status(HTTP_OK).json({ ok: true });
        });
      },
      logger: createLogger({ destination: capture().destination }),
    });
    await request(app).get('/host').set('X-Forwarded-Host', 'evil.example');
    expect(seenHost).not.toBe('evil.example');
    await request(app).get('/host').set('X-Forwarded-Host', 'evil.example, syntactical.dev');
    expect(seenHost).not.toBe('evil.example');
  });
});
