// The Claude client behind POST /v1/ask: one Haiku request at low effort with the given system
// prompt and user turn. Only a complete answer comes back; a refusal, a truncated answer, or an
// empty one resolves null, and an API failure rejects.
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { createAnthropicModelProvider } from '../../clients/modelProvider.js';
import type { MessagesClient } from '../../clients/modelProvider.js';
import { ASK } from '../../constants/ask.js';

const PROMPT = { system: 'You are the tutor.', user: '<learner_message>"Why?"</learner_message>' };

function fakeMessages(content: Anthropic.ContentBlock[], stopReason: Anthropic.StopReason) {
  const create = vi.fn().mockResolvedValue({ content, stop_reason: stopReason });
  return { create, messages: { create } as unknown as MessagesClient };
}

function text(value: string): Anthropic.ContentBlock {
  return { citations: null, text: value, type: 'text' } as Anthropic.ContentBlock;
}

describe('createAnthropicModelProvider', () => {
  it('sends one Haiku request at low effort with the system prompt and user turn', async () => {
    const { create, messages } = fakeMessages([text('Because.')], 'end_turn');

    await createAnthropicModelProvider({ apiKey: 'unused', messages }).answer(PROMPT);

    expect(create).toHaveBeenCalledWith({
      max_tokens: ASK.MODEL.MAX_TOKENS,
      messages: [{ content: PROMPT.user, role: 'user' }],
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low' },
      system: PROMPT.system,
    });
  });

  it('joins the text blocks and skips the others', async () => {
    const thinking = { signature: '', thinking: '', type: 'thinking' } as Anthropic.ContentBlock;
    const { messages } = fakeMessages([thinking, text('Lists are '), text('mutable. ')], 'end_turn');

    await expect(createAnthropicModelProvider({ apiKey: 'unused', messages }).answer(PROMPT)).resolves.toBe(
      'Lists are mutable.',
    );
  });

  it.each(['refusal', 'max_tokens'] as const)('resolves null when the response stops on %s', async (stopReason) => {
    const { messages } = fakeMessages([text('Partial')], stopReason);

    await expect(createAnthropicModelProvider({ apiKey: 'unused', messages }).answer(PROMPT)).resolves.toBeNull();
  });

  it('resolves null for an empty answer', async () => {
    const { messages } = fakeMessages([text('  ')], 'end_turn');

    await expect(createAnthropicModelProvider({ apiKey: 'unused', messages }).answer(PROMPT)).resolves.toBeNull();
  });

  it('rejects when the request fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(
      createAnthropicModelProvider({ apiKey: 'unused', messages: { create } as unknown as MessagesClient }).answer(
        PROMPT,
      ),
    ).rejects.toThrow('overloaded');
  });
});
