// Limits for the /v1 sync routes: answer event upload and download, and profile updates.
const HOUR_MS = 3_600_000;

const SYNC = {
  BODY_LIMIT: '256kb',
  FUTURE_TOLERANCE_MINUTES: 5,
  MAX_BATCH: 200,
  MAX_CURSOR_LENGTH: 200,
  MAX_EVENTS_PER_USER: 100_000,
  PAGE_SIZE: 500,
  PAST_TOLERANCE_DAYS: 365,
  BUSY_RETRY_AFTER_SECONDS: 1,
  RATE_LIMIT: { DOWNLOAD_PER_USER: 600, PROFILE_UPDATE_PER_USER: 60, UPLOAD_PER_USER: 600, WINDOW_MS: HOUR_MS },
  RATE_LIMIT_SCOPE: {
    DOWNLOAD: 'answer-events:download',
    PROFILE_UPDATE: 'me:update',
    UPLOAD: 'answer-events:upload',
  },
  UPLOAD_PATH: '/v1/answer-events',
} as const;

export { SYNC };
