// Sends one learner question about a quiz question to POST ask and reads the reply, or, for
// "Explain my mistake", the question and the learner's wrong choice with { mode: 'explain' } in
// place of a message (the server writes that instruction). Never throws: an unreachable server, a
// timeout, or an unexpected reply is 'unavailable'. A 200 carries the answer with the day's limit
// and the answers left of it; a 429 is the daily limit (with the tier, its limit, and the Pro limit
// the server names) or the per-minute burst limit. Asking needs only a session, so there is no
// purchase refusal to map. The limits are the server's: the app keeps no copy of them.
import { apiFetch } from '../../clients/apiClient';
import { readErrorCode } from '../../clients/readErrorCode';
import { ASK_FETCH_TIMEOUT_MS, HTTP_STATUS_OK, HTTP_STATUS_TOO_MANY_REQUESTS } from '../../constants/appConfig';

import type { AskResult, AskTier } from './types/AskResult';
import type { AskTarget } from './types/AskTarget';

const DAILY_LIMIT_CODE = 'ASK_DAILY_LIMIT_REACHED';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readAnswer(body: unknown): { answer: string; limit: number; remaining: number } | null {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  const { answer, limit, remaining } = data ?? {};
  if (typeof answer !== 'string' || answer === '') return null;
  if (!isCount(limit) || limit === 0 || !isCount(remaining) || remaining > limit) return null;
  return { answer, limit, remaining };
}

function readPositiveCount(value: unknown): number | undefined {
  return isCount(value) && value > 0 ? value : undefined;
}

function readTier(value: unknown): AskTier | undefined {
  return value === 'free' || value === 'pro' ? value : undefined;
}

// What a daily-limit refusal names in its error envelope ({ error: { code, limit, message,
// proLimit, requestId, tier } }); each field is kept only when it is well formed.
function readDailyLimit(body: unknown): Extract<AskResult, { reason: 'limit' }> {
  const error = (body as { error?: Record<string, unknown> } | null)?.error ?? {};
  return {
    limit: readPositiveCount(error.limit),
    proLimit: readPositiveCount(error.proLimit),
    reason: 'limit',
    status: 'failed',
    tier: readTier(error.tier),
  };
}

// An ask carries the learner's message; an explanation carries the explain mode instead.
type AskRequest = AskTarget & ({ message: string } | { mode: 'explain' });

async function postAsk(request: AskRequest): Promise<AskResult> {
  let response: Awaited<ReturnType<typeof apiFetch>>;
  try {
    response = await apiFetch('ask', {
      body: request,
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
    return readErrorCode(body) === DAILY_LIMIT_CODE ? readDailyLimit(body) : { reason: 'busy', status: 'failed' };
  }
  return { reason: 'unavailable', status: 'failed' };
}

export function requestAskAnswer(target: AskTarget, message: string): Promise<AskResult> {
  return postAsk({ ...target, message });
}

export function requestMistakeExplanation(target: AskTarget): Promise<AskResult> {
  return postAsk({ ...target, mode: 'explain' });
}
