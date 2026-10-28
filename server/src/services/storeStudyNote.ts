// Stores a user's note and its misconception ids for a week and prunes their earlier weeks, in
// one statement. When two requests wrote a note for the same week at once, the first stored wins
// and both resolve it, so the learner sees one note per week.
import type { Database } from '../clients/database.js';
import type { StoredStudyNote } from '../types/StoredStudyNote.js';

async function storeStudyNote(
  database: Database,
  userId: string,
  weekStart: string,
  stored: StoredStudyNote,
): Promise<StoredStudyNote> {
  const { rows } = await database.query<{ misconception_ids: string[] | null; note: string }>(
    `WITH pruned AS (DELETE FROM study_notes WHERE user_id = $1 AND week_start < $2),
     inserted AS (
       INSERT INTO study_notes (user_id, week_start, note, misconception_ids) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, week_start) DO NOTHING
       RETURNING note, misconception_ids
     )
     SELECT note, misconception_ids FROM inserted
     UNION ALL
     SELECT note, misconception_ids FROM study_notes
       WHERE user_id = $1 AND week_start = $2 AND NOT EXISTS (SELECT 1 FROM inserted)`,
    [userId, weekStart, stored.note, stored.misconceptionIds],
  );
  const [row] = rows;
  return row ? { misconceptionIds: row.misconception_ids ?? [], note: row.note } : stored;
}

export { storeStudyNote };
