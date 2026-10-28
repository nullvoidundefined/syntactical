// GET study-note: the week's note, or how many synced answers it still needs. Any other reply,
// including a 503 while no model is configured, throws, and the home screen shows nothing. A note
// keeps the misconception ids it can read: none from a server that sends none, otherwise the
// first STUDY_NOTE_MAX_MISCONCEPTIONS distinct ones shaped like a content misconception id
// (`<language>.<slug>`, as findMisconceptionsProblem checks them).
import { CONTENT_LIMITS } from '@syntactical/content-schema';

import { apiFetch } from '../../clients/apiClient';
import { ASK_FETCH_TIMEOUT_MS, HTTP_STATUS_OK, STUDY_NOTE_MAX_MISCONCEPTIONS } from '../../constants/appConfig';

import type { StudyNoteState } from './types/StudyNoteState';

const MISCONCEPTION_ID = /^[a-z0-9-]{1,32}\.[a-z0-9]+(-[a-z0-9]+)*$/;

function isMisconceptionId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= CONTENT_LIMITS.referenceIdLength && MISCONCEPTION_ID.test(id);
}

function readMisconceptionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isMisconceptionId))].slice(0, STUDY_NOTE_MAX_MISCONCEPTIONS);
}

export async function fetchStudyNote(): Promise<Exclude<StudyNoteState, { status: 'hidden' }>> {
  // Writing a note waits on the model, like an ask.
  const { body, status } = await apiFetch('study-note', { timeoutMs: ASK_FETCH_TIMEOUT_MS });
  const data = (
    body as { data?: { misconceptionIds?: unknown; note?: unknown; remaining?: unknown; status?: unknown } } | null
  )?.data;
  if (status === HTTP_STATUS_OK && data?.status === 'ready' && typeof data.note === 'string' && data.note !== '') {
    return { misconceptionIds: readMisconceptionIds(data.misconceptionIds), note: data.note, status: 'ready' };
  }
  if (status === HTTP_STATUS_OK && data?.status === 'gathering' && typeof data.remaining === 'number') {
    return { remaining: data.remaining, status: 'gathering' };
  }
  throw new Error(`study note request answered ${status}`);
}
