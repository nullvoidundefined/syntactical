// Hosts one modal dialog: on the web the overlay is portaled above the whole page
// through ModalOverlay; on native it is a transparent react-native Modal whose
// back-button request closes the dialog.
import type { ReactNode } from 'react';

import { Modal, Platform } from 'react-native';

import { ModalOverlay } from './ModalOverlay';

type DialogShellProps = {
  animationType?: 'none' | 'slide';
  children: ReactNode;
  onRequestClose: () => void;
};

export function DialogShell({ animationType = 'none', children, onRequestClose }: DialogShellProps) {
  if (Platform.OS === 'web') return <ModalOverlay>{children}</ModalOverlay>;
  return (
    <Modal transparent animationType={animationType} visible onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
