// The API client: every request goes to the one pinned API origin. An invalid
// base URL, a path that would leave the base, or a failed fetch throws
// ApiUnavailable; a refused request never reaches the network. Redirects,
// off-base responses, timeouts, and stream failures are ApiUnavailable too.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { API_FETCH_TIMEOUT_MS, HTTP_STATUS_UNAUTHORIZED } from '../constants/appConfig';
import { validateApiBaseUrl } from '../services/content/validateApiBaseUrl';

import { ApiUnavailable } from './ApiUnavailable';
import { clearSessionToken, readSessionToken } from './sessionTokenStore';

type ApiResponse = { status: number; body: unknown };

type ApiRequestInit = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

// requestSeq numbers every request in the order it started, so a handler can
// tell a 401 for a request sent before some event (a sign-in) from a later one.
type UnauthorizedInfo = { requestSeq: number };

type UnauthorizedHandler = (info: UnauthorizedInfo) => void;

let latestRequestSeq = 0;

export function getLatestRequestSeq(): number {
  return latestRequestSeq;
}

const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

function resolveRequestUrl(path: string): string {
  const base = validateApiBaseUrl(Constants.expoConfig?.extra?.apiBaseUrl);
  if (base === null) {
    throw new ApiUnavailable('API base URL is not configured');
  }
  if (path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new ApiUnavailable('API path must be relative to the base');
  }
  const url = new URL(path, base).href;
  if (!url.startsWith(base)) {
    throw new ApiUnavailable('API path resolves outside the base');
  }
  return url;
}

// The headers to send and the session value they carry (null when none), so a
// 401 can tell whether the stored value is still the one the request used.
type BuiltRequest = { headers: Record<string, string>; sentSession: string | null };

async function buildRequest(hasBody: boolean): Promise<BuiltRequest> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (Platform.OS === 'web') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
    return { headers, sentSession: null };
  }
  headers['X-Client'] = 'native';
  let stored: string | null;
  try {
    stored = await readSessionToken();
  } catch (cause) {
    throw new ApiUnavailable('Session store is unavailable', { cause });
  }
  if (stored) {
    headers.Authorization = `Bearer ${stored}`;
  }
  return { headers, sentSession: stored || null };
}

// A response with no url (a transport that does not report one) is not judged
// by url; `redirect: 'error'` and the redirected flag still guard it.
function isOffBase(responseUrl: string | undefined, requestedUrl: string): boolean {
  if (!responseUrl) return false;
  try {
    return new URL(responseUrl).href !== new URL(requestedUrl).href;
  } catch {
    return true;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    throw new ApiUnavailable('API response body failed', { cause });
  }
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

async function requestAndRead(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal });
  } catch (cause) {
    throw new ApiUnavailable('API request failed', { cause });
  }
  const { redirected, status, url: responseUrl } = response;
  if (redirected || isOffBase(responseUrl, url)) {
    throw new ApiUnavailable('API response was redirected');
  }
  return { body: await parseBody(response), status };
}

function createTimeoutRace(controller: AbortController): {
  promise: Promise<never>;
  clear: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiUnavailable('API request timed out'));
    }, API_FETCH_TIMEOUT_MS);
  });
  return { clear: () => clearTimeout(timer), promise };
}

async function handleUnauthorized(sentSession: string | null, requestSeq: number): Promise<void> {
  try {
    if (sentSession !== null && (await readSessionToken()) === sentSession) {
      await clearSessionToken();
    }
  } catch {
    // The stored value could not be cleared; the handlers still run below.
  }
  unauthorizedHandlers.forEach((handler) => {
    try {
      handler({ requestSeq });
    } catch {
      // One failing handler never blocks the rest.
    }
  });
}

export async function apiFetch(path: string, init: ApiRequestInit = {}): Promise<ApiResponse> {
  const requestSeq = (latestRequestSeq += 1);
  const url = resolveRequestUrl(path);
  const { body, method } = init;
  const hasBody = body !== undefined;
  const { headers, sentSession } = await buildRequest(hasBody);
  const controller = new AbortController();
  const timeout = createTimeoutRace(controller);
  let result: ApiResponse;
  try {
    result = await Promise.race([
      requestAndRead(
        url,
        {
          body: hasBody ? JSON.stringify(body) : undefined,
          credentials: Platform.OS === 'web' ? 'include' : 'omit',
          headers,
          method: method ?? 'GET',
        },
        controller.signal,
      ),
      timeout.promise,
    ]);
  } finally {
    timeout.clear();
  }
  if (result.status === HTTP_STATUS_UNAUTHORIZED) {
    await handleUnauthorized(sentSession, requestSeq);
  }
  return result;
}
