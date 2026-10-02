import type { Grammar, Question } from '@syntactical/content-schema';
import { render, screen, waitFor } from '@testing-library/react-native';

import { QueryDrawer } from '../../query/QueryDrawer';
import { BooleanCard } from '../BooleanCard';
import { MultipleChoiceCard } from '../MultipleChoiceCard';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

type McQuestion = Extract<Question, { type: 'mc' }>;
type BoolQuestion = Extract<Question, { type: 'bool' }>;
type RenderedNode = { children: Array<RenderedNode | string>; type: string };

const IMG_INJECTION = '<img src=x onerror=alert(1)>';
const CODE_BREAKOUT = '</code><script>1</script>';
const HOSTILE_VALUES = [IMG_INJECTION, CODE_BREAKOUT];
const baseQuery = { explanation: 'e', title: 't' };
const EXACT_RUN = { normalizer: (text: string) => text };

function buildMcQuestion(code?: string): McQuestion {
    return { answerIndex: 0, choices: [{ text: 'a' }, { text: 'b' }], code, id: 'q-mc', prompt: 'p', query: baseQuery, provenance: TEST_PROVENANCE, type: 'mc' } as McQuestion;
}

function buildBoolQuestion(code?: string): BoolQuestion {
    return { answer: true, code, id: 'q-bool', prompt: 'p', query: baseQuery, provenance: TEST_PROVENANCE, type: 'bool' } as BoolQuestion;
}

function collectText(node: RenderedNode | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(collectText).join('');
}

async function readCodeBlockText(): Promise<string> {
    await waitFor(() => expect(screen.queryByTestId('code-block')).not.toBeNull());
    return collectText(screen.queryByTestId('code-block') as unknown as RenderedNode);
}

async function renderMcCard(code: string | undefined, grammar: Grammar) {
    await render(<MultipleChoiceCard question={buildMcQuestion(code)} grammar={grammar} submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
}

async function renderBoolCard(code: string | undefined, grammar: Grammar) {
    await render(<BooleanCard question={buildBoolQuestion(code)} grammar={grammar} submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
}

async function renderDrawer(syntax: string, grammar: Grammar) {
    await render(<QueryDrawer isOpen query={{ ...baseQuery, syntax }} grammar={grammar} onClose={jest.fn()} />);
}

const RENDERERS = [
    ['MultipleChoiceCard', renderMcCard],
    ['BooleanCard', renderBoolCard],
    ['QueryDrawer', renderDrawer],
] as const;

describe('code wiring through the real components', () => {
    describe.each(RENDERERS)('%s', (_name, renderComponent) => {
        it.each(HOSTILE_VALUES)('renders hostile code as exact literal text: %s', async (hostileCode) => {
            await renderComponent(hostileCode, 'javascript');
            expect(await readCodeBlockText()).toBe(hostileCode);
        });

        it('highlights with the grammar it is given', async () => {
            await renderComponent('SELECT 1', 'sql');
            expect(await readCodeBlockText()).toBe('SELECT 1');
            expect(screen.queryByText('SELECT', EXACT_RUN)).not.toBeNull();
        });

        it('does not apply another grammar to the same code', async () => {
            await renderComponent('SELECT 1', 'python');
            expect(await readCodeBlockText()).toBe('SELECT 1');
            expect(screen.queryByText('SELECT', EXACT_RUN)).toBeNull();
        });
    });

    it.each([
        ['MultipleChoiceCard', renderMcCard],
        ['BooleanCard', renderBoolCard],
    ] as const)('%s renders no code block when the question has no code', async (_name, renderCard) => {
        await renderCard(undefined, 'python');
        await waitFor(() => expect(screen.queryByText('p')).not.toBeNull());
        expect(screen.queryByTestId('code-block')).toBeNull();
    });
});
