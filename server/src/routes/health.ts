import { Router } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';

const {
  STATUS: { OK, SERVICE_UNAVAILABLE },
} = HTTP;

interface HealthDb {
  query(sql: string): Promise<unknown>;
}

// `stubbed` names the integrations running on a stub; /health/ready reports it only when non-empty.
function createHealthRouter(db: HealthDb, logger: Logger, stubbed: readonly string[] = []): Router {
  const router = Router();
  const stubbedField = stubbed.length > 0 ? { stubbed: [...stubbed] } : {};

  router.get('/', (_req, res) => {
    res.status(OK).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const requestLog = (res.locals.logger as Logger | undefined) ?? logger;
    try {
      await db.query('SELECT 1');
      res.status(OK).json({ database: 'ok', status: 'ok', ...stubbedField });
    } catch (err) {
      // Log the failure by class and pg code only: a driver message or detail can
      // carry connection strings, role names, or emails, so neither is logged.
      const { code } = (err ?? {}) as { code?: unknown };
      requestLog.error(
        { errorName: err instanceof Error ? err.name : 'unknown', pgCode: typeof code === 'string' ? code : undefined },
        'readiness check failed',
      );
      res.status(SERVICE_UNAVAILABLE).json({ database: 'unavailable', status: 'degraded', ...stubbedField });
    }
  });

  return router;
}

export { createHealthRouter };
export type { HealthDb };
