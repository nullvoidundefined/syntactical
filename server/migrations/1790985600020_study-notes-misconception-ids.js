/**
 * The misconceptions a stored study note's summary named, most missed first, so GET
 * /v1/study-note serves the same ids with the note all week. NULL for notes stored before ids
 * were kept; those are served with none.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumn('study_notes', {
    misconception_ids: { type: 'text[]' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
  pgm.dropColumn('study_notes', 'misconception_ids');
};
