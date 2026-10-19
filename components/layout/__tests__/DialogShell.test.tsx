import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DialogShell } from '../DialogShell';

describe('DialogShell on native', () => {
  it.each([undefined, 'none', 'slide'] as const)(
    'renders children in a visible transparent Modal with animationType=%s and the supplied close callback',
    async (animationType) => {
      const onRequestClose = jest.fn();
      await render(
        <DialogShell onRequestClose={onRequestClose} animationType={animationType}>
          <Text>Dialog content</Text>
        </DialogShell>,
      );

      // Author's single amendment: RNTL 14 has no UNSAFE_getByType; the Modal is the node that
      // carries onRequestClose, as SignOutDialogRaces.test.tsx finds it.
      const modals = screen.container.queryAll((node) => typeof node.props.onRequestClose === 'function');
      expect(modals.length).toBeGreaterThan(0);
      const [modal] = modals;
      expect(within(modal).getByText('Dialog content')).toBeTruthy();
      expect(modal.props.transparent).toBe(true);
      expect(modal.props.visible).toBe(true);
      expect(modal.props.animationType).toBe(animationType ?? 'none');
      expect(modal.props.onRequestClose).toBe(onRequestClose);
    },
  );
});
