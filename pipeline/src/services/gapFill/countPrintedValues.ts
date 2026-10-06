// Separators inside collections or quoted strings belong to the same printed value.
export function countPrintedValues(text: string): number {
    let count = 0;
    let depth = 0;
    let quote: string | undefined;
    let isEscaped = false;
    let hasValue = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]!;
        if (!quote && depth === 0 && /[\s,]/.test(char)) {
            hasValue = false;
            continue;
        }
        if (!hasValue) {
            count += 1;
            hasValue = true;
        }
        if (quote) {
            if (isEscaped) isEscaped = false;
            else if (char === '\\') isEscaped = true;
            else if (char === quote) {
                if (quote === "'" && text[index + 1] === "'") index += 1;
                else quote = undefined;
            }
        } else if (char === '"' || char === "'") quote = char;
        else if ('[{('.includes(char)) depth += 1;
        else if (']})'.includes(char)) depth = Math.max(0, depth - 1);
    }
    return count;
}
