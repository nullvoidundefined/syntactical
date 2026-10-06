// AuthLink on the web (PR 107 review): a real <a> whose href is the given
// href. A plain click navigates in-app once with the browser's own navigation
// cancelled; a ctrl, meta, or shift click, or a non-primary button, is left to
// the browser (a new tab or window): no in-app navigation, no default prevented.
import { act, fireEvent, render, screen } from '@testing-library/react';

import { AuthLink } from '../AuthLink';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args), replace: () => undefined },
}));

const HREF = '/sign-up?returnTo=%2Fpython%3Fpaywall%3Dmedium';
const LABEL = 'Create an account';

// fireEvent returns dispatchEvent's result: false when a handler called preventDefault.
function clickIsDefaultPrevented(element: HTMLElement, init: MouseEventInit = {}): boolean {
  let isNotPrevented = true;
  act(() => {
    isNotPrevented = fireEvent.click(element, init);
  });
  return !isNotPrevented;
}

function renderLink(): HTMLElement {
  render(<AuthLink href={HREF} label={LABEL} />);
  return screen.getByRole('link', { name: LABEL });
}

beforeEach(() => {
  mockPush.mockReset();
});

describe('AuthLink on the web', () => {
  it('renders an <a> whose href is the given href', () => {
    const link = renderLink();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(HREF);
  });

  it('navigates in-app once on a plain click, with the browser default prevented', () => {
    const link = renderLink();
    const isPrevented = clickIsDefaultPrevented(link, { button: 0 });
    expect(mockPush.mock.calls).toEqual([[HREF]]);
    expect(isPrevented).toBe(true);
  });

  it.each([
    ['ctrlKey', { button: 0, ctrlKey: true }],
    ['metaKey', { button: 0, metaKey: true }],
    ['shiftKey', { button: 0, shiftKey: true }],
    ['button 1', { button: 1 }],
  ] as const)(
    'leaves a click with %s to the browser: no in-app navigation and no default prevented',
    (_label, init) => {
      const link = renderLink();
      const isPrevented = clickIsDefaultPrevented(link, init);
      expect(mockPush).not.toHaveBeenCalled();
      expect(isPrevented).toBe(false);
    },
  );
});
