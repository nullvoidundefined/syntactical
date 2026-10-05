import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';

import { DownloadIndicator } from '../DownloadIndicator';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function findPoliteRegion(): Element | null {
  return document.querySelector('[aria-live="polite"]');
}

describe('DownloadIndicator live region on the web', () => {
  it('mounts an empty polite region before any transfer and fills it while a bank transfers', async () => {
    const client = buildClient();
    render(
      <QueryClientProvider client={client}>
        <DownloadIndicator />
      </QueryClientProvider>,
    );
    const regionBeforeTransfer = findPoliteRegion();
    expect(regionBeforeTransfer).not.toBeNull();
    expect(regionBeforeTransfer?.textContent).toBe('');

    let failDownload: (err: Error) => void = () => {};
    await act(async () => {
      void client
        .fetchQuery({
          queryFn: () =>
            new Promise((_resolve, reject) => {
              failDownload = reject;
            }),
          queryKey: ['bank', 'python', 'easy', 'h'],
        })
        .catch(() => undefined);
    });
    await waitFor(() => expect(findPoliteRegion()?.textContent).toBe('Updating questions'));
    expect(findPoliteRegion()).toBe(regionBeforeTransfer);

    await act(async () => failDownload(new Error('offline')));
    await waitFor(() => expect(findPoliteRegion()?.textContent).toBe(''));
  });
});
