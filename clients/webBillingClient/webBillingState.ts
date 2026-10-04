// The one Web Billing instance per signed-in user, shared by configure, reset,
// and purchase; null until a user is configured.
import type { Purchases } from '@revenuecat/purchases-js';

export const webBillingState: { current: { instance: Purchases; userId: string } | null } = { current: null };
