import { randomInt } from 'node:crypto';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { createLogger } from './clients/logger.js';
import { createCorsOptions } from './config/cors.js';
import { HTTP } from './constants/http.js';
import { SYNC } from './constants/sync.js';
import { createCsrfGuard } from './middleware/csrfGuard.js';
import { dropForwardedHeaders } from './middleware/dropForwardedHeaders.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { requireJson } from './middleware/requireJson.js';
import { createAnswerEventsRouter } from './routes/answerEvents.js';
import { createAuthCodesRouter } from './routes/authCodes.js';
import type { AuthDeps, ResolvedAuthDeps } from './routes/authDeps.js';
import { createAuthSessionsRouter } from './routes/authSessions.js';
import { createAuthSignupsRouter } from './routes/authSignups.js';
import { createBanksRouter } from './routes/banks.js';
import type { BanksDeps } from './routes/banksDeps.js';
import { createDeleteMeRouter } from './routes/deleteMe.js';
import { createHealthRouter } from './routes/health.js';
import type { HealthDb } from './routes/health.js';
import { createMeRouter } from './routes/me.js';
import { createDisabledWebhookRouter } from './routes/disabledWebhook.js';
import { createRevenueCatWebhookRouter } from './routes/revenueCatWebhook.js';
import { createSignOutRouter } from './routes/signOut.js';
import type { SyncDeps } from './routes/syncDeps.js';
import type { WebhookDeps } from './routes/webhookDeps.js';

interface AppDeps {
  allowedOrigins?: string[];
  // The /v1/auth routes; omitted, they are not mounted.
  auth?: AuthDeps;
  // The /v1 paid bank route; omitted, it is not mounted.
  banks?: BanksDeps;
  db: HealthDb;
  extraRoutes?: (router: Router) => void;
  logger?: Logger;
  // Integrations running on a stub, by name; reported on /health/ready.
  stubbed?: readonly string[];
  // The /v1 answer event and profile routes; omitted, they are not mounted.
  sync?: SyncDeps;
  // The /v1/webhooks routes; omitted, they are not mounted.
  webhooks?: WebhookDeps;
  // No webhook credential is configured: every request under /v1/webhooks answers 503 and
  // records nothing. Ignored when `webhooks` is given.
  webhooksDisabled?: boolean;
}

// Builds the Express app without listening or reading env; callers inject everything.
function createApp(deps: AppDeps) {
  const {
    allowedOrigins = [],
    auth,
    banks,
    db,
    extraRoutes,
    logger = createLogger({ destination: process.stdout }),
    stubbed = [],
    sync,
    webhooks,
    webhooksDisabled = false,
  } = deps;
  const app = express();

  app.set('trust proxy', 1);
  app.use(dropForwardedHeaders);
  app.use(helmet());
  app.use(requestId);
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(createRequestLogger(logger));
  // The webhook router is mounted before the JSON guard, the global parser, and the CSRF guard,
  // which do not apply to it: it authenticates first, then reads its own 64 KB body. Mounting
  // by prefix covers every spelling Express routes to it (a trailing slash, another case).
  if (webhooks) {
    app.use('/v1/webhooks', createRevenueCatWebhookRouter(webhooks, logger));
  } else if (webhooksDisabled) {
    app.use('/v1/webhooks', createDisabledWebhookRouter());
  }
  app.use(requireJson);
  // The upload route reads its larger body in its own router, after authentication; only
  // when the sync routes are mounted does the global parser skip it.
  const defaultJson = express.json({ limit: HTTP.JSON_BODY_SIZE_LIMIT });
  app.use((req, res, next) => {
    const { method, path } = req;
    const isSyncUpload = sync && method === 'POST' && path === SYNC.UPLOAD_PATH;
    if (isSyncUpload) {
      next();
      return;
    }
    defaultJson(req, res, next);
  });
  app.use(cookieParser());
  app.use(createCsrfGuard(allowedOrigins));

  app.use('/health', createHealthRouter(db, logger, stubbed));

  if (auth) {
    const { now = () => new Date(), randomInt: codeGenerator = randomInt } = auth;
    const resolved: ResolvedAuthDeps = { ...auth, now, randomInt: codeGenerator };
    const { passwordBreachClient, passwordHashSlots } = resolved;
    app.use(
      '/v1/auth',
      createAuthCodesRouter(resolved, logger),
      createAuthSessionsRouter(resolved),
      ...(passwordBreachClient && passwordHashSlots
        ? [createAuthSignupsRouter({ ...resolved, passwordBreachClient, passwordHashSlots }, logger)]
        : []),
      createSignOutRouter(resolved),
    );
    app.use('/v1', createDeleteMeRouter(resolved, logger));
  }

  if (sync) {
    const { now = () => new Date() } = sync;
    const resolvedSync = { ...sync, now };
    app.use('/v1', createAnswerEventsRouter(resolvedSync), createMeRouter(resolvedSync));
  }

  if (banks) {
    const { now = () => new Date() } = banks;
    app.use('/v1', createBanksRouter({ ...banks, now }));
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
