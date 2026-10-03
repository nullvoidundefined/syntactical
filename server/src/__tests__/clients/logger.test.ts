// B-62b: the pino logger client redacts emails, one-time codes, session tokens, and auth headers.
import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';

const TOKEN_BYTES = 32;
const CODE_BYTES = 8;
const EMAIL_LOCAL_PART_BYTES = 6;
const SESSION_COOKIE_NAME = 'syntactical_session';

interface CapturedDestination {
  lines: string[];
  write(chunk: string): void;
}

function createCapturedDestination(): CapturedDestination {
  const lines: string[] = [];
  return {
    lines,
    write(chunk: string) {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
    },
  };
}

function buildSecrets() {
  return {
    authorizationToken: randomBytes(TOKEN_BYTES).toString('hex'),
    code: randomBytes(CODE_BYTES).toString('hex'),
    cookieToken: randomBytes(TOKEN_BYTES).toString('hex'),
    email: `learner-${randomBytes(EMAIL_LOCAL_PART_BYTES).toString('hex')}@example.com`,
    setCookieToken: randomBytes(TOKEN_BYTES).toString('hex'),
    token: randomBytes(TOKEN_BYTES).toString('hex'),
  };
}

describe('createLogger', () => {
  it('writes a JSON line with no email, code, token, cookie, authorization, or set-cookie value', () => {
    const destination = createCapturedDestination();
    const logger = createLogger({ destination });
    const secrets = buildSecrets();
    const marker = randomUUID();

    logger.info(
      {
        marker,
        otp: { code: secrets.code },
        req: {
          headers: {
            authorization: `Bearer ${secrets.authorizationToken}`,
            cookie: `${SESSION_COOKIE_NAME}=${secrets.cookieToken}`,
          },
          method: 'GET',
          url: '/v1/me',
        },
        res: {
          headers: {
            'set-cookie': `${SESSION_COOKIE_NAME}=${secrets.setCookieToken}; HttpOnly; Secure; SameSite=Lax; Path=/`,
          },
          statusCode: 200,
        },
        session: { token: secrets.token },
        user: { email: secrets.email },
      },
      'redaction probe',
    );

    expect(destination.lines).toHaveLength(1);
    const [line] = destination.lines;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.msg).toBe('redaction probe');
    expect(parsed.marker).toBe(marker);
    expect((parsed.req as { url: string }).url).toBe('/v1/me');
    for (const value of Object.values(secrets)) {
      expect(line).not.toContain(value);
    }
  });

  it('redacts a set-cookie header given as an array of cookies', () => {
    const destination = createCapturedDestination();
    const logger = createLogger({ destination });
    const firstToken = randomBytes(TOKEN_BYTES).toString('hex');
    const secondToken = randomBytes(TOKEN_BYTES).toString('hex');

    logger.info(
      {
        res: {
          headers: {
            'set-cookie': [`${SESSION_COOKIE_NAME}=${firstToken}; HttpOnly`, `other=${secondToken}; HttpOnly`],
          },
        },
      },
      'set-cookie array probe',
    );

    expect(destination.lines).toHaveLength(1);
    expect(destination.lines[0]).toContain('set-cookie array probe');
    expect(destination.lines[0]).not.toContain(firstToken);
    expect(destination.lines[0]).not.toContain(secondToken);
  });
});
