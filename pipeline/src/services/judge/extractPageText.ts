// The visible text of a fetched page, so a quote only counts when a reader could see it: comments,
// tags and their attributes, and script, style, noscript, and template blocks are dropped, tags
// become spaces, and entities are decoded. A single forward scan keeps the cost linear in the page
// size (a regex over an unterminated tag can go quadratic on a 2 MB body). text/plain is returned as is.
const HIDDEN_ELEMENTS = new Set(['noscript', 'script', 'style', 'template']);
const TAG_START = /[a-zA-Z/!?]/;
const TAG_NAME = /^\/?([a-zA-Z][a-zA-Z0-9-]*)/;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rdquo: '”',
    rsquo: '’',
};
const MAX_CODE_POINT = 0x10ffff;
const HEX = 16;
const DECIMAL = 10;

function decodeEntity(match: string, name: string): string {
    const lower = name.toLowerCase();
    if (lower.startsWith('#')) {
        const codePoint = lower.startsWith('#x')
            ? Number.parseInt(lower.slice(2), HEX)
            : Number.parseInt(lower.slice(1), DECIMAL);
        return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= MAX_CODE_POINT
            ? String.fromCodePoint(codePoint)
            : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
}

/** Index of the '>' that closes the tag opened before `from`, skipping quoted attribute values; -1 if none. */
function findTagEnd(html: string, from: number): number {
    let index = from;
    while (index < html.length) {
        const char = html[index];
        if (char === '>') return index;
        if (char === '=') {
            let valueStart = index + 1;
            while (valueStart < html.length && /\s/.test(html[valueStart] as string)) valueStart += 1;
            const quote = html[valueStart];
            if (quote === '"' || quote === "'") {
                const close = html.indexOf(quote, valueStart + 1);
                if (close === -1) return -1;
                index = close + 1;
                continue;
            }
        }
        index += 1;
    }
    return -1;
}

/** Index just past the closing tag of a hidden element whose content starts at `from`; -1 if unclosed. */
function findHiddenBlockEnd(html: string, from: number, name: string): number {
    const closing = new RegExp(`</${name}\\b`, 'gi');
    closing.lastIndex = from;
    const match = closing.exec(html);
    if (!match) return -1;
    const end = findTagEnd(html, match.index + 2);
    return end === -1 ? -1 : end + 1;
}

function stripMarkup(html: string): string {
    const parts: string[] = [];
    let index = 0;
    while (index < html.length) {
        const open = html.indexOf('<', index);
        if (open === -1) {
            parts.push(html.slice(index));
            break;
        }
        parts.push(html.slice(index, open));
        if (!TAG_START.test(html[open + 1] ?? '')) {
            parts.push('<');
            index = open + 1;
            continue;
        }
        if (html.startsWith('<!--', open)) {
            const close = html.indexOf('-->', open + 4);
            if (close === -1) break;
            parts.push(' ');
            index = close + 3;
            continue;
        }
        const end = findTagEnd(html, open + 1);
        if (end === -1) break;
        parts.push(' ');
        index = end + 1;
        const tag = html.slice(open + 1, end);
        const name = TAG_NAME.exec(tag)?.[1]?.toLowerCase();
        if (name !== undefined && !tag.startsWith('/') && HIDDEN_ELEMENTS.has(name)) {
            const blockEnd = findHiddenBlockEnd(html, index, name);
            if (blockEnd === -1) break;
            index = blockEnd;
        }
    }
    return parts.join('');
}

export function extractPageText(body: string, contentType: string): string {
    if (contentType === 'text/plain') return body;
    return stripMarkup(body).replace(ENTITY, decodeEntity);
}
