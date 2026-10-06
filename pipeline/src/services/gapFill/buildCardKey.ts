import { normalizePrompt } from './normalizePrompt.js';

export function buildCardKey({ prompt, code }: { prompt: string; code?: string }): string {
    const normalized = normalizePrompt(prompt);
    return code?.trim() ? `${normalized}\n${code.trim()}` : normalized;
}
