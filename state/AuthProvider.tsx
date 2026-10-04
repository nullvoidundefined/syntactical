// Owns sign-in for the whole app: requests and verifies an emailed code,
// holds the native session value only in the secure store (the web build uses
// an HttpOnly cookie), and persists just the non-secret identity (user id and
// the ids that have signed in on this device). The first sign-in of an id on
// this device raises guestClaimUserId until completeGuestClaim(userId), and
// only then is the id stored as known, so a claim that never completed is
// raised again on the next launch. Sign-out clears local state even when the server call fails, any
// 401 signs the user out locally, and calls made before hydration wait for it. After the server deletes the account, signOutDeletedAccount signs
// out with no request and names the deleted id in deletedUserId, so the stats
// layer removes that user's local data. The session value, email, and code
// are never logged or stored outside the secure store. The RevenueCat purchaser
// identity follows the signed-in user (identified after sign-in and hydration,
// reset on every sign-out path, never for a guest); its failures never change
// a result.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Platform } from 'react-native';

import { apiFetch } from '../clients/apiClient';
import { clearSessionToken } from '../clients/clearSessionToken';
import { logWarning } from '../clients/logClient';
import { onUnauthorized } from '../clients/onUnauthorized';
import { identifyPurchaser, resetPurchaser } from '../clients/purchasesIdentity';
import { readStoredJson } from '../clients/readStoredJson';
import { writeJson } from '../clients/writeJson';
import { writeSessionToken } from '../clients/writeSessionToken';
import {
  AUTH_STORAGE_KEY,
  HTTP_STATUS_ACCEPTED,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_CREATED,
  HTTP_STATUS_TOO_MANY_REQUESTS,
} from '../constants/appConfig';
import { resolveStoredAuth } from '../services/auth/resolveStoredAuth';

export type AuthResult =
  | { isOk: true }
  | { isOk: false; reason: 'invalid-code' | 'invalid-email' | 'rate-limited' | 'unavailable' };

type AuthContextValue = {
  completeGuestClaim: (userId: string) => void;
  deletedUserId: string | null;
  guestClaimUserId: string | null;
  isHydrated: boolean;
  isSignedIn: boolean;
  requestCode: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  signOutDeletedAccount: (deletedUserId: string) => Promise<void>;
  user: { id: string } | null;
  verifyCode: (email: string, code: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readSessionResponse(body: unknown): { sessionValue: string | null; userId: string | null } {
  const data = (body as { data?: { token?: unknown; userId?: unknown } } | null)?.data;
  const { token, userId } = data ?? {};
  return {
    sessionValue: typeof token === 'string' ? token : null,
    userId: typeof userId === 'string' ? userId : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);
  const [knownUserIds, setKnownUserIdsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [deletedUserId, setDeletedUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const knownRef = useRef<string[]>([]);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const hydration = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (hydration.current === null) {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    hydration.current = { promise, resolve };
  }
  const signInCount = useRef(0);
  const verifyRun = useRef<Promise<AuthResult> | null>(null);

  const setUserId = useCallback((next: string | null) => {
    userIdRef.current = next;
    setUserIdState(next);
  }, []);

  const setKnownUserIds = useCallback((next: string[]) => {
    knownRef.current = next;
    setKnownUserIdsState(next);
  }, []);

  // Writes the identity: the current user id and the known ids held in memory.
  const persist = useCallback((nextUserId: string | null) => {
    const knownUserIds = knownRef.current;
    writeQueue.current = writeQueue.current.then(() =>
      writeJson(AUTH_STORAGE_KEY, { knownUserIds, userId: nextUserId }),
    );
  }, []);

  const signOutLocally = useCallback(async () => {
    setUserId(null);
    persist(null);
    void resetPurchaser();
    try {
      await clearSessionToken();
    } catch (err) {
      // Local state is already signed out; record the failure without any value.
      const cause = err instanceof Error ? err : new Error('secure store delete failed');
      logWarning({ err: cause }, 'session value delete failed on sign-out');
    }
  }, [persist, setUserId]);

  useEffect(() => {
    let isActive = true;
    void readStoredJson(AUTH_STORAGE_KEY).then((read) => {
      if (!isActive) return;
      const stored = resolveStoredAuth(read.value);
      if (stored) {
        const { knownUserIds, userId: storedUserId } = stored;
        setKnownUserIds(knownUserIds);
        setUserId(storedUserId);
        if (storedUserId !== null) void identifyPurchaser(storedUserId);
      }
      setIsHydrated(true);
      hydration.current?.resolve();
    });
    return () => {
      isActive = false;
    };
  }, [setKnownUserIds, setUserId]);

  useEffect(
    () =>
      onUnauthorized(() => {
        void hydration.current?.promise.then(signOutLocally);
      }),
    [signOutLocally],
  );

  const requestCode = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      const { status } = await apiFetch('auth/codes', { body: { email }, method: 'POST' });
      if (status === HTTP_STATUS_ACCEPTED) return { isOk: true };
      if (status === HTTP_STATUS_BAD_REQUEST) return { isOk: false, reason: 'invalid-email' };
      if (status === HTTP_STATUS_TOO_MANY_REQUESTS) return { isOk: false, reason: 'rate-limited' };
      return { isOk: false, reason: 'unavailable' };
    } catch {
      return { isOk: false, reason: 'unavailable' };
    }
  }, []);

  const runVerify = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      try {
        await hydration.current?.promise;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { body, status } = await apiFetch('auth/sessions', {
          body: { code, email, timezone },
          method: 'POST',
        });
        if (status === HTTP_STATUS_BAD_REQUEST) return { isOk: false, reason: 'invalid-code' };
        if (status === HTTP_STATUS_TOO_MANY_REQUESTS) return { isOk: false, reason: 'rate-limited' };
        const { sessionValue, userId: sessionUserId } = readSessionResponse(body);
        const isNative = Platform.OS !== 'web';
        if (status !== HTTP_STATUS_CREATED || sessionUserId === null) {
          return { isOk: false, reason: 'unavailable' };
        }
        if (isNative && sessionValue === null) {
          return { isOk: false, reason: 'unavailable' };
        }
        if (isNative && sessionValue !== null) {
          await writeSessionToken(sessionValue);
        }
        signInCount.current += 1;
        setUserId(sessionUserId);
        persist(sessionUserId);
        void identifyPurchaser(sessionUserId);
        return { isOk: true };
      } catch {
        return { isOk: false, reason: 'unavailable' };
      }
    },
    [persist, setUserId],
  );

  const verifyCode = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      if (verifyRun.current !== null) return { isOk: false, reason: 'unavailable' };
      const run = runVerify(email, code);
      verifyRun.current = run;
      try {
        return await run;
      } finally {
        verifyRun.current = null;
      }
    },
    [runVerify],
  );

  const signOut = useCallback(async () => {
    await verifyRun.current;
    await hydration.current?.promise;
    const countAtStart = signInCount.current;
    try {
      await apiFetch('auth/sessions/current', { method: 'DELETE' });
    } catch {
      // A failed request never blocks the local sign-out.
    }
    // A sign-in that finished while the request was pending is newer than this
    // sign-out and must keep its session.
    if (signInCount.current !== countAtStart) return;
    await signOutLocally();
  }, [signOutLocally]);

  // The account is already gone on the server, so no session request is sent.
  // The caller names the deleted id, since a concurrent 401 may already have
  // signed the device out and cleared the current user.
  const signOutDeletedAccount = useCallback(
    async (deletedId: string) => {
      setDeletedUserId(deletedId);
      // The deleted id is forgotten: it leaves the known ids, in memory and in storage.
      setKnownUserIds(knownRef.current.filter((id) => id !== deletedId));
      await signOutLocally();
    },
    [setKnownUserIds, signOutLocally],
  );

  const completeGuestClaim = useCallback(
    (claimedUserId: string) => {
      if (userIdRef.current !== claimedUserId || knownRef.current.includes(claimedUserId)) return;
      setKnownUserIds([...knownRef.current, claimedUserId]);
      persist(claimedUserId);
    },
    [persist, setKnownUserIds],
  );

  const guestClaimUserId = userId !== null && !knownUserIds.includes(userId) ? userId : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      completeGuestClaim,
      deletedUserId,
      guestClaimUserId,
      isHydrated,
      isSignedIn: userId !== null,
      requestCode,
      signOut,
      signOutDeletedAccount,
      user: userId === null ? null : { id: userId },
      verifyCode,
    }),
    [
      completeGuestClaim,
      deletedUserId,
      guestClaimUserId,
      isHydrated,
      requestCode,
      signOut,
      signOutDeletedAccount,
      userId,
      verifyCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

// The signed-in user's id, or null for a guest or outside AuthProvider, for
// hooks that also run where no AuthProvider is mounted (content loading).
export function useSignedInUserId(): string | null {
  return useContext(AuthContext)?.user?.id ?? null;
}
