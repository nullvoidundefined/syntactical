// Sends one learner question about a quiz question to POST ask and reads the reply. Never throws:
// an unreachable server, a timeout, or an unexpected reply is 'unavailable', and each refusal the
// server names maps to its own reason so the ask box can say what happened.
import { apiFetch } from '../../clients/apiClient';
import { readErrorCode } from '../../clients/readErrorCode';
import {
  ASK_FETCH_TIMEOUT_MS,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_OK,
  HTTP_STATUS_TOO_MANY_REQUESTS,
} from '../../constants/appConfig';

import type { AskResult } from './types/AskResult';
import type { AskTarget } from './types/AskTarget';

const DAILY_LIMIT_CODE = 'ASK_DAILY_LIMIT_REACHED';

function readAnswer(body: unknown): { answer: string; remaining: number } | null {
  const data = (body as { data?: { answer?: unknown; remaining?: unknown } } | null)?.data;
  const { answer, remaining } = data ?? {};
  if (typeof answer !== 'string' || answer === '' || typeof remaining !== 'number') return null;
  return { answer, remaining };
}

export async function requestAskAnswer(target: AskTarget, message: string): Promise<AskResult> {
  let response: Awaited<ReturnType<typeof apiFetch>>;
  try {
    response = await apiFetch('ask', {
      body: { ...target, message },
      method: 'POST',
      timeoutMs: ASK_FETCH_TIMEOUT_MS,
    });
  } catch {
    return { reason: 'unavailable', status: 'failed' };
  }
  const { body, status } = response;
  if (status === HTTP_STATUS_OK) {
    const reply = readAnswer(body);
    return reply ? { ...reply, status: 'answered' } : { reason: 'unavailable', status: 'failed' };
  }
  if (status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    return { reason: readErrorCode(body) === DAILY_LIMIT_CODE ? 'limit' : 'busy', status: 'failed' };
  }
  if (status === HTTP_STATUS_FORBIDDEN) return { reason: 'locked', status: 'failed' };
  return { reason: 'unavailable', status: 'failed' };
}
