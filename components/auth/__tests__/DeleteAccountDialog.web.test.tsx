// DeleteAccountDialog on the web (Task 3.21 client; B-64 keyboard support): opening it moves
// focus into a labeled modal dialog, the confirmation input has an accessible name, Escape
// closes it and returns focus to the "Delete account" control, and nothing is sent.
import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { AUTH_STORAGE_KEY } from '../../../constants/appConfig';
import { AuthProvider, useAuth } from '../../../state/AuthProvider';
import { OwnedStatsProvider } from '../../../state/OwnedStatsProvider';
import { SyncProvider } from '../../../state/SyncProvider';
import { createApiRouter, type ApiRouter } from '../../../state/__tests__/syncTestSupport';
import { DeleteAccountDialog } from '../DeleteAccountDialog';

const mockApi: { router: ApiRouter | null } = { router: null };

jest.mock('../../../clients/apiClient', () => ({
  apiFetch: (path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    if (!mockApi.router) throw new Error('no router installed');
    return mockApi.router.request(path, init);
  },
}));
jest.mock('../../../clients/getLatestRequestSeq', () => ({ getLatestRequestSeq: () => 0 }));
jest.mock('../../../clients/onUnauthorized', () => ({ onUnauthorized: () => () => undefined }));
jest.mock('@react-native-community/netinfo', () => {
  const api = {
    addEventListener: (listener: (value: { isConnected: boolean }) => void) => {
      listener({ isConnected: true });
      return () => undefined;
    },
    fetch: () => Promise.resolve({ isConnected: true }),
  };
  return { __esModule: true, default: api, ...api };
});

const latest: { auth: ReturnType<typeof useAuth> | null } = { auth: null };

function Probe() {
  latest.auth = useAuth();
  return null;
}

describe('DeleteAccountDialog on the web', () => {
  const userId = randomUUID();
  let router: ApiRouter;

  beforeEach(async () => {
    await AsyncStorage.clear();
    router = createApiRouter();
    mockApi.router = router;
    router.state.activeUserId = userId;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ knownUserIds: [userId], userId }));
  });

  it('moves focus into a labeled dialog, and Escape closes it and returns focus to the control', async () => {
    render(
      <AuthProvider>
        <OwnedStatsProvider>
          <SyncProvider>
            <DeleteAccountDialog />
            <Probe />
          </SyncProvider>
        </OwnedStatsProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(latest.auth?.user).toEqual({ id: userId }));
    const control = screen.getByRole('button', { name: 'Delete account' });
    await act(async () => {
      control.focus();
      fireEvent.click(control);
    });

    const dialog = await screen.findByRole('dialog', { name: 'Delete account' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete account' })));
    expect(router.sent.filter(({ path }) => path === 'me')).toEqual([]);
    expect(latest.auth?.isSignedIn).toBe(true);
  });

  it('keeps Tab inside the dialog: from the last control it returns to the first', async () => {
    render(
      <AuthProvider>
        <OwnedStatsProvider>
          <SyncProvider>
            <DeleteAccountDialog />
            <Probe />
          </SyncProvider>
        </OwnedStatsProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(latest.auth?.user).toEqual({ id: userId }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Delete account' });
    const input = within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    await act(async () => {
      cancel.focus();
      fireEvent.keyDown(cancel, { code: 'Tab', key: 'Tab' });
    });
    expect(document.activeElement).toBe(input);

    await act(async () => {
      fireEvent.keyDown(input, { code: 'Tab', key: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(cancel);
  });
});
