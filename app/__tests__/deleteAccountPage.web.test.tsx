// The account deletion page on the web: one h1, no skipped heading levels, and no axe violations (the rule
// engine Lighthouse uses). color-contrast is disabled because jsdom computes no colors; contrast is covered
// by the Lighthouse run on the built web app.
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import DeleteAccountScreen from '../delete-account';

expect.extend(toHaveNoViolations);

describe('account deletion page accessibility on the web', () => {
  it('has one h1, ordered headings, and no axe violations', async () => {
    const { container } = render(<DeleteAccountScreen />);
    const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

    expect(headings.filter((heading) => heading.tagName === 'H1').map((heading) => heading.textContent)).toEqual([
      'Delete your account',
    ]);
    expect(headings.slice(1).every((heading) => heading.tagName === 'H2')).toBe(true);
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });
});
