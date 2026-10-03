// Guards for B-62e: redaction must not swallow the fields the error handler and
// request logger rely on, and a token suffix stays redacted.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';

const HTTP_OK = 200;
const PG_UNIQUE_VIOLATION = '23505';
const TOKEN_BYTES = 12;

function capture() {
  const lines: string[] = [];
  return { destination: { write: (chunk: string) => lines.push(chunk) }, lines };
}

describe('redaction guards', () => {
  it('keeps pgCode and statusCode readable', () => {
    const { destination, lines } = capture();
    createLogger({ destination }).info({ pgCode: PG_UNIQUE_VIOLATION, statusCode: HTTP_OK }, 'probe');
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry.pgCode).toBe(PG_UNIQUE_VIOLATION);
    expect(entry.statusCode).toBe(HTTP_OK);
  });

  it('redacts a value under refreshToken', () => {
    const value = randomBytes(TOKEN_BYTES).toString('hex');
    const { destination, lines } = capture();
    createLogger({ destination }).info({ refreshToken: value }, 'probe');
    expect(lines.join('\n')).not.toContain(value);
  });
});
