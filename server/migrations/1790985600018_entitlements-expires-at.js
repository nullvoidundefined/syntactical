/**
 * When a Pro entitlement ends: the annual subscription's current period end, from RevenueCat's
 * expiration_at_ms. NULL for the lifetime product, for admin grants, and for rows written before
 * Pro. hasPro counts a granted row only while expires_at is NULL or later than now.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumn('entitlements', {
    expires_at: { type: 'timestamptz' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropColumn('entitlements', 'expires_at');
};
