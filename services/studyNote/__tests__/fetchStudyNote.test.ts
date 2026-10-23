// GET study-note: the note when ready, the missing answer count while gathering, and a throw for
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
  it('returns the note with the longer model timeout', async () => {
    mockApiFetch.mockResolvedValueOnce({ body: { data: { note: 'Good week.', status: 'ready' } }, status: 200 });

    await expect(fetchStudyNote()).resolves.toEqual({ note: 'Good week.', status: 'ready' });
    expect(mockApiFetch).toHaveBeenCalledWith('study-note', { timeoutMs: ASK_FETCH_TIMEOUT_MS });
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
