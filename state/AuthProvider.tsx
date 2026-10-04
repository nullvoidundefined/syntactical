// Owns sign-in for the whole app: requests and verifies an emailed code,
// holds the native session value only in the secure store (the web build uses
// an HttpOnly cookie), and persists just the non-secret identity (user id and
// the ids that have signed in on this device). The first sign-in of an id on
// this device raises guestClaimUserId until completeGuestClaim(userId); the
// pending ids live in their own storage key, so the claim survives remounts
// and sign-out. Sign-out clears local state even when the server call fails, a
// 401 for a request sent after the current sign-in signs the user out locally
// (an older request's 401 is ignored), and calls made before hydration wait
// for it. After the server deletes the account, signOutDeletedAccount signs
// out with no request and names the deleted id in deletedUserId, so the stats
// layer removes that user's local data. The session value, email, and code
// are never logged or stored outside the secure store.
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
import { getLatestRequestSeq } from '../clients/getLatestRequestSeq';
import { logWarning } from '../clients/logClient';
import { onUnauthorized } from '../clients/onUnauthorized';
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

const PENDING_CLAIMS_STORAGE_KEY = 'syntactical.auth.pending-claims.v1';

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
  signOutDeletedAccount: () => Promise<void>;
  user: { id: string } | null;
  verifyCode: (email: string, code: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function resolvePendingClaims(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

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
  const [pendingClaims, setPendingClaimsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [deletedUserId, setDeletedUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const knownRef = useRef<string[]>([]);
  const pendingRef = useRef<string[]>([]);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const hydration = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (hydration.current === null) {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    hydration.current = { promise, resolve };
  }
  const signInSeq = useRef(0);
  const signInCount = useRef(0);
  const verifyRun = useRef<Promise<AuthResult> | null>(null);

  const setUserId = useCallback((next: string | null) => {
    userIdRef.current = next;
    setUserIdState(next);
  }, []);

  const setPendingClaims = useCallback((next: string[]) => {
    pendingRef.current = next;
    setPendingClaimsState(next);
  }, []);

  const setKnownUserIds = useCallback((next: string[]) => {
    knownRef.current = next;
  }, []);

  // Writes the identity, merged with what storage holds so ids this session
  // never read (a failed hydration read) are not lost; a write is skipped when
  // storage cannot be read at all.
  const persist = useCallback((nextUserId: string | null) => {
    const memoryKnown = [...knownRef.current];
    writeQueue.current = writeQueue.current.then(async () => {
      const { isReadFailed, value } = await readStoredJson(AUTH_STORAGE_KEY);
      if (isReadFailed) return;
      const stored = resolveStoredAuth(value);
      const merged = Array.from(new Set([...(stored?.knownUserIds ?? []), ...memoryKnown]));
      await writeJson(AUTH_STORAGE_KEY, { knownUserIds: merged, userId: nextUserId });
    });
  }, []);

  // Adds or removes one id in the stored pending claims, against what storage
  // holds now; skipped when storage cannot be read.
  const persistPending = useCallback((change: { add?: string; remove?: string }) => {
    writeQueue.current = writeQueue.current.then(async () => {
      const { isReadFailed, value } = await readStoredJson(PENDING_CLAIMS_STORAGE_KEY);
      if (isReadFailed) return;
      const next = resolvePendingClaims(value).filter((id) => id !== change.remove);
      if (change.add !== undefined && !next.includes(change.add)) next.push(change.add);
      await writeJson(PENDING_CLAIMS_STORAGE_KEY, next);
    });
  }, []);

  const signOutLocally = useCallback(async () => {
    setUserId(null);
    persist(null);
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
    void Promise.all([
      readStoredJson(AUTH_STORAGE_KEY),
      readStoredJson(PENDING_CLAIMS_STORAGE_KEY),
    ]).then(([read, pendingRead]) => {
      if (!isActive) return;
      const stored = resolveStoredAuth(read.value);
      if (stored) {
        const { knownUserIds, userId: storedUserId } = stored;
        setKnownUserIds(knownUserIds);
        setUserId(storedUserId);
      }
      setPendingClaims(resolvePendingClaims(pendingRead.value));
      setIsHydrated(true);
      hydration.current?.resolve();
    });
    return () => {
      isActive = false;
    };
  }, [setKnownUserIds, setPendingClaims, setUserId]);

  useEffect(
    () =>
      onUnauthorized(({ requestSeq }) => {
        if (requestSeq <= signInSeq.current) return;
        void signOutLocally();
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
        signInSeq.current = getLatestRequestSeq();
        signInCount.current += 1;
        if (!knownRef.current.includes(sessionUserId)) {
          setKnownUserIds([...knownRef.current, sessionUserId]);
          setPendingClaims([...pendingRef.current, sessionUserId]);
          persistPending({ add: sessionUserId });
        }
        setUserId(sessionUserId);
        persist(sessionUserId);
        return { isOk: true };
      } catch {
        return { isOk: false, reason: 'unavailable' };
      }
    },
    [persist, persistPending, setKnownUserIds, setPendingClaims, setUserId],
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
  const signOutDeletedAccount = useCallback(async () => {
    setDeletedUserId(userIdRef.current);
    await signOutLocally();
  }, [signOutLocally]);

  const completeGuestClaim = useCallback(
    (claimedUserId: string) => {
      if (userIdRef.current !== claimedUserId) return;
      if (!pendingRef.current.includes(claimedUserId)) return;
      setPendingClaims(pendingRef.current.filter((id) => id !== claimedUserId));
      persistPending({ remove: claimedUserId });
    },
    [persistPending, setPendingClaims],
  );

  const guestClaimUserId = userId !== null && pendingClaims.includes(userId) ? userId : null;

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
