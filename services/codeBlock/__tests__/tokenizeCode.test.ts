import type { Grammar } from '@syntactical/content-schema';
import { tokenizeCode } from '../tokenizeCode';
import type { CodeToken } from '../types/CodeToken';

const IMG_INJECTION = '<img src=x onerror=alert(1)>';
const CODE_BREAKOUT = '</code><script>1</script>';
const WHITESPACE_CODE = 'def f():\n    return  1\n\n\tx = "a  b"  \n';

function joinPieces(pieces: CodeToken[]): string {
    return pieces.map((piece) => piece.text).join('');
}

function findPiece(pieces: CodeToken[], text: string): CodeToken | undefined {
    return pieces.find((piece) => piece.text === text);
}

describe('tokenizeCode', () => {
    it.each(['python', 'sql', 'javascript', 'plain'] as const)(
        'returns pieces that join back to the exact input, whitespace included, for %s',
        (grammar) => {
            const pieces = tokenizeCode(WHITESPACE_CODE, grammar);
            expect(joinPieces(pieces)).toBe(WHITESPACE_CODE);
            for (const piece of pieces) {
                expect(typeof piece.text).toBe('string');
                expect(Array.isArray(piece.types)).toBe(true);
            }
        },
    );

    it.each([
        ['python', 'def f(): pass', 'def'],
        ['sql', 'SELECT 1', 'SELECT'],
        ['javascript', 'const x = 1', 'const'],
        ['typescript', 'interface Foo {}', 'interface'],
        ['go', 'func main() {}', 'func'],
        ['rust', 'fn main() {}', 'fn'],
        ['ruby', 'def f; end', 'def'],
        ['bash', 'if true; then echo; fi', 'then'],
    ] as const)('tags the %s keyword with the keyword type', (grammar, code, keyword) => {
        const pieces = tokenizeCode(code, grammar);
        expect(joinPieces(pieces)).toBe(code);
        expect(findPiece(pieces, keyword)?.types).toContain('keyword');
    });

    it('uses the grammar it is given rather than one shared grammar', () => {
        expect(findPiece(tokenizeCode('SELECT 1', 'python'), 'SELECT')?.types ?? []).not.toContain(
            'keyword',
        );
        expect(findPiece(tokenizeCode('def f(): pass', 'javascript'), 'def')?.types ?? []).not.toContain(
            'keyword',
        );
    });

    it('flattens nested tokens and accumulates their types outer first', () => {
        const code = '`a${b}`';
        const pieces = tokenizeCode(code, 'javascript');
        expect(joinPieces(pieces)).toBe(code);
        const nestedPiece = findPiece(pieces, 'b');
        expect(nestedPiece?.types.slice(0, 2)).toEqual(['template-string', 'interpolation']);
        for (const piece of pieces) {
            expect(piece.types.every((tokenType) => typeof tokenType === 'string')).toBe(true);
        }
    });

    it('returns one plain unhighlighted piece for the plain grammar', () => {
        const code = 'const x = 1\n  SELECT 1';
        expect(tokenizeCode(code, 'plain')).toEqual([{ text: code, types: [] }]);
    });

    it('returns one plain unhighlighted piece for a grammar the build does not include', () => {
        const code = 'const x = 1';
        expect(tokenizeCode(code, 'cobol' as Grammar)).toEqual([{ text: code, types: [] }]);
    });

    it.each([
        ['javascript', IMG_INJECTION],
        ['javascript', CODE_BREAKOUT],
        ['python', IMG_INJECTION],
        ['python', CODE_BREAKOUT],
    ] as const)('keeps hostile %s input as literal, unencoded text: %s', (grammar, code) => {
        const pieces = tokenizeCode(code, grammar);
        expect(joinPieces(pieces)).toBe(code);
        for (const piece of pieces) {
            expect(piece.text).not.toMatch(/&lt;|&gt;|&amp;|<span/);
            expect(Object.keys(piece).sort()).toEqual(['text', 'types']);
        }
    });

    it('joins back to the empty string for empty input', () => {
        expect(joinPieces(tokenizeCode('', 'javascript'))).toBe('');
    });
});
