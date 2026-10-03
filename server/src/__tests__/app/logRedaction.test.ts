// B-62b: request logs through createApp carry the request id and never a token, email, or pg detail;
// unhandled errors fail closed with a generic 500.
import { randomBytes, randomUUID } from 'node:crypto';

import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../clients/logger.js';

const HTTP_OK = 200;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const TOKEN_BYTES = 32;
const EMAIL_LOCAL_PART_BYTES = 6;
const SESSION_COOKIE_NAME = 'syntactical_session';
const PG_UNIQUE_VIOLATION = '23505';
const PG_EMAIL_CONSTRAINT = 'users_email_key';
const INTERNAL_ERROR_CODE = 'SERVER_INTERNAL_ERROR';
const PINO_ERROR_LEVEL = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STACK_FRAME_PATTERN = /\n\s+at\s/;

const SESSION_ROUTE = '/test/session-cookie';
const PG_ERROR_ROUTE = '/test/pg-unique-violation';
const GENERIC_ERROR_ROUTE = '/test/unhandled';

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

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_LOCAL_PART_BYTES).toString('hex')}@example.com`;
}

function buildToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

// Shaped like the error node-postgres raises for a unique violation on users.email.
function buildPgUniqueViolation(email: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint for ${email}`), {
    code: PG_UNIQUE_VIOLATION,
    constraint: PG_EMAIL_CONSTRAINT,
    detail: `Key (email)=(${email}) already exists.`,
    schema: 'public',
    severity: 'ERROR',
    table: 'users',
  });
}

interface Fixture {
  destination: CapturedDestination;
  app: ReturnType<typeof createApp>;
}

function createFixture(routes: { sessionToken: string; pgError: Error; genericError: Error }): Fixture {
  const destination = createCapturedDestination();
  const logger = createLogger({ destination });
  const db = { query: async (_sql: string): Promise<unknown> => ({ rows: [{ ready: 1 }] }) };
  const app = createApp({
    db,
    extraRoutes(router: Router) {
      router.get(SESSION_ROUTE, (_req, res) => {
        res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${routes.sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/`);
        res.status(HTTP_OK).json({ status: 'ok' });
      });
      router.get(PG_ERROR_ROUTE, async () => {
        throw routes.pgError;
      });
      router.get(GENERIC_ERROR_ROUTE, () => {
        throw routes.genericError;
      });
    },
    logger,
  });
  return { app, destination };
}

function defaultRoutes() {
  return {
    genericError: new Error(`internal failure ${randomUUID()}`),
    pgError: buildPgUniqueViolation(buildEmail()),
    sessionToken: buildToken(),
  };
}

// pino-http style request logs may be written on the response's finish event.
async function flushLogs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function expectInternalErrorBody(response: request.Response) {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(UUID_PATTERN);
  expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
  expect(response.body).toEqual({
    error: { code: INTERNAL_ERROR_CODE, message: expect.any(String), requestId },
  });
  expect(response.body.error.message.length).toBeGreaterThan(0);
  expect(response.text).not.toMatch(STACK_FRAME_PATTERN);
  expect(response.text).not.toContain('"stack"');
}

describe('request logging through createApp', () => {
  it('logs a request that sets a session cookie without the token, cookie, or authorization values', async () => {
    const routes = defaultRoutes();
    const { app, destination } = createFixture(routes);
    const requestCookieToken = buildToken();
    const bearerToken = buildToken();

    const response = await request(app)
      .get(SESSION_ROUTE)
      .set('Cookie', `${SESSION_COOKIE_NAME}=${requestCookieToken}`)
      .set('Authorization', `Bearer ${bearerToken}`);
    await flushLogs();

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['set-cookie']?.[0]).toContain(routes.sessionToken);
    expect(destination.lines.length).toBeGreaterThan(0);
    for (const line of destination.lines) {
      expect(line).not.toContain(routes.sessionToken);
      expect(line).not.toContain(requestCookieToken);
      expect(line).not.toContain(bearerToken);
    }
  });

  it('carries the response X-Request-Id on every log line for the request', async () => {
    const { app, destination } = createFixture(defaultRoutes());

    const response = await request(app).get(SESSION_ROUTE);
    await flushLogs();

    expect(response.status).toBe(HTTP_OK);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(UUID_PATTERN);
    const entries = parseLines(destination.lines);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.requestId).toBe(requestId);
    }
  });
});

describe('error handler logging and responses', () => {
  it('logs a pg unique violation by code and constraint only and answers a generic 500', async () => {
    const email = buildEmail();
    const pgError = buildPgUniqueViolation(email);
    const { app, destination } = createFixture({ ...defaultRoutes(), pgError });

    const response = await request(app).get(PG_ERROR_ROUTE);
    await flushLogs();

    expectInternalErrorBody(response);
    expect(response.text).not.toContain(email);
    expect(response.text).not.toContain(PG_EMAIL_CONSTRAINT);

    const requestId = response.headers['x-request-id'];
    expect(destination.lines.length).toBeGreaterThan(0);
    for (const line of destination.lines) {
      expect(line).not.toContain(email);
      expect(line).not.toContain('already exists');
    }
    const errorLines = destination.lines.filter(
      (line) => line.includes(PG_UNIQUE_VIOLATION) && line.includes(PG_EMAIL_CONSTRAINT),
    );
    expect(errorLines.length).toBeGreaterThan(0);
    for (const entry of parseLines(errorLines)) {
      expect(entry.requestId).toBe(requestId);
    }
  });

  it('answers an unhandled generic error with a generic 500 and no original message or stack', async () => {
    const genericError = new Error(`internal failure ${randomUUID()}`);
    const { app, destination } = createFixture({ ...defaultRoutes(), genericError });

    const response = await request(app).get(GENERIC_ERROR_ROUTE);
    await flushLogs();

    expectInternalErrorBody(response);
    expect(response.text).not.toContain(genericError.message);
    expect(response.body.error.message).not.toContain(genericError.message);

    const requestId = response.headers['x-request-id'];
    const entries = parseLines(destination.lines);
    expect(entries.some((entry) => entry.requestId === requestId && entry.level === PINO_ERROR_LEVEL)).toBe(true);
  });
});
