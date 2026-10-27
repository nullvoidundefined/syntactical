// RevenueCat event vocabulary (spec "2. Pro", Server): which event types grant or revoke a Pro
// entitlement, which only carry a new expiry, which stores may change an entitlement, the provider
// name stored on purchase_events, and the payload allowlist. CANCELLATION is listed as expiry-only;
// whether it revokes instead depends on the product and on cancel_reason (PRO_PRODUCT_RULES and
// PRO_REFUND_CANCEL_REASON in proProducts.ts), which recomputeEntitlement applies. Any other type
// is answered 200 ignored.
const REVENUECAT_EVENTS = {
  CANCELLATION_TYPE: 'CANCELLATION',
  ENTITLEMENT_SOURCE: 'revenuecat',
  EXPIRY_ONLY_TYPES: ['CANCELLATION', 'SUBSCRIPTION_EXTENDED'],
  GRANT_TYPES: ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'],
  PAYLOAD_KEYS: [
    'type',
    'store',
    'environment',
    'product_id',
    'event_timestamp_ms',
    'purchased_at_ms',
    'expiration_at_ms',
    'transaction_id',
    'original_transaction_id',
    'price',
    'currency',
    'cancel_reason',
    'period_type',
  ],
  PROVIDER: 'revenuecat',
  // REFUND is kept in case RevenueCat sends it; a store refund arrives as a CUSTOMER_SUPPORT CANCELLATION.
  REVOKE_TYPES: ['EXPIRATION', 'REFUND'],
  // The environment RevenueCat stamps on a free test purchase (Task 3.4).
  SANDBOX_ENVIRONMENT: 'SANDBOX',
  STORES: ['APP_STORE', 'PLAY_STORE', 'RC_BILLING'],
  // Moves purchases between app user ids (a restore on another account); handled by transferPurchaseEvents.
  TRANSFER_TYPE: 'TRANSFER',
} as const;

export { REVENUECAT_EVENTS };
