// POST ask: the answer, the day's limit, and the answers left on 200; the daily limit (with the
// tier, its limit, and the Pro limit the server names) or the burst limit on 429; unavailable for
// anything else, never a throw. Asking needs only a session, so a 403 is no longer a purchase
// refusal of its own.
import { apiFetch } from '../../../clients/apiClient';
import { ApiUnavailable } from '../../../clients/ApiUnavailable';
import { ASK_FETCH_TIMEOUT_MS } from '../../../constants/appConfig';
import { requestAskAnswer } from '../requestAskAnswer';

jest.mock('../../../clients/apiClient', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);
const target = { bankKey: 'python/easy', choiceIndex: 2, questionId: 'py-easy-0' };

function reply(status: number, body: unknown) {
  mockApiFetch.mockResolvedValueOnce({ body, status });
}

afterEach(() => {
  mockApiFetch.mockReset();
});

describe('requestAskAnswer', () => {
  it('posts the target and message with the longer ask timeout', async () => {
    reply(200, { data: { answer: 'Because.', limit: 5, proLimit: 20, remaining: 4, tier: 'free' } });

    await requestAskAnswer(target, 'Why?');

    expect(mockApiFetch).toHaveBeenCalledWith('ask', {
      body: { ...target, message: 'Why?' },
      method: 'POST',
      timeoutMs: ASK_FETCH_TIMEOUT_MS,
    });
  });

  it.each([
    [5, 4],
    [20, 19],
    [20, 0],
  ])('returns the answer with a limit of %i and %i left', async (limit, remaining) => {
    reply(200, { data: { answer: 'Because.', limit, proLimit: 20, remaining, tier: limit === 20 ? 'pro' : 'free' } });

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({
      answer: 'Because.',
      limit,
      remaining,
      status: 'answered',
    });
  });

  it.each([
    ['a 200 with no answer', 200, { data: { limit: 5, remaining: 3 } }],
    ['a 200 with no limit', 200, { data: { answer: 'Because.', remaining: 3 } }],
    ['a 200 with a zero limit', 200, { data: { answer: 'Because.', limit: 0, remaining: 0 } }],
    ['a 200 with more left than the limit', 200, { data: { answer: 'Because.', limit: 5, remaining: 6 } }],
    ['a 200 with a fractional count', 200, { data: { answer: 'Because.', limit: 5, remaining: 1.5 } }],
    ['a 403', 403, { error: { code: 'ENTITLEMENT_REQUIRED' } }],
    ['an unavailable model', 503, { error: { code: 'ASK_UNAVAILABLE' } }],
    ['a server error', 500, null],
  ])('maps %s to unavailable', async (_name, status, body) => {
    reply(status, body);

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ reason: 'unavailable', status: 'failed' });
  });

  it.each([
    ['the free tier', { limit: 5, proLimit: 20, tier: 'free' }],
    ['a free tier the server tuned to 3', { limit: 3, proLimit: 20, tier: 'free' }],
    ['the Pro tier', { limit: 20, proLimit: 20, tier: 'pro' }],
  ])('maps the daily limit of %s to limit with its tier and both limits', async (_name, named) => {
    reply(429, {
      error: { code: 'ASK_DAILY_LIMIT_REACHED', message: 'Daily ask limit reached', requestId: 'req-1', ...named },
    });

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ ...named, reason: 'limit', status: 'failed' });
  });

  it.each([
    ['nothing named', { code: 'ASK_DAILY_LIMIT_REACHED' }, {}],
    [
      'a limit that is not a whole number',
      { code: 'ASK_DAILY_LIMIT_REACHED', limit: '5', proLimit: 20, tier: 'free' },
      { proLimit: 20, tier: 'free' },
    ],
    ['a zero limit', { code: 'ASK_DAILY_LIMIT_REACHED', limit: 0, tier: 'pro' }, { tier: 'pro' }],
    [
      'an unknown tier',
      { code: 'ASK_DAILY_LIMIT_REACHED', limit: 5, proLimit: 20, tier: 'gold' },
      { limit: 5, proLimit: 20 },
    ],
    [
      'a zero Pro limit',
      { code: 'ASK_DAILY_LIMIT_REACHED', limit: 5, proLimit: 0, tier: 'free' },
      { limit: 5, tier: 'free' },
    ],
  ])('maps the daily limit with %s to limit, keeping only the well-formed fields', async (_name, error, kept) => {
    reply(429, { error });

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ ...kept, reason: 'limit', status: 'failed' });
  });

  it('maps the per-minute limit to busy', async () => {
    reply(429, { error: { code: 'RATE_LIMIT_EXCEEDED' } });

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ reason: 'busy', status: 'failed' });
  });

  it('maps an unreachable server to unavailable instead of throwing', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiUnavailable('API request timed out'));

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ reason: 'unavailable', status: 'failed' });
  });
});
