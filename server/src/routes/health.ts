import { Router } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';

const { STATUS } = HTTP;

interface HealthDb {
  query(sql: string): Promise<unknown>;
}

function createHealthRouter(db: HealthDb, logger: Logger): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(STATUS.OK).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.status(STATUS.OK).json({ database: 'ok', status: 'ok' });
    } catch (err) {
      // The failure detail stays in the log; the response never carries it.
      logger.error({ err }, 'readiness check failed');
      res.status(STATUS.SERVICE_UNAVAILABLE).json({ database: 'unavailable', status: 'degraded' });
    }
  });

  return router;
}

export { createHealthRouter };
export type { HealthDb };
