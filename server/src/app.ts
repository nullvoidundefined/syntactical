import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Router } from 'express';
import helmet from 'helmet';
import { pino } from 'pino';
import type { Logger } from 'pino';

import { createCorsOptions } from './config/cors.js';
import { HTTP } from './constants/http.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { createHealthRouter } from './routes/health.js';
import type { HealthDb } from './routes/health.js';

interface AppDeps {
  allowedOrigins?: string[];
  db: HealthDb;
  extraRoutes?: (router: Router) => void;
  logger?: Logger;
}

// Builds the Express app without listening or reading env; callers inject everything.
function createApp(deps: AppDeps) {
  const { allowedOrigins = [], db, extraRoutes, logger = pino() } = deps;
  const app = express();

  app.use(helmet());
  app.use(requestId);
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: HTTP.JSON_BODY_SIZE_LIMIT }));
  app.use(cookieParser());

  app.use('/health', createHealthRouter(db, logger));

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
