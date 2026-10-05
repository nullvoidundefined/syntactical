// Runs after requireSession: reads users.is_admin on every request, so clearing the flag takes
// effect at once, and answers 403 ADMIN_REQUIRED unless it is true.
import type { RequestHandler } from 'express';

import type { Database } from '../clients/database.js';
import { HTTP } from '../constants/http.js';
import { createErrorResponse, ERROR_CODES } from '../errors.js';

function createRequireAdmin(database: Database): RequestHandler {
  return async (_req, res, next) => {
    const { requestId, session } = res.locals as { requestId: string; session: { userId: string } };
    try {
      const { rows } = await database.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [
        session.userId,
      ]);
      if (rows[0]?.is_admin !== true) {
        res
          .status(HTTP.STATUS.FORBIDDEN)
          .json(createErrorResponse(ERROR_CODES.ADMIN.REQUIRED, 'Admin access required', requestId));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { createRequireAdmin };
