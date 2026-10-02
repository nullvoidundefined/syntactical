import { ContentFetchError } from '../ContentFetchError';
import { fetchContentText } from '../fetchContentText';

const REQUEST_URL = 'https://example.test/syntactical/content/python/easy.json';

type FakeResponseShape = {
  url?: string;
  redirected?: boolean;
  headers?: { get: (name: string) => string | null };
  text?: () => Promise<string>;
};

type CapturedInit = { signal?: AbortSignal; redirect?: string; cache?: string } | undefined;

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

function installFetch(shape: FakeResponseShape): { getInit: () => CapturedInit } {
  let capturedInit: CapturedInit;
  global.fetch = jest.fn((_input: unknown, init?: CapturedInit) => {
    capturedInit = init;
    return Promise.resolve(buildResponse(shape));
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

describe('fetchContentText transport', () => {
  it('requests content with cache no-cache', async () => {
    const { getInit } = installFetch({ text: () => Promise.resolve('ok') });
    await fetchContentText(REQUEST_URL, 1024);
    expect(getInit()?.cache).toBe('no-cache');
  });

  it('rejects with reason too-large from the content-length header without reading the body', async () => {
    installFetch({
      headers: buildHeaders({ 'Content-Length': '2048' }),
      text: () => {
        throw new Error('the body must not be read when content-length exceeds maxBytes');
      },
    });
    const err = await captureRejection(fetchContentText(REQUEST_URL, 1024));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('too-large');
  });

  it('resolves when the response url is an equivalent form of the requested url, and rejects another origin', async () => {
    installFetch({
      url: 'https://example.test:443/syntactical/content/python/easy.json',
      redirected: false,
      text: () => Promise.resolve('ok'),
    });
    await expect(fetchContentText(REQUEST_URL, 1024)).resolves.toBe('ok');

    installFetch({
      url: 'https://example.test:8443/syntactical/content/python/easy.json',
      redirected: false,
      text: () => Promise.resolve('evil'),
    });
    const err = await captureRejection(fetchContentText(REQUEST_URL, 1024));
    expect(err).toBeInstanceOf(ContentFetchError);
    expect((err as ContentFetchError).reason).toBe('redirect');
  });
});
