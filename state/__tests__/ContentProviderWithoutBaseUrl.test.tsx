import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_BANKS } from '../../services/content/bundledBanks.generated';
import { ContentProvider } from '../ContentProvider';
import { useQuestionBank } from '../useQuestionBank';

jest.mock('../../clients/hashClient', () => ({
    hashTextSha256: async (text: string) =>
        require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));

const BUNDLED_PYTHON_EASY_IDS = (BUNDLED_BANKS['python/easy'] as { questions: { id: string }[] }).questions.map(
    (question) => question.id,
);

let queryClient: QueryClient;

function PythonEasyProbe() {
    const bankState = useQuestionBank('python', 'easy');
    const questionIds = bankState.status === 'ready' ? bankState.bank.questions.map((question) => question.id) : [];
    return (
        <>
            <Text testID="bank-status">{bankState.status}</Text>
            <Text testID="bank-question-ids">{questionIds.join(',')}</Text>
        </>
    );
}

// A content request that fails before reaching fetch (for example, a URL
// built from a null base) still logs "content fetch failed"; with no base
// URL, no content request may be attempted at all.
function listWarnings(): string[] {
    return (console.warn as unknown as jest.Mock).mock.calls.map((call) => call.map(String).join(' '));
}

async function settleBackgroundWork(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

describe('ContentProvider with no content base URL', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        queryClient = createQueryClient();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        queryClient.clear();
        jest.restoreAllMocks();
    });

    it('serves the bundled bank and makes no manifest or bank request', async () => {
        await render(
            <QueryClientProvider client={queryClient}>
                <ContentProvider contentBaseUrl={null}>
                    <PythonEasyProbe />
                </ContentProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('bank-status')).toHaveTextContent('ready'));
        expect(screen.getByTestId('bank-question-ids')).toHaveTextContent(BUNDLED_PYTHON_EASY_IDS.join(','));
        await settleBackgroundWork();
        expect(global.fetch).not.toHaveBeenCalled();
        expect(listWarnings().filter((warning) => warning.includes('content fetch failed'))).toEqual([]);
    });
});
