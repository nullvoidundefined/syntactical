// B-62b: the pino logger client redacts emails, one-time codes, secrets, session tokens,
// cookies, and auth headers, and logs an Error by name, pg code, and constraint only.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';

const VALUE_BYTES = 16;
const PG_UNIQUE_VIOLATION = '23505';
const PG_EMAIL_CONSTRAINT = 'users_email_key';

function capture() {
  const lines: string[] = [];
  const destination = {
    write(chunk: string) {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
    },
  };
  return { lines, logger: createLogger({ destination }) };
}

function runTimeValue(): string {
  return randomBytes(VALUE_BYTES).toString('hex');
}

describe('createLogger', () => {
  it.each([
    ['email', (value: string) => ({ user: { email: `${value}@example.test` } })],
    ['code', (value: string) => ({ code: value })],
    ['otp', (value: string) => ({ otp: value })],
    ['password', (value: string) => ({ password: value })],
    ['secret', (value: string) => ({ webhook: { secret: value } })],
    ['token', (value: string) => ({ session: { token: value } })],
    ['cookie', (value: string) => ({ cookie: value })],
    ['authorization', (value: string) => ({ authorization: `Bearer ${value}` })],
    ['req.headers.cookie', (value: string) => ({ req: { headers: { cookie: `syntactical_session=${value}` } } })],
    ['req.headers.authorization', (value: string) => ({ req: { headers: { authorization: `Bearer ${value}` } } })],
    [
      'res.headers set-cookie',
      (value: string) => ({ res: { headers: { 'set-cookie': [`syntactical_session=${value}; HttpOnly`] } } }),
    ],
  ])('never writes the value of %s', (_field, shape) => {
    const value = runTimeValue();
    const { lines, logger } = capture();
    logger.info(shape(value), 'probe');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"msg":"probe"');
    expect(lines[0]).not.toContain(value);
  });

  it('logs an Error under err by name, pg code, and constraint only', () => {
    const email = `${runTimeValue()}@example.test`;
    const error = Object.assign(new Error(`duplicate key for ${email}`), {
      code: PG_UNIQUE_VIOLATION,
      constraint: PG_EMAIL_CONSTRAINT,
      detail: `Key (email)=(${email}) already exists.`,
    });
    const { lines, logger } = capture();
    logger.error({ err: error }, 'insert failed');
    const entry = JSON.parse(lines[0] ?? '{}') as { err?: unknown };
    expect(entry.err).toEqual({ constraint: PG_EMAIL_CONSTRAINT, name: 'Error', pgCode: PG_UNIQUE_VIOLATION });
    expect(lines.join('\n')).not.toContain(email);
  });

  it('never writes the message of a bare Error logged as the first argument', () => {
    const email = `${runTimeValue()}@example.test`;
    const { lines, logger } = capture();
    logger.error(Object.assign(new Error(`duplicate key for ${email}`), { code: PG_UNIQUE_VIOLATION }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(email);
    expect((JSON.parse(lines[0] ?? '{}') as { err?: unknown }).err).toEqual({ name: 'Error', pgCode: PG_UNIQUE_VIOLATION });
  });

  it('logs an Error under cause by name, pg code, and constraint only', () => {
    const email = `${runTimeValue()}@example.test`;
    const error = Object.assign(new Error(`duplicate key for ${email}`), {
      code: PG_UNIQUE_VIOLATION,
      constraint: PG_EMAIL_CONSTRAINT,
      detail: `Key (email)=(${email}) already exists.`,
    });
    const { lines, logger } = capture();
    logger.error({ cause: error }, 'insert failed');
    const entry = JSON.parse(lines[0] ?? '{}') as { cause?: unknown };
    expect(entry.cause).toEqual({ constraint: PG_EMAIL_CONSTRAINT, name: 'Error', pgCode: PG_UNIQUE_VIOLATION });
    expect(lines.join('\n')).not.toContain(email);
  });
});
