// A5: the error handler answers every Postgres SQLSTATE that means the database refused the
// work for load rather than for a bug with 503 SERVER_BUSY and a Retry-After header in whole
// seconds: query_canceled (57014, statement_timeout), lock_not_available (55P03, lock_timeout),
// and idle_in_transaction_session_timeout (25P03, the backend ended an idle transaction). Any
// other pg code is a 500 SERVER_INTERNAL_ERROR with no Retry-After.
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createErrorHandler } from '../../middleware/errorHandler.js';
import { requestId } from '../../middleware/requestId.js';

const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const RETRY_AFTER_SECONDS = /^[1-9]\d*$/;
const FAILING_ROUTE = '/fails';

const silentLogger = pino({ level: 'silent' });

// An app whose one route throws a pg-shaped error carrying the given SQLSTATE.
function createFailingApp(code: string) {
    const app = express();
    app.use(requestId);
    app.get(FAILING_ROUTE, () => {
        throw Object.assign(new Error('database refused the statement'), { code, severity: 'ERROR' });
    });
    app.use(createErrorHandler(silentLogger));
    return app;
}

describe('error handler: database busy SQLSTATEs', () => {
    it.each([
        ['57014', 'statement timeout'],
        ['55P03', 'lock timeout'],
        ['25P03', 'idle-in-transaction session timeout'],
    ])('answers pg code %s (%s) with 503 SERVER_BUSY and a whole-second Retry-After', async (code) => {
        const response = await request(createFailingApp(code)).get(FAILING_ROUTE);

        expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
        expect(response.body.error.code).toBe('SERVER_BUSY');
        expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
        expect(response.headers['retry-after']).toMatch(RETRY_AFTER_SECONDS);
    });

    it('answers an unrelated pg code (23505 unique_violation) with 500 SERVER_INTERNAL_ERROR and no Retry-After', async () => {
        const response = await request(createFailingApp('23505')).get(FAILING_ROUTE);

        expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
        expect(response.body.error.code).toBe('SERVER_INTERNAL_ERROR');
        expect(response.headers['retry-after']).toBeUndefined();
    });
});
