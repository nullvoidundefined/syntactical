// components/menu/__tests__/DifficultyStepMediumOffline.test.tsx
// Review Focus 11 (area 2): a Medium bank requested offline with no cached copy, after the Easy bank
// of the same track played from the bundle. The difficulty step shows "Needs a connection to load"
// on Medium and disables it, Easy stays playable, nothing crashes, and a signed-in user's step asks
// the API nothing. Real useQuestionBank and ContentProvider; the network is a fetch that always
// fails, as offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { createQueryClient } from '../../../config/queryClient';
import {
  CONTENT_BASE_URL,
  listFetchedUrls,
  stubFetchRoutes,
} from '../../../services/content/__tests__/fixtures/contentFixtures';
import { ContentProvider } from '../../../state/ContentProvider';
import { DifficultyStep } from '../DifficultyStep';
import { setExpoExtra } from '../../../config/expoConstantsMock';
import { settle } from '../../../config/settle';

const mockOwner: { current: string | null } = { current: null };

jest.mock('../../../state/AuthProvider', () => ({
  useSignedInUserId: () => mockOwner.current,
}));
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../state/useIsOnline', () => ({ useIsOnline: () => false }));
jest.mock('../../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', contentBaseUrl: 'https://example.test/content/' });

const API_BASE = 'https://api.syntactical.dev/v1/';

let queryClient: QueryClient;

async function renderPythonStep(onSelectDifficulty: (difficultyId: string) => void): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
        <DifficultyStep language="python" onBack={jest.fn()} onSelectDifficulty={onSelectDifficulty} />
      </ContentProvider>
    </QueryClientProvider>,
  );
  await settle();
}

describe('DifficultyStep offline with an uncached Medium bank', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    mockOwner.current = 'a6f1d1c2-0000-4000-8000-00000000000a';
    stubFetchRoutes({}, { shouldRejectUnrouted: true });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('plays Easy from the bundle, then shows Medium as needing a connection and disabled', async () => {
    const onSelectDifficulty = jest.fn();
    await renderPythonStep(onSelectDifficulty);

    await fireEvent.press(await screen.findByRole('button', { name: /^Easy/ }));
    expect(onSelectDifficulty).toHaveBeenCalledWith('easy');

    const medium = screen.getByRole('button', { name: /^Medium/ });
    await waitFor(() => expect(within(medium).getByText('Needs a connection to load')).toBeTruthy());
    expect(medium).toBeDisabled();
    await fireEvent.press(medium);
    expect(onSelectDifficulty).not.toHaveBeenCalledWith('medium');
    expect(listFetchedUrls().filter((url) => url.startsWith(API_BASE))).toEqual([]);
  });
});
