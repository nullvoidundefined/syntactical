// Separators inside collections or quoted strings belong to the same printed value.
export function countPrintedValues(text: string): number {
    let count = 0;
    let depth = 0;
    let isQuoted = false;
    let isEscaped = false;
    let hasValue = false;
    for (const char of text) {
        if (!isQuoted && depth === 0 && /[\s,]/.test(char)) {
            hasValue = false;
            continue;
        }
        if (!hasValue) {
            count += 1;
            hasValue = true;
        }
        if (isQuoted) {
            if (isEscaped) isEscaped = false;
            else if (char === '\\') isEscaped = true;
            else if (char === '"') isQuoted = false;
        } else if (char === '"') isQuoted = true;
        else if ('[{('.includes(char)) depth += 1;
        else if (']})'.includes(char)) depth = Math.max(0, depth - 1);
    }
    return count;
}
