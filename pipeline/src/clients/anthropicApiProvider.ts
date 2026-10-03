// ModelProvider over the Anthropic Messages API. The default client reads
// ANTHROPIC_API_KEY from the environment itself; this module never touches it.
import Anthropic from '@anthropic-ai/sdk';

import type { ModelProvider } from '../types/ModelProvider.js';
import { generateWithRetries } from './generateWithRetries.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_OUTPUT_TOKENS = 8192;

export interface MessagesClient {
    create(params: {
        max_tokens: number;
        messages: { content: string; role: 'user' }[];
        model: string;
        system: string;
    }): Promise<{ content: { text?: string; type: string }[]; model: string }>;
}

export function createAnthropicApiProvider(messages?: MessagesClient): ModelProvider {
    return {
        generate(request) {
            const { prompt, system } = request;
            const client = messages ?? (new Anthropic().messages as unknown as MessagesClient);
            return generateWithRetries(request, async () => {
                const response = await client.create({
                    max_tokens: MAX_OUTPUT_TOKENS,
                    messages: [{ content: prompt, role: 'user' }],
                    model: process.env.PIPELINE_MODEL || DEFAULT_MODEL,
                    system,
                });
                const text = response.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
                return { model: response.model, text };
            });
        },
    };
}
