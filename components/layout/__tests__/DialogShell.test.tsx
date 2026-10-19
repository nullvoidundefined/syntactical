import { render, screen, within } from '@testing-library/react-native';
import { Modal, Text } from 'react-native';

import { DialogShell } from '../DialogShell';

describe('DialogShell on native', () => {
  it.each([undefined, 'none', 'slide'] as const)(
    'renders children in a visible transparent Modal with animationType=%s and the supplied close callback',
    (animationType) => {
      const onRequestClose = jest.fn();
      render(
        <DialogShell onRequestClose={onRequestClose} animationType={animationType}>
          <Text>Dialog content</Text>
        </DialogShell>,
      );

      const modal = screen.UNSAFE_getByType(Modal);
      expect(within(modal).getByText('Dialog content')).toBeTruthy();
      expect(modal.props.transparent).toBe(true);
      expect(modal.props.visible).toBe(true);
      expect(modal.props.animationType).toBe(animationType ?? 'none');
      expect(modal.props.onRequestClose).toBe(onRequestClose);
    },
  );
});
