// The one model call the server makes, shared by POST /v1/ask and GET /v1/study-note: Claude
// Haiku at low effort, bounded so a request resolves within about 25 seconds, under the app's
// 30 second wait for these routes.
const MODEL = {
  EFFORT: 'low',
  ID: 'claude-haiku-5-5',
  // One retry on a 429, 5xx, or dropped connection.
  MAX_RETRIES: 1,
  // Thinking tokens count against this too; each prompt asks for a short answer.
  MAX_TOKENS: 2_000,
  TIMEOUT_MS: 12_000,
} as const;

export { MODEL };
