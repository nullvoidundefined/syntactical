// GET study-note: the week's note, or how many synced answers it still needs. Any other reply,
// including a 503 while no model is configured, throws, and the home screen shows nothing.
import { apiFetch } from '../../clients/apiClient';
import { ASK_FETCH_TIMEOUT_MS, HTTP_STATUS_OK } from '../../constants/appConfig';

import type { StudyNoteState } from './types/StudyNoteState';

export async function fetchStudyNote(): Promise<Exclude<StudyNoteState, { status: 'hidden' }>> {
  // Writing a note waits on the model, like an ask.
  const { body, status } = await apiFetch('study-note', { timeoutMs: ASK_FETCH_TIMEOUT_MS });
  const data = (body as { data?: { note?: unknown; remaining?: unknown; status?: unknown } } | null)?.data;
  if (status === HTTP_STATUS_OK && data?.status === 'ready' && typeof data.note === 'string' && data.note !== '') {
    return { note: data.note, status: 'ready' };
  }
  if (status === HTTP_STATUS_OK && data?.status === 'gathering' && typeof data.remaining === 'number') {
    return { remaining: data.remaining, status: 'gathering' };
  }
  throw new Error(`study note request answered ${status}`);
}
