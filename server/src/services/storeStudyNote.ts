// Stores a user's note for a week and prunes their earlier weeks, in one statement. When two
// requests wrote a note for the same week at once, the first stored wins and both resolve it, so
// the learner sees one note per week.
import type { Database } from '../clients/database.js';

async function storeStudyNote(database: Database, userId: string, weekStart: string, note: string): Promise<string> {
  const { rows } = await database.query<{ note: string }>(
    `WITH pruned AS (DELETE FROM study_notes WHERE user_id = $1 AND week_start < $2),
     inserted AS (
       INSERT INTO study_notes (user_id, week_start, note) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, week_start) DO NOTHING
       RETURNING note
     )
     SELECT note FROM inserted
     UNION ALL
     SELECT note FROM study_notes WHERE user_id = $1 AND week_start = $2 AND NOT EXISTS (SELECT 1 FROM inserted)`,
    [userId, weekStart, note],
  );
  return rows[0]?.note ?? note;
}

export { storeStudyNote };
