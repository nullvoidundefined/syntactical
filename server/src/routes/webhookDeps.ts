// What the /v1/webhooks routes need from the caller of createApp.
import type { Database } from '../clients/database.js';

interface WebhookDeps {
  // Whether SANDBOX events change an entitlement (REVENUECAT_ACCEPT_SANDBOX). Absent is false.
  acceptSandbox?: boolean;
  database: Database;
  now?: () => Date;
  // The exact Authorization header value RevenueCat is configured to send.
  revenueCatAuth: string;
}

export type { WebhookDeps };
