// Runs after requireSession: reads users.is_admin on every request, so clearing the flag takes
// effect at once, and answers 403 ADMIN_REQUIRED unless it is true.
import type { RequestHandler } from 'express';

import type { Database } from '../clients/database.js';
import { HTTP } from '../constants/http.js';
import { ERROR_CODES, sendError } from '../errors.js';

function createRequireAdmin(database: Database): RequestHandler {
  return async (_req, res, next) => {
    const { session } = res.locals as { session: { userId: string } };
    try {
      const { rows } = await database.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [
        session.userId,
      ]);
      if (rows[0]?.is_admin !== true) {
        sendError(res, HTTP.STATUS.FORBIDDEN, ERROR_CODES.ADMIN.REQUIRED, 'Admin access required');
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { createRequireAdmin };
