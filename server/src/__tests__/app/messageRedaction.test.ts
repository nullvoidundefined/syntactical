// B-62h: findings from the PR #19 security review, round 5. Every payload key
// named message, in any case and at any depth, is censored whatever its siblings.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';

const TOKEN_BYTES = 12;

function capture() {
  const lines: string[] = [];
  return { destination: { write: (chunk: string) => lines.push(chunk) }, lines };
}

describe('message keys in a log payload', () => {
  it.each([
    ['pgCode sibling', (text: string) => ({ failure: { message: text, pgCode: '22P02' } })],
    ['statusCode sibling', (text: string) => ({ failure: { message: text, statusCode: 400 } })],
    ['errorCode sibling', (text: string) => ({ failure: { errorCode: 'E1', message: text } })],
    ['name sibling', (text: string) => ({ failure: { message: text, name: 'Error' } })],
    ['file and line siblings', (text: string) => ({ failure: { file: 'x.c', line: '1', message: text } })],
    ['capitalized Message', (text: string) => ({ failure: { Message: text, code: '22P02' } })],
    ['top-level message', (text: string) => ({ message: text })],
    ['nested uppercase MESSAGE', (text: string) => ({ a: { b: { MESSAGE: text } } })],
  ])('censors the message for %s', (_label, shape) => {
    const value = randomBytes(TOKEN_BYTES).toString('hex');
    const { destination, lines } = capture();
    const logger = createLogger({ destination });
    logger.info(shape(`bad value ${value}`), 'payload');
    expect(lines.join('')).not.toContain(value);
  });
});
