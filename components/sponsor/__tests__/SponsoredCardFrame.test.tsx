// components/sponsor/__tests__/SponsoredCardFrame.test.tsx
// The sponsored card frame on native: the Sponsored label is the first child and at least 15 points high
// (AdMob's attribution rule), the body is one line, the icon sits before the text, and the one button is a
// link whose name starts with "Sponsored:".
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { HOUSE_CARD } from '../../../constants/sponsor';
import { SponsorContentCard } from '../SponsoredCardFrame';

const DIRECT = {
  body: 'Managed Postgres with branching for every pull request, free for hobby projects.',
  callToAction: 'Learn more',
  headline: 'Neon',
  href: 'https://neon.tech',
  iconUri: 'https://example.test/content/sponsor/icon.png',
  source: 'direct' as const,
};

describe('SponsorContentCard on native', () => {
  it('puts the Sponsored label first, at least 15 points high', async () => {
    await render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    const card = screen.getByTestId('sponsored-card');
    const label = screen.getByText('Sponsored');
    const firstHost = card.findAll((node: ReactTestInstance) => node !== card && typeof node.type === 'string')[0];
    expect(firstHost).toBe(label);
    expect(label).toHaveStyle({ minHeight: 15 });
  });

  it('labels the card "Sponsored: <headline>"', async () => {
    await render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    expect(screen.getByTestId('sponsored-card').props['aria-label']).toBe('Sponsored: Syntactical Pro');
  });

  it('shows the headline and exactly one line of body text', async () => {
    await render(<SponsorContentCard content={DIRECT} onPress={jest.fn()} />);
    expect(screen.getByText('Neon')).toBeTruthy();
    expect(screen.getByText(DIRECT.body).props.numberOfLines).toBe(1);
  });

  it('renders one link button whose name starts with Sponsored: and includes the visible label', async () => {
    const onPress = jest.fn();
    await render(<SponsorContentCard content={HOUSE_CARD} onPress={onPress} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Sponsored: Syntactical Pro. See Pro' })).toBe(links[0]);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await fireEvent.press(links[0]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the icon only when the content has one', async () => {
    await render(<SponsorContentCard content={DIRECT} onPress={jest.fn()} />);
    expect(screen.getByTestId('sponsored-card-icon').props.source).toEqual({ uri: DIRECT.iconUri });
    await render(<SponsorContentCard content={HOUSE_CARD} onPress={jest.fn()} />);
    expect(screen.queryByTestId('sponsored-card-icon')).toBeNull();
  });
});
