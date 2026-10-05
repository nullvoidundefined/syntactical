import type { Grammar } from '@syntactical/content-schema';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { CodeBlock } from '../CodeBlock';

type RenderedNode = {
    type: string;
    props: Record<string, unknown>;
    children: Array<RenderedNode | string>;
    parent: RenderedNode | null;
};

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const IMG_INJECTION = '<img src=x onerror=alert(1)>';
const CODE_BREAKOUT = '</code><script>1</script>';
const WHITESPACE_CODE = 'def f():\n    return  1\n\n\tx = "a  b"  \n';
const ALLOWED_HOST_TYPES = new Set(['Text', 'View', 'RCTScrollView', 'ScrollView']);
const KEYWORD_COLOR = '#b98ee8';
const STRING_COLOR = '#39e88f';
const FUNCTION_COLOR = '#5fb8e0';

function collectText(node: RenderedNode | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(collectText).join('');
}

function collectNodes(node: RenderedNode): RenderedNode[] {
    const elementChildren = node.children.filter(
        (child): child is RenderedNode => typeof child !== 'string',
    );
    return [node, ...elementChildren.flatMap(collectNodes)];
}

function findCodeBlock(): RenderedNode {
    return screen.getByTestId('code-block') as unknown as RenderedNode;
}

function findRunColor(text: string): unknown {
    const style = screen.getByText(text).props.style as { color?: string } | undefined;
    return style?.color;
}

function countNestedTextRuns(codeBlock: RenderedNode): number {
    return collectNodes(codeBlock).filter((node) => node !== codeBlock && node.type === 'Text')
        .length;
}

describe('CodeBlock', () => {
    it('renders the code inside nested Text with whitespace and newlines preserved', async () => {
        await render(<CodeBlock code={WHITESPACE_CODE} grammar="python" />);
        const codeBlock = findCodeBlock();
        expect(codeBlock.type).toBe('Text');
        expect(collectText(codeBlock)).toBe(WHITESPACE_CODE);
        expect(countNestedTextRuns(codeBlock)).toBeGreaterThan(1);
    });

    it.each([
        ['python', 'def f(): pass', 'def'],
        ['sql', 'SELECT 1', 'SELECT'],
        ['javascript', 'const x = 1', 'const'],
    ] as const)('renders the %s keyword as its own Text run', async (grammar, code, keyword) => {
        await render(<CodeBlock code={code} grammar={grammar} />);
        expect(collectText(findCodeBlock())).toBe(code);
        expect(screen.getByText(keyword)).toBeTruthy();
    });

    it('colors a keyword run and a string run differently, each with its own color', async () => {
        await render(<CodeBlock code={'def f(): return "s"'} grammar="python" />);
        expect(findRunColor('def')).toBe(KEYWORD_COLOR);
        expect(findRunColor('"s"')).toBe(STRING_COLOR);
    });

    it('colors a nested token by its innermost mapped type', async () => {
        // In bash, `ls` inside "$(ls)" is typed string > variable > function: the function color wins.
        await render(<CodeBlock code={'echo "$(ls)"'} grammar="bash" />);
        expect(findRunColor('ls')).toBe(FUNCTION_COLOR);
    });

    it.each([['plain'], ['cobol']] as const)(
        'renders the %s grammar as one unhighlighted run',
        async (grammar) => {
            const code = 'const x = 1';
            await render(<CodeBlock code={code} grammar={grammar as Grammar} />);
            const codeBlock = findCodeBlock();
            expect(collectText(codeBlock)).toBe(code);
            expect(countNestedTextRuns(codeBlock)).toBeLessThanOrEqual(1);
            expect(screen.queryByText('const')).toBeNull();
        },
    );

    it.each([
        ['javascript', IMG_INJECTION],
        ['javascript', CODE_BREAKOUT],
        ['python', IMG_INJECTION],
        ['python', CODE_BREAKOUT],
    ] as const)('renders hostile %s code as literal text: %s', async (grammar, code) => {
        await render(<CodeBlock code={code} grammar={grammar} />);
        const codeBlock = findCodeBlock();
        expect(collectText(codeBlock)).toBe(code);
        const renderedText = collectText(codeBlock);
        expect(renderedText).not.toMatch(/&lt;|&gt;|&amp;/);
        for (const node of collectNodes(screen.root as unknown as RenderedNode)) {
            expect(node.props).not.toHaveProperty('dangerouslySetInnerHTML');
            expect(node.props).not.toHaveProperty('onerror');
            expect(node.props).not.toHaveProperty('onError');
            if (node.type) expect(ALLOWED_HOST_TYPES.has(node.type)).toBe(true);
        }
    });

    it('sits inside a horizontal ScrollView so a long line scrolls instead of wrapping', async () => {
        const longLine = `const longValue = '${'x'.repeat(400)}';`;
        await render(<CodeBlock code={longLine} grammar="javascript" />);
        const codeBlock = findCodeBlock();
        expect(collectText(codeBlock)).toBe(longLine);
        let ancestor = codeBlock.parent;
        let horizontalScroller: RenderedNode | null = null;
        while (ancestor) {
            if (ancestor.props.horizontal === true) horizontalScroller = ancestor;
            ancestor = ancestor.parent;
        }
        expect(horizontalScroller).not.toBeNull();
        expect(horizontalScroller?.type).toMatch(/ScrollView/);
    });

    it('leaves no dangerouslySetInnerHTML in the app source trees', () => {
        const matchingFiles = execSync(
            'grep -rl --exclude-dir=__tests__ dangerouslySetInnerHTML app components state services || true',
            { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
        );
        expect(matchingFiles.trim()).toBe('');
    });
});
