// The visible text of a fetched page, so a quote only counts when a reader could see it. The page
// is parsed with parse5, the spec-compliant HTML parser jsdom uses, rather than a hand-written
// scanner: hidden content is decided by the same tokenizer rules a browser applies, so malformed
// end tags, self-closing syntax, RCDATA, and CDATA cannot expose text a reader never sees.
// Dropped: the head, comments, script, style, noscript, and template subtrees, and any element
// carrying the hidden attribute. Block elements separate words; inline elements join their
// neighbors, so a quote split across <strong> still matches. text/plain is returned as is.
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

// parse5 slows down with the square of the nesting depth (20,000 levels take about 1.5 s). Real
// documentation pages nest well under 100 levels, so a page deeper than this is treated as having
// no visible text: the quote fails and the draft is dropped, never verified.
export const MAX_NESTING_DEPTH = 5000;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^<>]*?(\/?)>/g;
const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
]);
const HIDDEN_ELEMENTS = new Set(['head', 'noscript', 'script', 'style', 'template']);
const INLINE_ELEMENTS = new Set([
    'a',
    'abbr',
    'b',
    'bdi',
    'bdo',
    'cite',
    'code',
    'data',
    'dfn',
    'em',
    'i',
    'kbd',
    'mark',
    'q',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'time',
    'u',
    'var',
]);

function isHidden(node: Node): boolean {
    if (!('tagName' in node)) return false;
    return HIDDEN_ELEMENTS.has(node.tagName) || node.attrs.some(({ name }) => name === 'hidden');
}

// An explicit stack, not recursion: a 2 MB page of nested tags would overflow the call stack.
function collectText(root: ParentNode): string {
    const parts: string[] = [];
    const stack: (Node | string)[] = [...root.childNodes].reverse();
    while (stack.length > 0) {
        const item = stack.pop() as Node | string;
        if (typeof item === 'string') {
            parts.push(item);
            continue;
        }
        if (item.nodeName === '#text' && 'value' in item) {
            parts.push(item.value);
            continue;
        }
        if (!('tagName' in item) || isHidden(item)) continue;
        const separator = INLINE_ELEMENTS.has(item.tagName) ? '' : ' ';
        parts.push(separator);
        stack.push(separator);
        for (let index = item.childNodes.length - 1; index >= 0; index -= 1) {
            stack.push(item.childNodes[index] as Node);
        }
    }
    return parts.join('');
}

/** A linear over-estimate of the deepest element nesting, used only to refuse pathological pages. */
function exceedsNestingDepth(body: string): boolean {
    let depth = 0;
    for (const [, close, name, selfClose] of body.matchAll(TAG)) {
        if (close === '/') depth = Math.max(0, depth - 1);
        else if (selfClose !== '/' && !VOID_ELEMENTS.has((name as string).toLowerCase())) depth += 1;
        if (depth > MAX_NESTING_DEPTH) return true;
    }
    return false;
}

export function extractPageText(body: string, contentType: string): string {
    if (contentType === 'text/plain') return body;
    if (exceedsNestingDepth(body)) return '';
    return collectText(parse(body));
}
