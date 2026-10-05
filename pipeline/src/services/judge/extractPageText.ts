// The visible text of a fetched page, so a quote only counts when a reader could see it. The page
// is parsed with parse5, the spec-compliant HTML parser jsdom uses, rather than a hand-written
// scanner: hidden content is decided by the same tokenizer rules a browser applies, so malformed
// end tags, self-closing syntax, RCDATA, and CDATA cannot expose text a reader never sees.
// Dropped: the head, comments, script, style, noscript, and template subtrees, and any element
// carrying the hidden attribute. Site chrome is dropped too, because text repeated on every page of
// a host would verify a quote for any URL on it: nav, header, footer, aside, the navigation,
// banner, and contentinfo roles, and, when the page has a main landmark, everything outside it.
// Block elements separate words; inline elements join their neighbors, so a quote split across
// <strong> still matches. text/plain is returned as is.
import { defaultTreeAdapter, parse } from 'parse5';
import type { DefaultTreeAdapterMap, TreeAdapter } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

// parse5's cost grows with the nesting depth times the number of tags: 4,999 open spans followed by
// 2 MB of unmatched end tags take 10 s, 256 take about 0.5 s. The deepest allowlisted page measured
// (MDN, OWASP, rfc-editor.org, 2026-10-05) opens 25 elements at once, so a page deeper than this is
// treated as having no visible text: the quote fails and the draft is dropped, never verified.
export const MAX_NESTING_DEPTH = 256;
// html and body are always open beneath the page's own elements.
const DOCUMENT_ELEMENTS = 2;
const HIDDEN_ELEMENTS = new Set(['head', 'noscript', 'script', 'style', 'template']);
const CHROME_ELEMENTS = new Set(['aside', 'footer', 'header', 'nav']);
const CHROME_ROLES = new Set(['banner', 'contentinfo', 'navigation']);
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

class NestingTooDeep extends Error {}

function roles(element: Element): string[] {
    const role = element.attrs.find(({ name }) => name === 'role')?.value ?? '';
    return role.toLowerCase().split(/\s+/);
}

function isDropped(element: Element): boolean {
    return (
        HIDDEN_ELEMENTS.has(element.tagName) ||
        CHROME_ELEMENTS.has(element.tagName) ||
        element.attrs.some(({ name }) => name === 'hidden') ||
        roles(element).some((role) => CHROME_ROLES.has(role))
    );
}

function isMain(element: Element): boolean {
    return element.tagName === 'main' || roles(element).includes('main');
}

type Pending = { node: Node; inMain: boolean } | { separator: string; inMain: boolean };

// An explicit stack, not recursion: a page nested to the depth limit would overflow the call
// stack. The whole page and the main landmark are collected in one walk; the main text wins when
// the page has one.
function collectText(root: ParentNode): string {
    const all: string[] = [];
    const main: string[] = [];
    let hasMain = false;
    const stack: Pending[] = [...root.childNodes].reverse().map((node) => ({ node, inMain: false }));
    while (stack.length > 0) {
        const item = stack.pop() as Pending;
        if ('separator' in item) {
            all.push(item.separator);
            if (item.inMain) main.push(item.separator);
            continue;
        }
        const { node } = item;
        if (node.nodeName === '#text' && 'value' in node) {
            all.push(node.value);
            if (item.inMain) main.push(node.value);
            continue;
        }
        if (!('tagName' in node) || isDropped(node)) continue;
        const inMain = item.inMain || isMain(node);
        hasMain ||= inMain;
        const separator = INLINE_ELEMENTS.has(node.tagName) ? '' : ' ';
        all.push(separator);
        if (inMain) main.push(separator);
        stack.push({ separator, inMain });
        for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
            stack.push({ node: node.childNodes[index] as Node, inMain });
        }
    }
    return (hasMain ? main : all).join('');
}

// The depth is read from parse5's own stack of open elements, which the tree adapter hooks see on
// every push and pop. Counting tags in the source instead can be fooled by markup the parser
// reads differently: an end tag it ignores (`<div></span>`), a self-closing non-void tag
// (`<div/>`), or a `<` inside a quoted attribute.
function parseWithDepthLimit(body: string): ParentNode {
    let depth = 0;
    const treeAdapter: TreeAdapter<DefaultTreeAdapterMap> = {
        ...defaultTreeAdapter,
        onItemPop() {
            depth -= 1;
        },
        onItemPush() {
            depth += 1;
            if (depth > MAX_NESTING_DEPTH + DOCUMENT_ELEMENTS) throw new NestingTooDeep();
        },
    };
    return parse(body, { treeAdapter });
}

export function extractPageText(body: string, contentType: string): string {
    if (contentType === 'text/plain') return body;
    try {
        return collectText(parseWithDepthLimit(body));
    } catch (error) {
        if (error instanceof NestingTooDeep) return '';
        throw error;
    }
}
