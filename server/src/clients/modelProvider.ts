// The Claude Messages API behind an interface, so POST /v1/ask and GET /v1/study-note can be
// tested without the network. One single-turn request per answer, on the configured model at low
// effort. Resolves the answer text, or null when the model declined (a refusal) or ran out of room
// (max_tokens), so a partial answer is never shown. Rejects with a ModelProviderError on any API or
// network failure; the SDK does not retry. The API key, workspace id, and model come from the
// caller; this module never reads the environment.
import Anthropic from '@anthropic-ai/sdk';

import { MODEL } from '../constants/model.js';

import { buildAnthropicOptions } from './buildAnthropicOptions.js';
import type { AnthropicCredentials } from './buildAnthropicOptions.js';
import { classifyModelFailure, ModelProviderError } from './ModelProviderError.js';
import type { ProviderId } from './ModelProviderError.js';

interface ModelPrompt {
  system: string;
  user: string;
}

interface ModelProvider {
  readonly id: ProviderId;
  readonly model: string;
  answer(prompt: ModelPrompt): Promise<string | null>;
}

type MessagesClient = Pick<Anthropic['messages'], 'create'>;

interface ModelProviderDeps extends AnthropicCredentials {
  // Test seam: replaces the SDK's messages resource.
  messages?: MessagesClient;
  model: string;
}

const { EFFORT, MAX_TOKENS } = MODEL;

function createAnthropicModelProvider({ messages, model, ...credentials }: ModelProviderDeps): ModelProvider {
  const client = messages ?? new Anthropic(buildAnthropicOptions(credentials)).messages;
  return {
    async answer({ system, user }) {
      let response: Anthropic.Message;
      try {
        // The SDK's own timeout stops once response headers arrive, so the signal bounds the body too.
        response = await client.create(
          {
            max_tokens: MAX_TOKENS,
            messages: [{ content: user, role: 'user' }],
            model,
            output_config: { effort: EFFORT },
            system,
          },
          { signal: AbortSignal.timeout(MODEL.ATTEMPT_TIMEOUT_MS) },
        );
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? (error.status ?? null) : null;
        const outcome = classifyModelFailure(status, null);
        if (outcome === 'decline') return null;
        throw new ModelProviderError('anthropic', model, status, outcome);
      }
      if (response.stop_reason !== 'end_turn') return null;
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      return text === '' ? null : text;
    },
    id: 'anthropic',
    model,
  };
}

export { createAnthropicModelProvider };
export type { ModelPrompt, MessagesClient, ModelProvider };
