// AuthLink on native (PR 107 review): a link between the sign-in and sign-up
// routes. A press navigates in-app once to its href, and the rendered link
// carries that href.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthLink } from '../AuthLink';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args), replace: () => undefined },
}));

const HREF = '/sign-in?returnTo=%2Fpython%3Fpaywall%3Dmedium';
const LABEL = 'Sign in';

beforeEach(() => {
  mockPush.mockReset();
});

describe('AuthLink on native', () => {
  it('renders one link named by its label that carries the given href', async () => {
    await render(<AuthLink href={HREF} label={LABEL} />);
    const link = screen.getByRole('link', { name: LABEL });
    expect(link.props.href).toBe(HREF);
  });

  it('navigates in-app once to the href on a press', async () => {
    await render(<AuthLink href={HREF} label={LABEL} />);
    await fireEvent.press(screen.getByRole('link', { name: LABEL }));
    expect(mockPush.mock.calls).toEqual([[HREF]]);
  });
});
