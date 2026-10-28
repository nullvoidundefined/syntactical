// useStudyNote: a guest makes no request and sees nothing; a signed-in user gets the fetched
// state; a failed fetch shows nothing.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
import { fetchStudyNote } from '../../services/studyNote/fetchStudyNote';
import { useSignedInUserId } from '../AuthProvider';
import { useStudyNote } from '../useStudyNote';

jest.mock('../AuthProvider', () => ({ useSignedInUserId: jest.fn() }));
jest.mock('../../services/studyNote/fetchStudyNote', () => ({ fetchStudyNote: jest.fn() }));

const mockUserId = jest.mocked(useSignedInUserId);
const mockFetch = jest.mocked(fetchStudyNote);
const latest: { state: ReturnType<typeof useStudyNote> | null } = { state: null };

function Probe() {
  latest.state = useStudyNote();
  return null;
}

async function renderProbe() {
  await render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockFetch.mockReset();
  latest.state = null;
});

describe('useStudyNote', () => {
  it('is hidden for a guest and makes no request', async () => {
    mockUserId.mockReturnValue(null);

    await renderProbe();

    expect(latest.state).toEqual({ status: 'hidden' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the fetched note for a signed-in user', async () => {
    mockUserId.mockReturnValue('user-1');
    mockFetch.mockResolvedValueOnce({ misconceptionIds: [], note: 'Good week.', status: 'ready' });

    await renderProbe();

    await waitFor(() => expect(latest.state).toEqual({ misconceptionIds: [], note: 'Good week.', status: 'ready' }));
  });

  it('stays hidden when the fetch fails', async () => {
    mockUserId.mockReturnValue('user-1');
    mockFetch.mockRejectedValueOnce(new Error('503'));

    await renderProbe();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(latest.state).toEqual({ status: 'hidden' });
  });
});
