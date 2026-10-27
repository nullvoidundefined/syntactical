// The Claude client behind POST /v1/ask: one Haiku request at low effort with the given system
// prompt and user turn. Only a complete answer comes back; a refusal, a truncated answer, or an
// empty one resolves null, and an API failure rejects.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { ModelProviderError } from '../../clients/ModelProviderError.js';
import { createAnthropicModelProvider } from '../../clients/modelProvider.js';
import type { MessagesClient } from '../../clients/modelProvider.js';
import { MODEL } from '../../constants/model.js';

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

    await createAnthropicModelProvider({ apiKey: 'unused', messages, model: 'claude-haiku-5-5' }).answer(PROMPT);

    // The signal bounds the whole attempt: the SDK's own timeout stops once response headers arrive.
    expect(create).toHaveBeenCalledWith(
      {
        max_tokens: MODEL.MAX_TOKENS,
        messages: [{ content: PROMPT.user, role: 'user' }],
        model: 'claude-haiku-5-5',
        output_config: { effort: 'low' },
        system: PROMPT.system,
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('joins the text blocks and skips the others', async () => {
    const thinking = { signature: '', thinking: '', type: 'thinking' } as Anthropic.ContentBlock;
    const { messages } = fakeMessages([thinking, text('Lists are '), text('mutable. ')], 'end_turn');

    await expect(
      createAnthropicModelProvider({ apiKey: 'unused', messages, model: 'claude-haiku-5-5' }).answer(PROMPT),
    ).resolves.toBe('Lists are mutable.');
  });

  it.each(['refusal', 'max_tokens'] as const)('resolves null when the response stops on %s', async (stopReason) => {
    const { messages } = fakeMessages([text('Partial')], stopReason);

    await expect(
      createAnthropicModelProvider({ apiKey: 'unused', messages, model: 'claude-haiku-5-5' }).answer(PROMPT),
    ).resolves.toBeNull();
  });

  it('resolves null for an empty answer', async () => {
    const { messages } = fakeMessages([text('  ')], 'end_turn');

    await expect(
      createAnthropicModelProvider({ apiKey: 'unused', messages, model: 'claude-haiku-5-5' }).answer(PROMPT),
    ).resolves.toBeNull();
  });

  it('rejects when the request fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(
      createAnthropicModelProvider({
        apiKey: 'unused',
        messages: { create } as unknown as MessagesClient,
        model: 'claude-haiku-5-5',
      }).answer(PROMPT),
    ).rejects.toMatchObject({ kind: 'transient', provider: 'anthropic' });
  });
});

function rejecting(error: unknown) {
  return { create: vi.fn().mockRejectedValue(error) } as unknown as MessagesClient;
}

function apiError(status: number): InstanceType<typeof Anthropic.APIError> {
  return Anthropic.APIError.generate(status, { error: { message: 'x', type: 'error' } }, 'x', new Headers());
}

function failing(error: unknown, model = 'claude-haiku-5-5') {
  return createAnthropicModelProvider({ apiKey: 'unused', messages: rejecting(error), model });
}

describe('createAnthropicModelProvider model and failures', () => {
  it('sends the configured model id and names itself', async () => {
    const { create, messages } = fakeMessages([text('Because.')], 'end_turn');
    const provider = createAnthropicModelProvider({ apiKey: 'unused', messages, model: 'claude-x-1' });

    await provider.answer(PROMPT);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-x-1' }), expect.anything());
    expect(provider).toMatchObject({ id: 'anthropic', model: 'claude-x-1' });
  });

  it.each([401, 403, 404])('rejects a %i as a config failure naming the provider and model', async (status) => {
    await expect(failing(apiError(status), 'claude-retired').answer(PROMPT)).rejects.toMatchObject({
      kind: 'config',
      model: 'claude-retired',
      provider: 'anthropic',
      status,
    });
  });

  it.each([400, 429, 500, 529])('rejects a %i as a transient failure', async (status) => {
    await expect(failing(apiError(status)).answer(PROMPT)).rejects.toMatchObject({ kind: 'transient', status });
  });

  it('rejects a connection failure or timeout as transient with no status', async () => {
    const failure = await failing(new Anthropic.APIConnectionTimeoutError())
      .answer(PROMPT)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ModelProviderError);
    expect(failure).toMatchObject({ kind: 'transient', status: null });
  });

  it('never carries the prompt in the error message', async () => {
    const failure = (await failing(new Error(PROMPT.user))
      .answer(PROMPT)
      .catch((error: unknown) => error)) as Error;

    expect(failure.message).not.toContain('learner_message');
  });
});
