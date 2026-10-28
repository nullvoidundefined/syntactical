// The home screen's study note: the note when ready, the answers still needed while gathering,
// and nothing for a guest, while loading, or when unavailable. A ready note whose week named
// misconceptions with questions on the device offers "Practice these", a review round of them.
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { StudyNoteState } from '../../../services/studyNote/types/StudyNoteState';
import { useStudyNote } from '../../../state/useStudyNote';
import { StudyNote } from '../StudyNote';

const mockPush = jest.fn();
jest.mock('expo-router', () =>
  require('../../../config/buildExpoRouterMock').buildExpoRouterMock({
    push: (...args: unknown[]) => mockPush(...args),
  }),
);
jest.mock('../../../state/useStudyNote', () => ({ useStudyNote: jest.fn() }));
const mockContent = { isHydrated: true };
jest.mock('../../../state/ContentProvider', () => ({ useContentContext: () => mockContent }));

function bool(id: string, misconceptionId: string): Question {
  return {
    answer: true,
    id,
    misconceptionId,
    prompt: 'p',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
    query: { explanation: 'e', title: 't' },
    type: 'bool',
  };
}

const mockQuestionIndex = new Map(
  [bool('q-1', 'python.list-alias'), bool('q-2', 'python.truthy')].map(
    (question) => [question.id, { difficulty: 'easy', language: 'python', question }] as const,
  ),
);
jest.mock('../../../state/useReviewQueue', () => ({ useReviewQueue: () => ({ questionIndex: mockQuestionIndex }) }));

const mockUseStudyNote = jest.mocked(useStudyNote);

const PRACTICE_LABEL = "Practice this week's study note misconceptions";

function renderWith(state: StudyNoteState) {
  mockUseStudyNote.mockReturnValue(state);
  return render(<StudyNote />);
}

afterEach(() => {
  mockPush.mockReset();
  mockContent.isHydrated = true;
});

describe('StudyNote', () => {
  it('shows the note in a labelled region', async () => {
    await renderWith({ misconceptionIds: [], note: 'You tightened up on list aliasing.', status: 'ready' });

    expect(screen.getByLabelText("This week's study note")).toBeTruthy();
    expect(screen.getByText('You tightened up on list aliasing.')).toBeTruthy();
  });

  it("opens a review round of all the note's misconceptions when one has questions on the device", async () => {
    await renderWith({
      misconceptionIds: ['python.truthy', 'python.not-downloaded', 'python.list-alias'],
      note: 'A note.',
      status: 'ready',
    });

    await fireEvent.press(screen.getByRole('link', { name: PRACTICE_LABEL }));

    expect(mockPush).toHaveBeenCalledWith({
      params: { misconceptions: 'python.truthy,python.not-downloaded,python.list-alias' },
      pathname: '/review',
    });
  });

  it('names the practice link for a screen reader and gives it a 44px touch target', async () => {
    await renderWith({ misconceptionIds: ['python.truthy'], note: 'A note.', status: 'ready' });

    const link = screen.getByRole('link', { name: PRACTICE_LABEL });
    expect(link).toHaveTextContent('Practice these');
    expect(link.props.className).toContain('min-h-[44px]');
  });

  it('offers no practice until the content cache hydrates', async () => {
    mockContent.isHydrated = false;
    await renderWith({ misconceptionIds: ['python.truthy'], note: 'A note.', status: 'ready' });

    expect(screen.getByText('A note.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: PRACTICE_LABEL })).toBeNull();
  });

  it.each([
    ['names no misconception', []],
    ['names only misconceptions with no questions on the device', ['python.not-downloaded']],
  ])('offers no practice when the note %s', async (_name, misconceptionIds) => {
    await renderWith({ misconceptionIds, note: 'A note.', status: 'ready' });

    expect(screen.getByText('A note.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: PRACTICE_LABEL })).toBeNull();
  });

  it('says how many answers the note still needs, with no practice', async () => {
    await renderWith({ remaining: 1, status: 'gathering' });

    expect(screen.getByText('Answer 1 more question this week for your study note.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: PRACTICE_LABEL })).toBeNull();
  });

  it('renders nothing when hidden', async () => {
    await renderWith({ status: 'hidden' });

    expect(screen.queryByLabelText("This week's study note")).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
