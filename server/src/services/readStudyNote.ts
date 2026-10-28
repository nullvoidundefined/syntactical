// The study note already written for a user's week, with its misconception ids, or null when
// there is none yet. A note stored before ids were kept reads with none.
import type { Database } from '../clients/database.js';
import type { StoredStudyNote } from '../types/StoredStudyNote.js';

async function readStudyNote(database: Database, userId: string, weekStart: string): Promise<StoredStudyNote | null> {
  const { rows } = await database.query<{ misconception_ids: string[] | null; note: string }>(
    'SELECT note, misconception_ids FROM study_notes WHERE user_id = $1 AND week_start = $2',
    [userId, weekStart],
  );
  const [row] = rows;
  return row ? { misconceptionIds: row.misconception_ids ?? [], note: row.note } : null;
}

export { readStudyNote };
