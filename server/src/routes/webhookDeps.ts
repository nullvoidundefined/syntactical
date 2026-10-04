// What the /v1/webhooks routes need from the caller of createApp.
import type { Database } from '../clients/database.js';

interface WebhookDeps {
  database: Database;
  now?: () => Date;
  paidProductIds: ReadonlySet<string>;
  // The exact Authorization header value RevenueCat is configured to send.
  revenueCatAuth: string;
}

export type { WebhookDeps };
