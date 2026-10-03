// Makes text that came from a model or from content safe for one log line: control
// characters and line separators become spaces, so it cannot forge a second line,
// and the length is capped.
const MAX_LOG_LINE_LENGTH = 400;

export function sanitizeLogText(text: string): string {
    return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').slice(0, MAX_LOG_LINE_LENGTH);
}
