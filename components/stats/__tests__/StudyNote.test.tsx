// The home screen's study note: the note when ready, the answers still needed while gathering,
// and nothing for a guest, while loading, or when unavailable.
import { render, screen } from '@testing-library/react-native';

import type { StudyNoteState } from '../../../services/studyNote/types/StudyNoteState';
import { useStudyNote } from '../../../state/useStudyNote';
import { StudyNote } from '../StudyNote';

jest.mock('../../../state/useStudyNote', () => ({ useStudyNote: jest.fn() }));

const mockUseStudyNote = jest.mocked(useStudyNote);

function renderWith(state: StudyNoteState) {
  mockUseStudyNote.mockReturnValue(state);
  return render(<StudyNote />);
}

describe('StudyNote', () => {
  it('shows the note in a labelled region', async () => {
    await renderWith({ note: 'You tightened up on list aliasing.', status: 'ready' });

    expect(screen.getByLabelText("This week's study note")).toBeTruthy();
    expect(screen.getByText('You tightened up on list aliasing.')).toBeTruthy();
  });

  it('says how many answers the note still needs', async () => {
    await renderWith({ remaining: 1, status: 'gathering' });

    expect(screen.getByText('Answer 1 more question this week for your study note.')).toBeTruthy();
  });

  it('renders nothing when hidden', async () => {
    await renderWith({ status: 'hidden' });

    expect(screen.queryByLabelText("This week's study note")).toBeNull();
  });
});
