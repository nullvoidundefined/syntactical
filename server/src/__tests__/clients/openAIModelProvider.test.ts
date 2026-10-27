// server/src/__tests__/clients/openAIModelProvider.test.ts
// The OpenAI fallback behind Ask and the study note: one Responses API request with the same system
// prompt and user turn the Claude provider sends. A complete answer comes back; a refusal, an
// incomplete response, an empty one, or a 400 that flags the prompt resolves null; any other
// failure rejects, classified for the failover. The SDK never retries; the failover does.
import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { ModelProviderError } from '../../clients/ModelProviderError.js';
import { buildOpenAIOptions, createOpenAIModelProvider } from '../../clients/openAIModelProvider.js';
import type { ResponsesClient } from '../../clients/openAIModelProvider.js';
import { MODEL } from '../../constants/model.js';

const PROMPT = { system: 'You are the tutor.', user: '<learner_message>"Why?"</learner_message>' };

function message(...content: Array<{ type: 'output_text'; text: string } | { type: 'refusal'; refusal: string }>) {
  return { content, role: 'assistant', type: 'message' };
}

function fakeResponses(response: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue(response);
  return { create, responses: { create } as unknown as ResponsesClient };
}

function apiError(status: number, code?: string) {
  return OpenAI.APIError.generate(status, { error: { code, message: 'x' } }, 'x', new Headers());
}

function rejecting(error: unknown): ResponsesClient {
  return { create: vi.fn().mockRejectedValue(error) } as unknown as ResponsesClient;
}

function build(responses: ResponsesClient, reasoningEffort?: 'low') {
  return createOpenAIModelProvider({
    apiKey: 'unused',
    model: 'small-model',
    reasoningEffort,
    responses,
  });
}

describe('buildOpenAIOptions', () => {
  it('turns SDK retries off and bounds each attempt at 11 seconds', () => {
    expect(buildOpenAIOptions('sk-test')).toEqual({ apiKey: 'sk-test', maxRetries: 0, timeout: 11_000 });
  });
});

describe('createOpenAIModelProvider', () => {
  it('names itself', () => {
    expect(build(fakeResponses({}).responses)).toMatchObject({ id: 'openai', model: 'small-model' });
  });

  it('sends one request with the system prompt as instructions and no reasoning field by default', async () => {
    const { create, responses } = fakeResponses({
      output: [message({ text: 'Because.', type: 'output_text' })],
      status: 'completed',
    });

    await build(responses).answer(PROMPT);

    expect(create).toHaveBeenCalledWith({
      input: PROMPT.user,
      instructions: PROMPT.system,
      max_output_tokens: MODEL.MAX_TOKENS,
      model: 'small-model',
    });
  });

  it('sends the reasoning effort only when configured', async () => {
    const { create, responses } = fakeResponses({
      output: [message({ text: 'Because.', type: 'output_text' })],
      status: 'completed',
    });

    await build(responses, 'low').answer(PROMPT);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ reasoning: { effort: 'low' } }));
  });

  it('joins the message text and skips other output items', async () => {
    const { responses } = fakeResponses({
      output: [
        { type: 'reasoning' },
        message({ text: 'Lists are ', type: 'output_text' }, { text: 'mutable. ', type: 'output_text' }),
      ],
      status: 'completed',
    });

    await expect(build(responses).answer(PROMPT)).resolves.toBe('Lists are mutable.');
  });

  it.each([
    ['an incomplete response', { output: [message({ text: 'Partial', type: 'output_text' })], status: 'incomplete' }],
    ['a refusal', { output: [message({ refusal: 'No.', type: 'refusal' })], status: 'completed' }],
    ['an empty answer', { output: [message({ text: '  ', type: 'output_text' })], status: 'completed' }],
  ])('resolves null for %s', async (_label, response) => {
    const { responses } = fakeResponses(response);

    await expect(build(responses).answer(PROMPT)).resolves.toBeNull();
  });

  it('resolves null for a 400 invalid_prompt, so a flagged prompt is a decline and not a failure', async () => {
    await expect(build(rejecting(apiError(400, 'invalid_prompt'))).answer(PROMPT)).resolves.toBeNull();
  });

  it.each([
    [401, 'config'],
    [404, 'config'],
    [400, 'transient'],
    [429, 'transient'],
    [503, 'transient'],
  ] as const)('rejects a %i without a policy code as %s', async (status, kind) => {
    await expect(build(rejecting(apiError(status))).answer(PROMPT)).rejects.toMatchObject({
      kind,
      model: 'small-model',
      provider: 'openai',
      status,
    });
  });

  it('rejects a connection failure as transient', async () => {
    const failure = await build(rejecting(new OpenAI.APIConnectionError({})))
      .answer(PROMPT)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ModelProviderError);
    expect(failure).toMatchObject({ kind: 'transient', status: null });
  });
});
