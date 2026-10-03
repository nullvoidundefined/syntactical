// Makes text that came from a model or from content safe for one log line: control,
// format (bidi overrides, zero-width), and line-separator characters become spaces, so
// it cannot forge a second line or reorder what a reader sees, and the length is capped
// by code point so a surrogate pair is never cut in half.
const MAX_LOG_LINE_LENGTH = 400;

export function sanitizeLogText(text: string): string {
    return Array.from(text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' '))
        .slice(0, MAX_LOG_LINE_LENGTH)
        .join('');
}
