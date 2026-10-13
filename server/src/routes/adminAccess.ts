// GET and PUT /v1/admin/access (IAN-601): an admin lists the paid products with where their access
// comes from, and grants or revokes their own 'admin' access to one. Order: session (401), admin
// flag read fresh (403 ADMIN_REQUIRED), then for PUT the per-user rate limit (429) and the strict
// body (400). Only the session user's rows are ever read or written. Every response is no-store.
import { Router } from 'express';

import { ADMIN } from '../constants/admin.js';
import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireAdmin } from '../middleware/requireAdmin.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { createAdminSchemas } from '../schemas/adminSchemas.js';
import { listAdminAccess } from '../services/listAdminAccess.js';
import { setAdminAccess } from '../services/setAdminAccess.js';

import type { ResolvedAdminDeps } from './adminDeps.js';

const {
  STATUS: { BAD_REQUEST, OK, UNAUTHORIZED },
} = HTTP;

function createAdminAccessRouter(deps: ResolvedAdminDeps): Router {
  const { database, now, paidProductIds, rateLimitKeySecret } = deps;
  const router = Router();
  const schemas = createAdminSchemas(paidProductIds);
  const requireSession = createRequireSession({ database, now });
  const requireAdmin = createRequireAdmin(database);
  const perUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: ADMIN.RATE_LIMIT.ACCESS_UPDATE_PER_USER,
    now,
    scope: ADMIN.RATE_LIMIT_SCOPE.ACCESS_UPDATE,
    windowMs: ADMIN.RATE_LIMIT.WINDOW_MS,
  });

  router.use('/admin/access', (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/admin/access', requireSession, requireAdmin, async (_req, res) => {
    const { session } = res.locals as { session: { userId: string } };
    const products = await listAdminAccess(database, session.userId, paidProductIds);
    res.status(OK).json({ data: { products } });
  });

  router.put('/admin/access', requireSession, requireAdmin, perUser, async (req, res) => {
    const { session } = res.locals as { session: { userId: string } };
    const { data, success } = schemas.updateAccess.safeParse(req.body);
    if (!success) {
      sendError(res, BAD_REQUEST, ERROR_CODES.INPUT.INVALID_BODY, 'Invalid request body');
      return;
    }
    const entry = await setAdminAccess(database, session.userId, data.productId, data.isGranted);
    if (!entry) {
      sendError(res, UNAUTHORIZED, ERROR_CODES.AUTH.SESSION_REQUIRED, 'Sign-in required');
      return;
    }
    res.status(OK).json({ data: entry });
  });

  return router;
}

export { createAdminAccessRouter };
