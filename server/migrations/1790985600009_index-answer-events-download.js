/**
 * Serves the keyset page query of GET /v1/answer-events: one user's events in
 * (received_at, event_id) order.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
    pgm.createIndex('answer_events', ['user_id', 'received_at', 'event_id'], {
        name: 'answer_events_user_received_idx',
    });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.dropIndex('answer_events', ['user_id', 'received_at', 'event_id'], {
        name: 'answer_events_user_received_idx',
    });
};
