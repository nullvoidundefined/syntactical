// RevenueCat event vocabulary: which event types grant or revoke, which stores may change an
// entitlement, the provider name stored on purchase_events, and the payload allowlist.
const REVENUECAT_EVENTS = {
  ENTITLEMENT_SOURCE: 'revenuecat',
  GRANT_TYPES: ['NON_RENEWING_PURCHASE'],
  PAYLOAD_KEYS: [
    'type',
    'store',
    'environment',
    'product_id',
    'event_timestamp_ms',
    'purchased_at_ms',
    'transaction_id',
    'original_transaction_id',
    'price',
    'currency',
    'cancel_reason',
    'period_type',
  ],
  PROVIDER: 'revenuecat',
  REVOKE_TYPES: ['CANCELLATION', 'REFUND'],
  STORES: ['APP_STORE', 'PLAY_STORE', 'RC_BILLING'],
} as const;

export { REVENUECAT_EVENTS };
