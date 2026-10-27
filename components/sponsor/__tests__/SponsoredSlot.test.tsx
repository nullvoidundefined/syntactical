// components/sponsor/__tests__/SponsoredSlot.test.tsx
// Every sponsored card sits in a slot of one fixed height, reserved from the first frame: an empty frame
// with only the Sponsored label while a feed is pending, the card once it fills, and the same height in
// both, so nothing below or around it moves (decision 15). The test renderer computes no layout, so the
// height is pinned through the style; sponsoredCard.spec.ts (Task 6.14) measures Retry in a real browser.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SPONSOR_SLOT_HEIGHT } from '../../../constants/sponsor';
import { SponsoredSlot, SponsoredSlotPlaceholder } from '../SponsoredSlot';

describe('SponsoredSlot', () => {
  it('keeps SPONSOR_SLOT_HEIGHT while empty and after a card fills it', async () => {
    const view = await render(
      <SponsoredSlot placement="results">
        <SponsoredSlotPlaceholder />
      </SponsoredSlot>,
    );
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
    await view.rerender(
      <SponsoredSlot placement="results">
        <Text>a filled card</Text>
      </SponsoredSlot>,
    );
    expect(screen.getByText('a filled card')).toBeTruthy();
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ height: SPONSOR_SLOT_HEIGHT });
  });

  it('clips its content, so no card can draw outside the reserved height', async () => {
    await render(
      <SponsoredSlot placement="tracks">
        <Text>a filled card</Text>
      </SponsoredSlot>,
    );
    expect(screen.getByTestId('sponsored-slot')).toHaveStyle({ overflow: 'hidden' });
  });

  it('shows only the Sponsored label in the empty frame, at least 15 points high, hidden from screen readers', async () => {
    await render(
      <SponsoredSlot placement="tracks">
        <SponsoredSlotPlaceholder />
      </SponsoredSlot>,
    );
    const placeholder = screen.getByTestId('sponsored-card-placeholder', { includeHiddenElements: true });
    expect(placeholder.props['aria-hidden']).toBe(true);
    expect(screen.getByText('Sponsored', { includeHiddenElements: true })).toHaveStyle({ minHeight: 15 });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
