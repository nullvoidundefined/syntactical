// Folds the differences a faithful quote may have from its page: Unicode compatibility forms,
// curly quotes, dash variants, whitespace, and case.
export function normalizeQuoteText(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/[‘’‛′]/g, "'")
        .replace(/[“”‟″]/g, '"')
        .replace(/[‐-―−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
