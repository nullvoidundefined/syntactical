// B-62e: findings from the PR #19 security review, round 2. An Error placed in a
// log carries only its name, pg code, and constraint; an error after headers
// were sent leaks nothing to stderr or the log; email and one-time-code key
// variants and child-logger bindings are redacted; X-Forwarded-Host is ignored.
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

describe('errors inside log payloads', () => {
  it.each([
    ['under err', (error: Error) => [{ err: error }, 'failed'] as const],
    ['as the only argument', (error: Error) => [error] as const],
    ['under cause', (error: Error) => [{ cause: error }, 'failed'] as const],
    ['nested two levels', (error: Error) => [{ outer: { error } }, 'failed'] as const],
  ])('logs a pg error %s by name, code, and constraint only', (_label, args) => {
    const email = runTimeEmail();
    const { destination, lines } = capture();
    const logger = createLogger({ destination });
    const [first, second] = args(pgError(email));
    if (second === undefined) {
      logger.error(first);
    } else {
      logger.error(first, second);
    }
    const all = lines.join('\n');
    expect(all).not.toContain(email);
    expect(all).not.toContain('already exists');
    expect(all).not.toMatch(/\n\s+at\s/);
    expect(all).toContain(PG_UNIQUE_VIOLATION);
    expect(all).toContain(PG_CONSTRAINT);
  });
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

describe('key variants and child bindings', () => {
  it.each(['userEmail', 'emailAddress', 'otp', 'otpCode', 'oneTimeCode'])(
    'redacts a value under %s',
    (key) => {
      const value = randomBytes(TOKEN_BYTES).toString('hex');
      const { destination, lines } = capture();
      createLogger({ destination }).info({ [key]: value }, 'probe');
      expect(lines.join('\n')).not.toContain(value);
    },
  );

  it('redacts an email bound on a child logger', () => {
    const email = runTimeEmail();
    const { destination, lines } = capture();
    createLogger({ destination }).child({ email }).info('probe');
    expect(lines.join('\n')).not.toContain(email);
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
