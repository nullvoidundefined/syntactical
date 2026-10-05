// The visible text of a fetched page, so a quote only counts when a reader could see it: comments,
// tags and their attributes, script, style, noscript, and template blocks, and elements carrying the
// hidden attribute are dropped; block tags become spaces, inline tags join their neighbors, and
// entities are decoded. A single forward scan keeps the cost linear in the page
// size (a regex over an unterminated tag can go quadratic on a 2 MB body). text/plain is returned as is.
// Elements whose content is raw text up to their end tag.
const RAW_TEXT_ELEMENTS = new Set(['noscript', 'script', 'style']);
// Elements that do not separate words, so a quote split across them still matches.
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
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
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
    mdash: String.fromCodePoint(0x2014),
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
    // Own properties only: an inherited name such as `constructor` is not an entity.
    return Object.hasOwn(NAMED_ENTITIES, lower) ? (NAMED_ENTITIES[lower] as string) : match;
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

/** Whether `html` at `index` starts the tag `<name` or `</name` followed by a real delimiter. */
function startsTag(html: string, index: number, name: string, isClose: boolean): boolean {
    const prefix = isClose ? `</${name}` : `<${name}`;
    if (html.slice(index, index + prefix.length).toLowerCase() !== prefix) return false;
    const next = html[index + prefix.length];
    return next === undefined || /[\s/>]/.test(next);
}

/** Index just past the end tag of a raw-text element (script, style, noscript) whose content starts at `from`; -1 if unclosed. */
function findRawTextEnd(html: string, from: number, name: string): number {
    let index = html.indexOf('<', from);
    while (index !== -1) {
        if (startsTag(html, index, name, true)) {
            const end = findTagEnd(html, index + 2);
            return end === -1 ? -1 : end + 1;
        }
        index = html.indexOf('<', index + 1);
    }
    return -1;
}

/** Whether a tag's attribute text carries the boolean `hidden` attribute (quoted values are ignored). */
function hasHiddenAttribute(tag: string): boolean {
    const names = tag.replace(/"[^"]*"|'[^']*'/g, '""');
    return /(?:^|\s)hidden(?:[\s=/]|$)/i.test(
        names.slice(names.search(/\s/) === -1 ? names.length : names.search(/\s/)),
    );
}

/**
 * Index just past the end tag that closes the element `name` whose content starts at `from`,
 * counting nested elements of the same name and skipping comments and raw-text blocks; -1 if unclosed.
 */
function findElementEnd(html: string, from: number, name: string): number {
    let depth = 1;
    let index = from;
    while (index < html.length) {
        const open = html.indexOf('<', index);
        if (open === -1) return -1;
        if (html.startsWith('<!--', open)) {
            const close = html.indexOf('-->', open + 4);
            if (close === -1) return -1;
            index = close + 3;
            continue;
        }
        const end = findTagEnd(html, open + 1);
        if (end === -1) return -1;
        const tag = html.slice(open + 1, end);
        const tagName = TAG_NAME.exec(tag)?.[1]?.toLowerCase();
        index = end + 1;
        if (tagName === undefined) continue;
        if (!tag.startsWith('/') && RAW_TEXT_ELEMENTS.has(tagName)) {
            index = findRawTextEnd(html, index, tagName);
            if (index === -1) return -1;
            continue;
        }
        if (tagName !== name) continue;
        if (tag.startsWith('/')) depth -= 1;
        else if (!tag.endsWith('/')) depth += 1;
        if (depth === 0) return index;
    }
    return -1;
}

function stripMarkup(html: string, isXhtml: boolean): string {
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
        // In XHTML a CDATA section is text; in HTML it is a bogus comment and is dropped below.
        if (isXhtml && html.startsWith(CDATA_OPEN, open)) {
            const close = html.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
            if (close === -1) break;
            parts.push(html.slice(open + CDATA_OPEN.length, close));
            index = close + CDATA_CLOSE.length;
            continue;
        }
        const end = findTagEnd(html, open + 1);
        if (end === -1) break;
        index = end + 1;
        const tag = html.slice(open + 1, end);
        const name = TAG_NAME.exec(tag)?.[1]?.toLowerCase();
        // Inline elements sit inside words ("para<strong>meter</strong>"); every other tag separates words.
        parts.push(name !== undefined && INLINE_ELEMENTS.has(name) ? '' : ' ');
        if (name === undefined || tag.startsWith('/')) continue;
        if (RAW_TEXT_ELEMENTS.has(name)) {
            index = findRawTextEnd(html, index, name);
            if (index === -1) break;
        } else if (name === 'template' || hasHiddenAttribute(tag)) {
            if (tag.endsWith('/') || VOID_ELEMENTS.has(name)) continue;
            index = findElementEnd(html, index, name);
            if (index === -1) break;
        }
    }
    return parts.join('');
}

export function extractPageText(body: string, contentType: string): string {
    if (contentType === 'text/plain') return body;
    return stripMarkup(body, contentType === 'application/xhtml+xml').replace(ENTITY, decodeEntity);
}
