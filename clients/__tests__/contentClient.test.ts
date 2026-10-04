import { ContentFetchError } from '../ContentFetchError';
import { fetchContentText } from '../fetchContentText';

const REQUEST_URL = 'https://example.test/syntactical/content/python/easy.json';

type FakeResponseShape = {
  ok?: boolean;
  status?: number;
  url?: string;
  redirected?: boolean;
  headers?: { get: (name: string) => string | null };
  text?: () => Promise<string>;
};

type CapturedInit = { signal?: AbortSignal; redirect?: string } | undefined;

function createAbortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

// A minimal Headers stand-in whose lookup is case-insensitive, as the real one is.
function buildHeaders(values: Record<string, string>) {
  const lowerCased = new Map(Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]));
  return { get: (name: string) => lowerCased.get(name.toLowerCase()) ?? null };
}

function buildResponse(shape: FakeResponseShape) {
  return {
    ok: true,
    status: 200,
    url: REQUEST_URL,
    redirected: false,
    headers: buildHeaders({}),
    text: () => Promise.resolve(''),
    ...shape,
  };
}

// Installs a fetch that records its init, rejects with an AbortError when the
// signal it receives aborts, and otherwise resolves with the given response.
function installFetch(shape: FakeResponseShape | null): { getInit: () => CapturedInit } {
  let capturedInit: CapturedInit;
  global.fetch = jest.fn((_input: unknown, init?: CapturedInit) => {
    capturedInit = init;
    return new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }
      signal?.addEventListener('abort', () => reject(createAbortError()));
      if (shape !== null) resolve(buildResponse(shape));
    });
  }) as unknown as typeof fetch;
  return { getInit: () => capturedInit };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

describe('fetchContentText', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the body text on a 200 response', async () => {
    installFetch({ text: () => Promise.resolve('{"schemaVersion":1}') });
    await expect(fetchContentText(REQUEST_URL, 1024)).resolves.toBe('{"schemaVersion":1}');
  });

  it('asks fetch not to follow redirects and passes an AbortSignal', async () => {
    const { getInit } = installFetch({ text: () => Promise.resolve('ok') });
    await fetchContentText(REQUEST_URL, 1024);
    const init = getInit();
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with reason redirect when the response reports redirected', async () => {
    installFetch({ redirected: true, text: () => Promise.resolve('evil') });
    const err = await captureRejection(fetchContentText(REQUEST_URL, 1024));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ContentFetchError).reason).toBe('redirect');
  });

  it('rejects with reason status for a 404 response', async () => {
    installFetch({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
    const err = await captureRejection(fetchContentText(REQUEST_URL, 1024));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('status');
  });

  it('rejects with reason too-large when the UTF-8 byte length exceeds maxBytes', async () => {
    // Six characters, twelve UTF-8 bytes: a character count would wrongly pass.
    installFetch({ text: () => Promise.resolve('é'.repeat(6)) });
    const err = await captureRejection(fetchContentText(REQUEST_URL, 10));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('too-large');
  });

  it('resolves a body whose UTF-8 byte length equals maxBytes', async () => {
    installFetch({ text: () => Promise.resolve('é'.repeat(5)) });
    await expect(fetchContentText(REQUEST_URL, 10)).resolves.toBe('é'.repeat(5));
  });

  it('rejects with reason network when fetch itself rejects', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    ) as unknown as typeof fetch;
    const err = await captureRejection(fetchContentText(REQUEST_URL, 1024));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('network');
  });

  it('rejects with reason timeout after the default 8000 ms when headers never arrive', async () => {
    jest.useFakeTimers();
    const { getInit } = installFetch(null);
    let isSettled = false;
    const pending = fetchContentText(REQUEST_URL, 1024);
    const rejection = captureRejection(pending).finally(() => {
      isSettled = true;
    });
    await jest.advanceTimersByTimeAsync(7999);
    expect(isSettled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const err = await rejection;
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('timeout');
    expect(getInit()?.signal?.aborted).toBe(true);
  });

  it('rejects with reason timeout when the body never finishes, honoring timeoutMs', async () => {
    jest.useFakeTimers();
    const { getInit } = installFetch({ text: () => new Promise<string>(() => {}) });
    let isSettled = false;
    const rejection = captureRejection(
      fetchContentText(REQUEST_URL, 1024, { timeoutMs: 100 }),
    ).finally(() => {
      isSettled = true;
    });
    await jest.advanceTimersByTimeAsync(99);
    expect(isSettled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const err = await rejection;
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('timeout');
    expect(getInit()?.signal?.aborted).toBe(true);
  });
});
