// Limits and paths for the /v1/webhooks routes.
const WEBHOOKS = {
  BODY_LIMIT: '64kb',
  MAX_EVENT_ID_LENGTH: 200,
  MIN_AUTH_LENGTH: 32,
} as const;

export { WEBHOOKS };
