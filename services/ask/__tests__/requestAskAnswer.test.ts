// POST ask: the answer and the answers left on 200, and one reason per refusal, never a throw.
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
    reply(200, { data: { answer: 'Because.', remaining: 19 } });

    await requestAskAnswer(target, 'Why?');

    expect(mockApiFetch).toHaveBeenCalledWith('ask', {
      body: { ...target, message: 'Why?' },
      method: 'POST',
      timeoutMs: ASK_FETCH_TIMEOUT_MS,
    });
  });

  it('returns the answer and the answers left today', async () => {
    reply(200, { data: { answer: 'Because.', remaining: 19 } });

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({
      answer: 'Because.',
      remaining: 19,
      status: 'answered',
    });
  });

  it.each([
    ['a 200 with no answer', 200, { data: { remaining: 3 } }, 'unavailable'],
    ['the daily limit', 429, { error: { code: 'ASK_DAILY_LIMIT_REACHED' } }, 'limit'],
    ['the per-minute limit', 429, { error: { code: 'RATE_LIMIT_EXCEEDED' } }, 'busy'],
    ['a missing purchase', 403, { error: { code: 'ENTITLEMENT_REQUIRED' } }, 'locked'],
    ['an unavailable model', 503, { error: { code: 'ASK_UNAVAILABLE' } }, 'unavailable'],
    ['a server error', 500, null, 'unavailable'],
  ])('maps %s to %s', async (_name, status, body, reason) => {
    reply(status, body);

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ reason, status: 'failed' });
  });

  it('maps an unreachable server to unavailable instead of throwing', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiUnavailable('API request timed out'));

    await expect(requestAskAnswer(target, 'Why?')).resolves.toEqual({ reason: 'unavailable', status: 'failed' });
  });
});
