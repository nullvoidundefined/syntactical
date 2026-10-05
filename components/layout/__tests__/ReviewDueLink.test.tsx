import { render, screen } from '@testing-library/react-native';

import { ReviewDueLink } from '../ReviewDueLink';

let mockDueCount = 0;
jest.mock('../../../state/useReviewQueue', () => ({
  useReviewQueue: () => ({
    dueQuestions: Array.from({ length: mockDueCount }, (_unused, index) => ({ question: { id: `q-${index}` } })),
  }),
}));

describe('ReviewDueLink', () => {
  it('names how many reviews are due as a link', async () => {
    mockDueCount = 3;
    await render(<ReviewDueLink />);
    expect(screen.getByRole('link', { name: '3 reviews due' })).toBeTruthy();
  });

  it('uses the singular for one review', async () => {
    mockDueCount = 1;
    await render(<ReviewDueLink />);
    expect(screen.getByRole('link', { name: '1 review due' })).toBeTruthy();
  });

  it('renders nothing when no review is due', async () => {
    mockDueCount = 0;
    await render(<ReviewDueLink />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
