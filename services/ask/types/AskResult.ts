// What one ask came back with: the answer, the day's limit for the learner's tier, and the answers
// left of it; or why there is none. 'limit' is the daily limit, carrying the tier the server
// counted the ask against, that tier's limit, and the Pro tier's limit, each when the server names
// it; 'busy' the per-minute limit; 'unavailable' a failed, declined, or unconfigured model, an
// unexpected reply, or an unreachable server.
export type AskTier = 'free' | 'pro';

export type AskFailure = 'busy' | 'limit' | 'unavailable';

export type AskResult =
  | { answer: string; limit: number; remaining: number; status: 'answered' }
  | { limit?: number; proLimit?: number; reason: 'limit'; status: 'failed'; tier?: AskTier }
  | { reason: 'busy' | 'unavailable'; status: 'failed' };
