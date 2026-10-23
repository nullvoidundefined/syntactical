// The Claude Messages API behind an interface, so POST /v1/ask and GET /v1/study-note can be
// tested without the network. One single-turn request per answer, on Haiku at low effort.
// Resolves the answer text, or null when the model declined (a refusal) or ran out of room
// (max_tokens), so a partial answer is never shown. Rejects on any API or network failure after
// the SDK's one retry. The API key comes from the caller; this module never reads the environment.
import Anthropic from '@anthropic-ai/sdk';

import { MODEL } from '../constants/model.js';

interface ModelPrompt {
  system: string;
  user: string;
}

interface ModelProvider {
  answer(prompt: ModelPrompt): Promise<string | null>;
}

type MessagesClient = Pick<Anthropic['messages'], 'create'>;

interface ModelProviderDeps {
  apiKey: string;
  // Test seam: replaces the SDK's messages resource.
  messages?: MessagesClient;
}

const { EFFORT, ID, MAX_RETRIES, MAX_TOKENS, TIMEOUT_MS } = MODEL;

function createAnthropicModelProvider({ apiKey, messages }: ModelProviderDeps): ModelProvider {
  const client = messages ?? new Anthropic({ apiKey, maxRetries: MAX_RETRIES, timeout: TIMEOUT_MS }).messages;
  return {
    async answer({ system, user }) {
      const response = await client.create({
        max_tokens: MAX_TOKENS,
        messages: [{ content: user, role: 'user' }],
        model: ID,
        output_config: { effort: EFFORT },
        system,
      });
      if (response.stop_reason !== 'end_turn') return null;
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      return text === '' ? null : text;
    },
  };
}

export { createAnthropicModelProvider };
export type { ModelPrompt, MessagesClient, ModelProvider };
