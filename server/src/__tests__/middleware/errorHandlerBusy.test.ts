// The error handler answers a Postgres timeout, query_canceled (57014, statement_timeout) or
// lock_not_available (55P03, lock_timeout), with 503 SERVER_BUSY. Any other pg code is a 500
// SERVER_INTERNAL_ERROR.
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createErrorHandler } from '../../middleware/errorHandler.js';
import { requestId } from '../../middleware/requestId.js';

const FAILING_ROUTE = '/fails';

// An app whose one route throws a pg-shaped error carrying the given SQLSTATE.
function createFailingApp(code: string) {
    const app = express();
    app.use(requestId);
    app.get(FAILING_ROUTE, () => {
        throw Object.assign(new Error('database refused the statement'), { code, severity: 'ERROR' });
    });
    app.use(createErrorHandler(pino({ level: 'silent' })));
    return app;
}

describe('error handler: database timeouts', () => {
    it.each([
        ['57014', 503, 'SERVER_BUSY'],
        ['55P03', 503, 'SERVER_BUSY'],
        ['23505', 500, 'SERVER_INTERNAL_ERROR'],
    ])('answers pg code %s with %i %s', async (code, status, errorCode) => {
        const response = await request(createFailingApp(code)).get(FAILING_ROUTE);

        expect(response.status).toBe(status);
        expect(response.body.error.code).toBe(errorCode);
        expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });
});
