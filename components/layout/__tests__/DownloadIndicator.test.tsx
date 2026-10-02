import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { DownloadIndicator } from '../DownloadIndicator';

const mockReducedMotion = { current: false };
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => mockReducedMotion.current,
}));

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderWithClient(client: QueryClient) {
  await render(
    <QueryClientProvider client={client}>
      <DownloadIndicator />
    </QueryClientProvider>,
  );
}

function startBankFetch(client: QueryClient, outcome: Promise<unknown>) {
  void client.fetchQuery({ queryFn: () => outcome, queryKey: ['bank', 'python', 'easy', 'h'] }).catch(() => undefined);
}

describe('DownloadIndicator', () => {
  beforeEach(() => {
    mockReducedMotion.current = false;
  });

  it('is hidden when no bank is transferring', async () => {
    await renderWithClient(buildClient());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('is hidden while only the manifest is fetching', async () => {
    const client = buildClient();
    await renderWithClient(client);
    await act(async () => {
      void client.fetchQuery({ queryFn: () => new Promise(() => {}), queryKey: ['manifest'] });
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows while a bank transfers and announces once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const client = buildClient();
    await renderWithClient(client);
    await act(async () => startBankFetch(client, new Promise(() => {})));
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Updating questions' })).not.toBeNull());
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('clears the indicator when a bank download fails', async () => {
    const client = buildClient();
    await renderWithClient(client);
    let failDownload: (err: Error) => void = () => {};
    await act(async () => startBankFetch(client, new Promise((_resolve, reject) => { failDownload = reject; })));
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeNull());
    await act(async () => failDownload(new Error('offline')));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  });

  it('renders a static line when reduced motion is requested', async () => {
    mockReducedMotion.current = true;
    const client = buildClient();
    await renderWithClient(client);
    await act(async () => startBankFetch(client, new Promise(() => {})));
    await waitFor(() => expect(screen.queryByTestId('download-indicator-static')).not.toBeNull());
  });
});
