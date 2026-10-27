// What POST /v1/test/webhook needs from the caller of createApp. startServer passes it only when
// the testWebhook start option is set, which it refuses outside NODE_ENV=test.
import type { Database } from '../clients/database.js';

interface TestWebhookDeps {
  // Whether SANDBOX events change an entitlement, as for the real webhook (REVENUECAT_ACCEPT_SANDBOX).
  acceptSandbox: boolean;
  database: Database;
}

export type { TestWebhookDeps };
