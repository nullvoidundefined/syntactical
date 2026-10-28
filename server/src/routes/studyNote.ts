// GET /v1/study-note: the signed-in user's weekly study note, a short paragraph Claude writes from
// their synced answers of the last 7 days. One note per local week (Monday to Sunday in the user's
// timezone, UTC when none is stored), written the first time it is asked for once the window
// holds STUDY_NOTE.MIN_ANSWERS answers, then served from study_notes for the rest of the week.
//
// Answers { data: { status: 'gathering', remaining } } while answers are missing (nothing is
// stored, so the note is written later that week), { data: { status: 'ready', note, weekStart,
// misconceptionIds } } once written (the ids of the misconceptions the week's summary named, most
// missed first, at most STUDY_NOTE.TOP_MISCONCEPTIONS, stored with the note so the week serves the
// same ids; empty for a note stored before ids were kept), 503 STUDY_NOTE_UNAVAILABLE when no
// model is configured or the call fails or declines (nothing is stored), 401 without a session,
// and 429 past the per-user rate limit.
// Responses are Cache-Control: private, no-store.
import { toLocalDate } from '@syntactical/progress';
import { Router } from 'express';
import type { Logger } from 'pino';

import { HTTP } from '../constants/http.js';
import { PROGRESS_DEFAULTS } from '../constants/progressDefaults.js';
import { STUDY_NOTE } from '../constants/studyNote.js';
import { ERROR_CODES, sendError } from '../errors.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyOfUser } from '../middleware/rateLimitKeys.js';
import { createRequireSession } from '../middleware/requireSession.js';
import { buildStudyNotePrompt } from '../services/buildStudyNotePrompt.js';
import { buildStudySummary } from '../services/buildStudySummary.js';
import { listRecentAnswerEvents } from '../services/listRecentAnswerEvents.js';
import { readStudyNote } from '../services/readStudyNote.js';
import { storeStudyNote } from '../services/storeStudyNote.js';
import { toWeekStart } from '../services/toWeekStart.js';

import type { ResolvedStudyNoteDeps } from './studyNoteDeps.js';

const {
  STATUS: { NOT_FOUND, OK, SERVICE_UNAVAILABLE },
} = HTTP;

function createStudyNoteRouter(deps: ResolvedStudyNoteDeps, logger: Logger): Router {
  const { database, labels, modelProvider, now, questions, rateLimitKeySecret } = deps;
  const router = Router();
  const requireSession = createRequireSession({ database, now });
  const perUser = createRateLimit({
    database,
    keyOf: keyOfUser,
    keySecret: rateLimitKeySecret,
    limit: STUDY_NOTE.RATE_LIMIT.PER_USER,
    now,
    scope: STUDY_NOTE.RATE_LIMIT_SCOPE,
    windowMs: STUDY_NOTE.RATE_LIMIT.WINDOW_MS,
  });

  router.get(
    '/study-note',
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
    requireSession,
    perUser,
    async (_req, res) => {
      const { session } = res.locals as { session: { userId: string } };
      const { userId } = session;
      const { rows } = await database.query<{ timezone: string | null }>('SELECT timezone FROM users WHERE id = $1', [
        userId,
      ]);
      const [user] = rows;
      if (!user) {
        sendError(res, NOT_FOUND, ERROR_CODES.ROUTING.NOT_FOUND, 'Not found');
        return;
      }
      const current = now();
      const weekStart = toWeekStart(toLocalDate(current.toISOString(), user.timezone ?? PROGRESS_DEFAULTS.TIMEZONE));
      const stored = await readStudyNote(database, userId, weekStart);
      if (stored !== null) {
        res.status(OK).json({ data: { ...stored, status: 'ready', weekStart } });
        return;
      }
      const since = new Date(current.getTime() - STUDY_NOTE.WINDOW_MS);
      const events = await listRecentAnswerEvents(database, userId, since);
      if (events.length < STUDY_NOTE.MIN_ANSWERS) {
        res.status(OK).json({ data: { remaining: STUDY_NOTE.MIN_ANSWERS - events.length, status: 'gathering' } });
        return;
      }
      if (!modelProvider) {
        sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.STUDY_NOTE.UNAVAILABLE, 'Study notes are unavailable');
        return;
      }
      const summary = buildStudySummary(events, questions, labels);
      let note: string | null = null;
      try {
        note = await modelProvider.answer(buildStudyNotePrompt(summary));
      } catch {
        // No error object: an SDK error can carry the request.
        logger.warn('study note model request failed');
      }
      if (note === null) {
        sendError(res, SERVICE_UNAVAILABLE, ERROR_CODES.STUDY_NOTE.UNAVAILABLE, 'No study note is available right now');
        return;
      }
      const misconceptionIds = summary.missedMisconceptions.map(({ id }) => id);
      const kept = await storeStudyNote(database, userId, weekStart, { misconceptionIds, note });
      res.status(OK).json({ data: { ...kept, status: 'ready', weekStart } });
    },
  );

  return router;
}

export { createStudyNoteRouter };
