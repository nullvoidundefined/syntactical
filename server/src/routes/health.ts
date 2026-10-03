import { Router } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';

const {
  STATUS: { OK, SERVICE_UNAVAILABLE },
} = HTTP;

interface HealthDb {
  query(sql: string): Promise<unknown>;
}

function createHealthRouter(db: HealthDb, logger: Logger): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(OK).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const requestLog = (res.locals.logger as Logger | undefined) ?? logger;
    try {
      await db.query('SELECT 1');
      res.status(OK).json({ database: 'ok', status: 'ok' });
    } catch (err) {
      // Log the failure by class and pg code only: a driver message or detail can
      // carry connection strings, role names, or emails, so neither is logged.
      const { code } = (err ?? {}) as { code?: unknown };
      requestLog.error(
        { errorName: err instanceof Error ? err.name : 'unknown', pgCode: typeof code === 'string' ? code : undefined },
        'readiness check failed',
      );
      res.status(SERVICE_UNAVAILABLE).json({ database: 'unavailable', status: 'degraded' });
    }
  });

  return router;
}

export { createHealthRouter };
export type { HealthDb };
