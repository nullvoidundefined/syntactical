// Limits for the /v1/admin routes: the per-user cap on access changes and its rate limit scope.
const HOUR_MS = 3_600_000;

const ADMIN = {
  RATE_LIMIT: { ACCESS_UPDATE_PER_USER: 60, WINDOW_MS: HOUR_MS },
  RATE_LIMIT_SCOPE: { ACCESS_UPDATE: 'admin-access:update' },
} as const;

export { ADMIN };
