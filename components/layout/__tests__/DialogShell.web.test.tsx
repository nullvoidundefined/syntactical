import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { DialogShell } from '../DialogShell';

describe('DialogShell on the web', () => {
  it('renders its children into document.body outside the render container', () => {
    const { container } = render(
      <DialogShell onRequestClose={jest.fn()}>
        <Text>Dialog content</Text>
      </DialogShell>,
    );

    const content = screen.getByText('Dialog content');
    expect(container.contains(content)).toBe(false);
    expect(document.body.contains(content)).toBe(true);
  });
});
