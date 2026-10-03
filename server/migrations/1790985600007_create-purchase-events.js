/**
 * One store webhook delivery, keyed by (provider, provider_event_id) so a
 * redelivered event is stored once. Rows outlive the user (user_id is set
 * null on delete) for accounting.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createTable(
        'purchase_events',
        {
            kind: { notNull: true, type: 'text' },
            occurred_at: { notNull: true, type: 'timestamptz' },
            payload: { notNull: true, type: 'jsonb' },
            product_id: { type: 'text' },
            provider: { notNull: true, type: 'text' },
            provider_event_id: { notNull: true, type: 'text' },
            received_at: { default: pgm.func('NOW()'), notNull: true, type: 'timestamptz' },
            user_id: { onDelete: 'SET NULL', references: 'users', type: 'uuid' },
        },
        { constraints: { primaryKey: ['provider', 'provider_event_id'] } },
    );
    pgm.createIndex('purchase_events', 'user_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropTable('purchase_events');
};
