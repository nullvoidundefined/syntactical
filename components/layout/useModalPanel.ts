// The keyboard and focus contract every modal dialog panel shares. On the web it
// focuses the panel on open, listens for keydown on document in the capture phase
// (so a focused text input cannot swallow the key first), closes on Escape without
// letting the key reach the screen behind, wraps Tab and Shift+Tab inside the panel,
// and on close returns focus to the trigger ref when given, else to whatever had
// focus before the panel opened. On every platform it counts as an open modal, so
// the quiz key bindings are inert while it is mounted.
import { useEffect, useRef, type RefObject } from 'react';

import { Platform, type View } from 'react-native';

import { markModalOpen } from '../../state/modalOpenSignal';

import { wrapTab } from './wrapTab';

type ModalPanelOptions = {
  onClose: () => void;
  returnFocusTo?: RefObject<View | null>;
};

export function useModalPanel(panelRef: RefObject<View | null>, { onClose, returnFocusTo }: ModalPanelOptions): void {
  const isWeb = Platform.OS === 'web';
  // Read through a ref so a new onClose identity does not re-run the focus effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => markModalOpen(), []);

  useEffect(() => {
    if (!isWeb) return undefined;
    const panel = panelRef.current as unknown as HTMLElement | null;
    // The trigger is mounted before the panel, so its node is read now, not at cleanup.
    const returnTarget = (returnFocusTo?.current as unknown as HTMLElement | null) ?? null;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab' && panel) {
        wrapTab(event, panel);
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      (returnTarget ?? previouslyFocused)?.focus?.();
    };
  }, [isWeb, panelRef, returnFocusTo]);
}
