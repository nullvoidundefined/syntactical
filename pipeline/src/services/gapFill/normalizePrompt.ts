// Normalizes a question prompt for duplicate checks: case, punctuation, and spacing do not count.
export function normalizePrompt(prompt: string): string {
    return prompt
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
