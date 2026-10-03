import { randomInt } from 'node:crypto';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { createLogger } from './clients/logger.js';
import { createCorsOptions } from './config/cors.js';
import { AUTH } from './constants/auth.js';
import { HTTP } from './constants/http.js';
import { createCsrfGuard } from './middleware/csrfGuard.js';
import { dropForwardedHeaders } from './middleware/dropForwardedHeaders.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { requireJson } from './middleware/requireJson.js';
import { createAuthCodesRouter } from './routes/authCodes.js';
import type { AuthDeps, ResolvedAuthDeps } from './routes/authDeps.js';
import { createAuthSessionsRouter } from './routes/authSessions.js';
import { createDeleteMeRouter } from './routes/deleteMe.js';
import { createHealthRouter } from './routes/health.js';
import type { HealthDb } from './routes/health.js';
import { createSignOutRouter } from './routes/signOut.js';

interface AppDeps {
  allowedOrigins?: string[];
  // The /v1/auth routes; omitted, they are not mounted.
  auth?: AuthDeps;
  db: HealthDb;
  extraRoutes?: (router: Router) => void;
  logger?: Logger;
}

// Builds the Express app without listening or reading env; callers inject everything.
function createApp(deps: AppDeps) {
  const { allowedOrigins = [], auth, db, extraRoutes, logger = createLogger({ destination: process.stdout }) } = deps;
  const app = express();

  app.set('trust proxy', 1);
  app.use(dropForwardedHeaders);
  app.use(helmet());
  app.use(requestId);
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(createRequestLogger(logger));
  app.use(requireJson);
  app.use(express.json({ limit: HTTP.JSON_BODY_SIZE_LIMIT }));
  app.use(cookieParser());
  app.use(createCsrfGuard(allowedOrigins));

  app.use('/health', createHealthRouter(db, logger));

  if (auth) {
    const {
      deletionStatementTimeoutMs = AUTH.DELETION.STATEMENT_TIMEOUT_MS,
      now = () => new Date(),
      randomInt: codeGenerator = randomInt,
    } = auth;
    const resolved: ResolvedAuthDeps = { ...auth, deletionStatementTimeoutMs, now, randomInt: codeGenerator };
    app.use(
      '/v1/auth',
      createAuthCodesRouter(resolved, logger),
      createAuthSessionsRouter(resolved),
      createSignOutRouter(resolved),
    );
    app.use('/v1', createDeleteMeRouter(resolved));
  }

  if (extraRoutes) {
    const router = express.Router();
    extraRoutes(router);
    app.use(router);
  }

  app.use(createNotFoundHandler());
  app.use(createErrorHandler(logger));

  return app;
}

export { createApp };
export type { AppDeps };
