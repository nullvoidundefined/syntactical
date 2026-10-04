// The paywall for one paid bank: a modal dialog with one h1, the store's
// localized price on the Buy button (never a hard-coded one), and "Not now".
// It records paywall_viewed once when it opens. On the web the slide-in is
// switched off under reduced motion, focus moves into the sheet, Tab and
// Shift+Tab wrap inside it, Escape closes it, and focus returns to what had it.
// On native it is a Modal. Quiz key bindings are inert while it is open.
import { useEffect, useRef } from 'react';

import { Modal, Platform, Text, View } from 'react-native';

import { trackEvent } from '../../clients/analyticsClient';
import { markModalOpen } from '../../state/modalOpenSignal';
import { useIsReducedMotion } from '../../state/useIsReducedMotion';
import { AuthButton } from '../auth/AuthButton';
import { ModalOverlay } from '../layout/ModalOverlay';
import { wrapTab } from '../layout/wrapTab';

const HEADING_ID = 'paywall-sheet-heading';

type PaywallSheetProps = {
  difficultyLabel: string;
  isBuying: boolean;
  message: string | null;
  onBuy: () => void;
  onClose: () => void;
  price: string | undefined;
};

function usePanelKeyboard(panelRef: React.RefObject<View | null>, onClose: () => void) {
  const isWeb = Platform.OS === 'web';
  // Read through a ref so a new onClose identity does not re-run the focus effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!isWeb) return undefined;
    const panel = panelRef.current as unknown as HTMLElement | null;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isWeb, panelRef]);
}

export function PaywallSheet({ difficultyLabel, isBuying, message, onBuy, onClose, price }: PaywallSheetProps) {
  const panelRef = useRef<View>(null);
  const isReducedMotion = useIsReducedMotion();
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);
  useEffect(() => markModalOpen(), []);
  usePanelKeyboard(panelRef, onClose);

  const slide = { animation: isReducedMotion ? 'none' : 'paywall-slide-up 200ms ease-out' };
  const panel = (
    <View
      className="absolute inset-0 items-center justify-end bg-obsidian/90 sm:justify-center"
      style={isWeb ? { position: 'fixed' as 'absolute' } : undefined}
    >
      <View
        ref={panelRef}
        role="dialog"
        // Native role queries (and the dialog's own announcement) need the dialog itself to be accessible.
        accessible
        aria-modal={true}
        accessibilityViewIsModal
        aria-labelledby={HEADING_ID}
        testID="paywall-sheet-panel"
        tabIndex={-1}
        style={isWeb ? (slide as object) : undefined}
        className="w-full max-w-md border border-line bg-surface p-4"
      >
        <Text role="heading" aria-level={1} nativeID={HEADING_ID} className="font-mono text-lg text-ink">
          {`Unlock ${difficultyLabel}`}
        </Text>
        <Text className="mt-2 text-sm text-muted">
          One purchase unlocks every {difficultyLabel} question for this language on your account.
        </Text>
        {message === null ? null : (
          <Text role="alert" className="mt-2 text-sm text-ink">
            {message}
          </Text>
        )}
        <AuthButton
          label={price === undefined ? `Buy ${difficultyLabel}` : `Buy ${difficultyLabel} for ${price}`}
          isDisabled={isBuying}
          onPress={onBuy}
        />
        <AuthButton label="Not now" isDisabled={isBuying} isPrimary={false} onPress={onClose} />
      </View>
    </View>
  );

  if (isWeb) return <ModalOverlay>{panel}</ModalOverlay>;
  return (
    <Modal transparent animationType={isReducedMotion ? 'none' : 'slide'} visible onRequestClose={onClose}>
      {panel}
    </Modal>
  );
}
