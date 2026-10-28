// GET study-note: the note and its misconception ids when ready, the missing answer count while gathering, and a throw for
// anything else, so the home screen shows nothing.
import { apiFetch } from '../../../clients/apiClient';
import { ASK_FETCH_TIMEOUT_MS } from '../../../constants/appConfig';
import { fetchStudyNote } from '../fetchStudyNote';

jest.mock('../../../clients/apiClient', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);

afterEach(() => {
  mockApiFetch.mockReset();
});

describe('fetchStudyNote', () => {
  it('returns the note and its misconception ids with the longer model timeout', async () => {
    mockApiFetch.mockResolvedValueOnce({
      body: { data: { misconceptionIds: ['python.a', 'python.b'], note: 'Good week.', status: 'ready' } },
      status: 200,
    });

    await expect(fetchStudyNote()).resolves.toEqual({
      misconceptionIds: ['python.a', 'python.b'],
      note: 'Good week.',
      status: 'ready',
    });
    expect(mockApiFetch).toHaveBeenCalledWith('study-note', { timeoutMs: ASK_FETCH_TIMEOUT_MS });
  });

  it.each([
    ['no ids', undefined, []],
    ['ids that are not a list', 'python.a', []],
    ['ids that are not all strings', ['python.a', 3, ''], ['python.a']],
  ])('returns the note with %s as the ids it can read', async (_name, misconceptionIds, expected) => {
    mockApiFetch.mockResolvedValueOnce({
      body: { data: { misconceptionIds, note: 'N', status: 'ready' } },
      status: 200,
    });

    await expect(fetchStudyNote()).resolves.toEqual({ misconceptionIds: expected, note: 'N', status: 'ready' });
  });

  it('returns how many answers are still missing', async () => {
    mockApiFetch.mockResolvedValueOnce({ body: { data: { remaining: 7, status: 'gathering' } }, status: 200 });

    await expect(fetchStudyNote()).resolves.toEqual({ remaining: 7, status: 'gathering' });
  });

  it.each([
    ['an unavailable model', 503, { error: { code: 'STUDY_NOTE_UNAVAILABLE' } }],
    ['an empty note', 200, { data: { note: '', status: 'ready' } }],
    ['an unknown status', 200, { data: { status: 'other' } }],
  ])('throws on %s', async (_name, status, body) => {
    mockApiFetch.mockResolvedValueOnce({ body, status });

    await expect(fetchStudyNote()).rejects.toThrow();
  });
});
