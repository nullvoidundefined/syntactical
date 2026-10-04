// The "Delete account" control (B-59, B-64). Opens a modal dialog that
// permanently deletes the signed-in account once the user types DELETE exactly
// and confirms. Confirm sends DELETE /v1/me; on 204 the running sync pass is
// cancelled and the device signs out with no further request, and the stats
// layer then removes that user's local events and stats key. Any failure shows
// one generic message and changes nothing; offline the confirm stays disabled.
// While the request runs the dialog cannot be closed. On the web focus moves
// into the dialog on open, Escape closes it, and focus returns to the trigger.
import { useCallback, useEffect, useRef, useState } from 'react';

import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { apiFetch } from '../../clients/apiClient';
import { useAuth } from '../../state/AuthProvider';
import { useSync } from '../../state/SyncProvider';
import { markModalOpen } from '../../state/modalOpenSignal';
import { useIsOnline } from '../../state/useIsOnline';

import { AuthButton } from './AuthButton';

const HEADING = 'Delete account';
const HEADING_ID = 'delete-account-dialog-heading';
const INPUT_LABEL = 'Type DELETE to confirm';
const CONFIRMATION = 'DELETE';
const HTTP_NO_CONTENT = 204;
const OFFLINE_MESSAGE = 'You are offline. Connect to the internet to delete your account.';
const FAILURE_MESSAGE = 'Your account could not be deleted. Try again.';

type DialogPanelProps = {
  confirmation: string;
  isBusy: boolean;
  isOnline: boolean;
  message: string | null;
  onCancel: () => void;
  onChangeConfirmation: (value: string) => void;
  onConfirm: () => void;
};

function DialogPanel({ confirmation, isBusy, isOnline, message, onCancel, onChangeConfirmation, onConfirm }: DialogPanelProps) {
  const panelRef = useRef<View>(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => markModalOpen(), []);

  useEffect(() => {
    if (!isWeb) return undefined;
    (panelRef.current as unknown as HTMLElement | null)?.focus();
    // Tab wraps inside the dialog: from the last control to the first, and back with Shift.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        const panel = panelRef.current as unknown as HTMLElement | null;
        const controls = Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
        const [first] = controls;
        const last = controls[controls.length - 1];
        const edge = event.shiftKey ? first : last;
        if (first === undefined || (document.activeElement !== edge && !(event.shiftKey && document.activeElement === panel))) return;
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    }
    // Capture phase, so a focused text input cannot swallow the key first.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isWeb, onCancel]);

  const shownMessage = isOnline ? message : OFFLINE_MESSAGE;
  const canConfirm = isOnline && !isBusy && confirmation === CONFIRMATION;

  return (
    <View className="absolute inset-0 items-center justify-center bg-obsidian/90 p-4" style={isWeb ? { position: 'fixed' as 'absolute' } : undefined}>
      <View
        ref={panelRef}
        role="dialog"
        aria-modal={true}
        accessibilityViewIsModal
        aria-labelledby={HEADING_ID}
        nativeID="delete-account-dialog"
        tabIndex={-1}
        className="w-full max-w-md border border-line bg-surface p-4"
      >
        <Text role="heading" aria-level={2} nativeID={HEADING_ID} className="font-mono text-sm text-ink">
          {HEADING}
        </Text>
        <Text className="mt-2 text-sm text-muted">
          This permanently deletes your account, your synced answers, and your progress. It cannot be undone.
        </Text>
        <TextInput
          aria-label={INPUT_LABEL}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          value={confirmation}
          onChangeText={onChangeConfirmation}
          className="mt-4 border border-ink px-3 py-2 font-mono text-base text-ink"
        />
        {shownMessage === null ? null : (
          <Text role="alert" className="mt-2 text-sm text-ink">
            {shownMessage}
          </Text>
        )}
        <AuthButton label="Delete my account" isDisabled={!canConfirm} onPress={onConfirm} />
        <AuthButton label="Cancel" isDisabled={isBusy} isPrimary={false} onPress={onCancel} />
      </View>
    </View>
  );
}

export function DeleteAccountDialog() {
  const { signOutDeletedAccount, user } = useAuth();
  const { cancelPass } = useSync();
  const isOnline = useIsOnline();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const triggerRef = useRef<View>(null);
  const isBusyRef = useRef(false);
  const wasOpenRef = useRef(false);

  // Back, Escape, and Cancel do nothing while the request runs.
  const close = useCallback(() => {
    if (isBusyRef.current) return;
    setIsOpen(false);
    setConfirmation('');
    setMessage(null);
  }, []);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen && Platform.OS === 'web') {
      (triggerRef.current as unknown as HTMLElement | null)?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  function setBusy(value: boolean) {
    isBusyRef.current = value;
    setIsBusy(value);
  }

  async function handleConfirm() {
    if (isBusyRef.current || !isOnline || confirmation !== CONFIRMATION) return;
    if (user === null) return;
    // The id is taken before the request: a concurrent 401 can sign the device out first.
    const deletedUserId = user.id;
    setBusy(true);
    setMessage(null);
    cancelPass();
    let isDeleted = false;
    try {
      isDeleted = (await apiFetch('me', { method: 'DELETE' })).status === HTTP_NO_CONTENT;
    } catch {
      isDeleted = false;
    }
    setBusy(false);
    if (!isDeleted) {
      setMessage(FAILURE_MESSAGE);
      return;
    }
    setIsOpen(false);
    await signOutDeletedAccount(deletedUserId);
  }

  const panel = (
    <DialogPanel
      confirmation={confirmation}
      isBusy={isBusy}
      isOnline={isOnline}
      message={message}
      onCancel={close}
      onChangeConfirmation={setConfirmation}
      onConfirm={() => void handleConfirm()}
    />
  );

  const overlay =
    Platform.OS === 'web' ? (
      panel
    ) : (
      <Modal transparent animationType="none" visible onRequestClose={close}>
        {panel}
      </Modal>
    );

  return (
    <>
      <Pressable ref={triggerRef} role="button" aria-label={HEADING} onPress={() => setIsOpen(true)}>
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">Delete account</Text>
      </Pressable>
      {isOpen ? overlay : null}
    </>
  );
}
