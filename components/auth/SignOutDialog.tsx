// The "Sign out" control. Signs out at once when the signed-in user has no
// unsynced events (held ones count as unsynced); otherwise opens a modal
// dialog offering "Sync now" (upload, then sign out), "Discard" (drop this
// user's events, then sign out), and "Cancel". A failed sync stays open and is
// announced in an alert. Every sign-out clears the sync cursor and removes the
// user's events from this device, so it holds one owner's events at a time. No animation; on the web focus moves into
// the dialog on open, Escape closes it (and goes no further), and focus returns
// to "Sign out" on close. While Sync now or Discard runs the dialog cannot be
// closed, and a failure is announced inside it. Quiz key bindings are inert
// while it is open.
import { useCallback, useEffect, useRef, useState } from 'react';

import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { useAuth } from '../../state/AuthProvider';
import { useQuizStats } from '../../state/StatsProvider';
import { useSync } from '../../state/SyncProvider';
import { markModalOpen } from '../../state/modalOpenSignal';

import { AuthButton } from './AuthButton';

const HEADING = 'Unsynced answers';
const HEADING_ID = 'sign-out-dialog-heading';
const SYNC_FAILED = 'Sync failed. Check your connection and try again.';
const DISCARD_FAILED = 'Discard failed. Try again.';

type DialogPanelProps = {
  failureMessage: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSyncNow: () => void;
};

function DialogPanel({ failureMessage, isBusy, onCancel, onDiscard, onSyncNow }: DialogPanelProps) {
  const panelRef = useRef<View>(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => markModalOpen(), []);

  useEffect(() => {
    if (!isWeb) return undefined;
    (panelRef.current as unknown as HTMLElement | null)?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isWeb, onCancel]);

  return (
    <View className="absolute inset-0 items-center justify-center bg-obsidian/90 p-4" style={isWeb ? { position: 'fixed' as 'absolute' } : undefined}>
      <View
        ref={panelRef}
        role="dialog"
        aria-modal={true}
        accessibilityViewIsModal
        aria-label={HEADING}
        aria-labelledby={HEADING_ID}
        nativeID="sign-out-dialog"
        tabIndex={-1}
        className="w-full max-w-md border border-line bg-surface p-4"
      >
        <Text role="heading" aria-level={2} nativeID={HEADING_ID} className="font-mono text-sm text-ink">
          {HEADING}
        </Text>
        <Text className="mt-2 text-sm text-muted">Some of your answers have not synced yet. Sync them before you sign out, or discard them.</Text>
        {failureMessage === null ? null : (
          <Text role="alert" className="mt-2 text-sm text-ink">
            {failureMessage}
          </Text>
        )}
        <AuthButton label="Sync now" isDisabled={isBusy} onPress={onSyncNow} />
        <AuthButton label="Discard" isDisabled={isBusy} isPrimary={false} onPress={onDiscard} />
        <AuthButton label="Cancel" isDisabled={isBusy} isPrimary={false} onPress={onCancel} />
      </View>
    </View>
  );
}

export function SignOutDialog() {
  const { signOut, user } = useAuth();
  const { clearSyncCursor, eventLog, removeUserEvents } = useQuizStats();
  const { cancelPass, syncNow } = useSync();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const triggerRef = useRef<View>(null);
  const isBusyRef = useRef(false);
  const wasOpenRef = useRef(false);

  const hasUnsynced = eventLog.some((entry) => !entry.isSynced);

  // Back and Escape do nothing while Sync now or Discard runs.
  const close = useCallback(() => {
    if (isBusyRef.current) return;
    setIsOpen(false);
    setFailureMessage(null);
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

  // The server holds the user's synced history; a failed removal only leaves
  // events no other owner sees.
  async function finishSignOut(userId: string) {
    await signOut();
    clearSyncCursor();
    await removeUserEvents(userId).catch(() => undefined);
  }

  function handleSignOut() {
    if (user === null) return;
    if (hasUnsynced) {
      setIsOpen(true);
      return;
    }
    void finishSignOut(user.id);
  }

  async function handleSyncNow() {
    if (user === null) return;
    setBusy(true);
    setFailureMessage(null);
    try {
      if (await syncNow()) {
        setIsOpen(false);
        await finishSignOut(user.id);
      } else {
        setFailureMessage(SYNC_FAILED);
      }
    } catch {
      setFailureMessage(SYNC_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    if (user === null) return;
    setBusy(true);
    setFailureMessage(null);
    try {
      cancelPass();
      await removeUserEvents(user.id);
      setIsOpen(false);
      await finishSignOut(user.id);
    } catch {
      setFailureMessage(DISCARD_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <DialogPanel
      failureMessage={failureMessage}
      isBusy={isBusy}
      onCancel={close}
      onDiscard={() => void handleDiscard()}
      onSyncNow={() => void handleSyncNow()}
    />
  );

  const isModalHost = Platform.OS !== 'web';
  const overlay = isModalHost ? (
    <Modal transparent animationType="none" visible onRequestClose={close}>
      {panel}
    </Modal>
  ) : (
    panel
  );

  return (
    <>
      <Pressable ref={triggerRef} role="button" aria-label="Sign out" onPress={handleSignOut}>
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">Sign out</Text>
      </Pressable>
      {isOpen ? overlay : null}
    </>
  );
}
