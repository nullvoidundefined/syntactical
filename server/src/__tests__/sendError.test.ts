import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { createLogger } from '../clients/logger.js';
import { ERROR_CODES, sendError } from '../errors.js';

const HTTP_BAD_REQUEST = 400;

describe('sendError', () => {
  it('exports a helper that sends the given status and exact error body with the request id', async () => {
    expect(sendError).toBeTypeOf('function');

    const message = 'Invalid request body';
    const app = createApp({
      db: { query: async (_sql: string): Promise<unknown> => ({ rows: [] }) },
      extraRoutes: (router: Router) => {
        router.get('/send-error', (_req, res) => {
          sendError(res, HTTP_BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, message);
        });
      },
      logger: createLogger({ destination: { write(_chunk: string) {} } }),
    });

    const response = await request(app).get('/send-error');

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toStrictEqual({
      error: {
        code: ERROR_CODES.INPUT.INVALID_BODY,
        message,
        requestId: response.headers['x-request-id'],
      },
    });
  });
});
