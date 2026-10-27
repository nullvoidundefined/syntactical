// components/sponsor/__tests__/SponsoredCardFrame.web.test.tsx
// On the web the sponsored card is a named group with one link and no axe violations (the rule engine
// Lighthouse uses). color-contrast is disabled because jsdom computes no colors; the Lighthouse run covers it.
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { HOUSE_CARD } from '../../../constants/sponsor';
import { SponsorContentCard } from '../SponsoredCardFrame';

expect.extend(toHaveNoViolations);

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('SponsorContentCard on the web', () => {
  it('is a group named "Sponsored: <headline>" whose first text is the Sponsored label', () => {
    render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    const group = screen.getByRole('group', { name: 'Sponsored: Syntactical Pro' });
    expect(group.firstElementChild?.textContent).toBe('Sponsored');
  });

  it('has one link named with the Sponsored: prefix and the visible label', () => {
    render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' })).toBeTruthy();
  });

  it('has no axe violations, with and without an icon', async () => {
    const { container, rerender } = render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
    rerender(
      <SponsorContentCard
        content={{ ...HOUSE_CARD, iconUri: 'https://example.test/content/sponsor/icon.png', source: 'direct' }}
        onPress={jest.fn()}
      />,
    );
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
