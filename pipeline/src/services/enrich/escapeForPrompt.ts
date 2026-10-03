// Escapes `<` so untrusted text cannot close a data tag in a prompt.
export function escapeForPrompt(text: string): string {
    return text.replaceAll('<', '\\u003c');
}
