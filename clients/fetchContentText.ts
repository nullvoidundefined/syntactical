// Thin wrapper around fetch for remote content files: refuses redirects
// (an empty response url is unverifiable and counts as one), bounds the whole
// request (headers and body) by a timer, and enforces a UTF-8 byte-size limit
// on the body text.

import { CONTENT_LIMITS } from '@syntactical/content-schema';
import { ContentFetchError } from './ContentFetchError';

type ContentFetchOptions = { timeoutMs?: number };

function countUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isSameUrl(responseUrl: string, requestedUrl: string): boolean {
  if (responseUrl === '') return false;
  try {
    return new URL(responseUrl).href === new URL(requestedUrl).href;
  } catch {
    return false;
  }
}

function assertDirectOkResponse(response: Response, requestedUrl: string): void {
  const { ok, redirected, status, url } = response;
  if (redirected || !isSameUrl(url, requestedUrl)) {
    throw new ContentFetchError('redirect', 'Content request was redirected');
  }
  if (!ok) {
    throw new ContentFetchError('status', `Content request failed with ${status}`);
  }
}

function assertDeclaredLengthWithinLimit(response: Response, maxBytes: number): void {
  const declaredLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ContentFetchError('too-large', 'Content body exceeds the size limit');
  }
}

async function requestAndReadText(
  url: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, { cache: 'no-cache', redirect: 'error', signal });
  assertDirectOkResponse(response, url);
  assertDeclaredLengthWithinLimit(response, maxBytes);
  const text = await response.text();
  if (countUtf8Bytes(text) > maxBytes) {
    throw new ContentFetchError('too-large', 'Content body exceeds the size limit');
  }
  return text;
}

function createTimeoutRace(
  controller: AbortController,
  timeoutMs: number,
): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ContentFetchError('timeout', 'Content request timed out'));
    }, timeoutMs);
  });
  return { clear: () => clearTimeout(timer), promise };
}

function toContentFetchError(err: unknown): ContentFetchError {
  if (err instanceof ContentFetchError) return err;
  return new ContentFetchError('network', 'Content request failed');
}

export async function fetchContentText(
  url: string,
  maxBytes: number,
  options: ContentFetchOptions = {},
): Promise<string> {
  const { timeoutMs = CONTENT_LIMITS.fetchTimeoutMs } = options;
  const controller = new AbortController();
  const timeout = createTimeoutRace(controller, timeoutMs);
  try {
    return await Promise.race([
      requestAndReadText(url, maxBytes, controller.signal),
      timeout.promise,
    ]);
  } catch (err) {
    throw toContentFetchError(err);
  } finally {
    timeout.clear();
  }
}
