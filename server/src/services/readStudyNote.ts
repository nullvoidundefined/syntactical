// The study note already written for a user's week, or null when there is none yet.
import type { Database } from '../clients/database.js';

async function readStudyNote(database: Database, userId: string, weekStart: string): Promise<string | null> {
  const { rows } = await database.query<{ note: string }>(
    'SELECT note FROM study_notes WHERE user_id = $1 AND week_start = $2',
    [userId, weekStart],
  );
  return rows[0]?.note ?? null;
}

export { readStudyNote };
