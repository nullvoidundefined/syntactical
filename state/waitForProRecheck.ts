// How long to wait, and how many times, before reading GET /me again when the store has finished
// but the server does not say Pro yet: RevenueCat's webhook (a purchase, or a restore's TRANSFER)
// usually reaches the server a few seconds after the store call returns. Shared by the Pro offer's
// pending purchase and Settings' restore; tests replace the wait so they take no real time.
export const PRO_RECHECK_COUNT = 2;
const PRO_RECHECK_DELAY_MS = 2000;

export function waitForProRecheck(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PRO_RECHECK_DELAY_MS));
}
