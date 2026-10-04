import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { ModalOverlay } from '../ModalOverlay';

describe('ModalOverlay on the web', () => {
  // Inside the app bar or the page content a fixed overlay is confined to that stacking context;
  // in document.body it sits above both.
  it('renders its children into document.body, outside the app tree', () => {
    const { container } = render(
      <ModalOverlay>
        <Text>overlay content</Text>
      </ModalOverlay>,
    );
    const content = screen.getByText('overlay content');
    expect(container.contains(content)).toBe(false);
    expect(document.body.contains(content)).toBe(true);
  });
});
