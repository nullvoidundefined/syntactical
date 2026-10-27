// state/__tests__/readLocalBankDownloaded.test.tsx
// readLocalBank, which reviews and the prefetch read, sees a bank downloaded this session: once a Medium bank
// has downloaded through its query, readLocalBank returns it without a restart.
import type { Manifest } from '@syntactical/content-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';

import { createQueryClient } from '../../config/queryClient';
import { settle } from '../../config/settle';
import { buildBankQuery } from '../../services/content/buildBankQuery';
import {
  CONTENT_BASE_URL,
  MANIFEST_URL,
  buildBankText,
  cloneBundledManifest,
  hashUtf8Hex,
  stubFetchRoutes,
} from '../../services/content/__tests__/fixtures/contentFixtures';
import type { ContentAccess } from '../../services/content/types/ContentAccess';
import { ContentProvider, useContentContext } from '../ContentProvider';

jest.mock('../../clients/hashClient', () => ({
  hashTextSha256: async (text: string) =>
    require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const MEDIUM_URL = `${CONTENT_BASE_URL}python/medium.json`;
const MEDIUM_IDS = ['py-medium-1', 'py-medium-2'];
const MEDIUM_TEXT = buildBankText(MEDIUM_IDS);

let queryClient: QueryClient;
const captured: { access: ContentAccess | null } = { access: null };

function buildManifest(): Manifest {
  const manifest = cloneBundledManifest();
  const python = manifest.languages.find(({ id }) => id === 'python')!;
  python.banks.medium = { ...python.banks.medium!, hash: hashUtf8Hex(MEDIUM_TEXT) };
  return manifest;
}

function CaptureAccess() {
  captured.access = useContentContext();
  return null;
}

describe('readLocalBank after a download this session', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient = createQueryClient();
    captured.access = null;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetchRoutes(
      {
        [MANIFEST_URL]: () => Promise.resolve(JSON.stringify(buildManifest())),
        [MEDIUM_URL]: () => Promise.resolve(MEDIUM_TEXT),
      },
      { shouldRejectUnrouted: true },
    );
  });

  afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('returns a Medium bank once its download completes', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
          <CaptureAccess />
        </ContentProvider>
      </QueryClientProvider>,
    );
    await settle();
    const access = captured.access!;
    expect(access.readLocalBank('python', 'medium')).toBeNull();
    const entry = buildManifest().languages.find(({ id }) => id === 'python')!.banks.medium!;

    await queryClient.fetchQuery(buildBankQuery(queryClient, access, 'python', 'medium', entry));

    expect(access.readLocalBank('python', 'medium')?.questions.map(({ id }) => id)).toEqual(MEDIUM_IDS);
  });
});
