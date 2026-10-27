/**
 * One row per user a RevenueCat TRANSFER moved purchase events away from: from_user_id's events
 * went to to_user_id at occurred_at (the TRANSFER's event_timestamp_ms). recordPurchaseEvent reads
 * it so an event for from_user_id stamped at or before occurred_at, delivered after the TRANSFER,
 * follows the purchase to its new user. id keeps the insert order, which is the order transfers
 * from one user were applied in (they hold that user's locks). A row goes with its from user, and
 * loses its to user (to_user_id NULL, so a late event is recorded under no user), so no row keeps a
 * deleted user's id.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable(
    'purchase_transfers',
    {
      from_user_id: { notNull: true, onDelete: 'CASCADE', references: 'users', type: 'uuid' },
      id: 'id',
      occurred_at: { notNull: true, type: 'timestamptz' },
      provider: { notNull: true, type: 'text' },
      provider_event_id: { notNull: true, type: 'text' },
      to_user_id: { onDelete: 'SET NULL', references: 'users', type: 'uuid' },
    },
    {
      constraints: {
        foreignKeys: {
          columns: ['provider', 'provider_event_id'],
          references: 'purchase_events (provider, provider_event_id)',
        },
        unique: ['provider', 'provider_event_id', 'from_user_id'],
      },
    },
  );
  pgm.createIndex('purchase_transfers', 'from_user_id');
  pgm.createIndex('purchase_transfers', 'to_user_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropTable('purchase_transfers');
};
