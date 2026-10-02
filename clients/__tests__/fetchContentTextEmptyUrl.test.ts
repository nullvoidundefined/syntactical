import { ContentFetchError } from '../ContentFetchError';
import { fetchContentText } from '../fetchContentText';

const REQUEST_URL = 'https://example.test/syntactical/content/python/easy.json';

function installEmptyUrlFetch(): void {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      url: '',
      redirected: false,
      headers: { get: () => null },
      text: () => Promise.resolve('ok'),
    }),
  ) as unknown as typeof fetch;
}

describe('fetchContentText with an empty response url', () => {
  it('rejects with reason redirect when the response reports an empty url, even when not marked redirected', async () => {
    installEmptyUrlFetch();
    const outcome = fetchContentText(REQUEST_URL, 1024);
    await expect(outcome).rejects.toBeInstanceOf(ContentFetchError);
    await expect(outcome).rejects.toMatchObject({ reason: 'redirect' });
  });
});
