// The privacy page on the web: one h1, no skipped heading levels, and no axe violations (the rule engine
// Lighthouse uses). color-contrast is disabled because jsdom computes no colors; contrast is covered by
// the Lighthouse run on the built web app.
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import PrivacyScreen from '../privacy';

expect.extend(toHaveNoViolations);

describe('privacy page accessibility on the web', () => {
  it('has one h1, ordered headings, and no axe violations', async () => {
    const { container } = render(<PrivacyScreen />);
    const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

    expect(headings.filter((heading) => heading.tagName === 'H1').map((heading) => heading.textContent)).toEqual([
      'Privacy policy',
    ]);
    expect(headings.slice(1).every((heading) => heading.tagName === 'H2')).toBe(true);
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });
});
