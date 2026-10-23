// What one ask came back with: the answer and the answers left today, or why there is none.
// 'limit' is the daily limit, 'busy' the per-minute limit, 'locked' a missing purchase, and
// 'unavailable' a failed, declined, or unconfigured model or an unreachable server.
export type AskFailure = 'busy' | 'limit' | 'locked' | 'unavailable';

export type AskResult =
  | { answer: string; remaining: number; status: 'answered' }
  | { reason: AskFailure; status: 'failed' };
