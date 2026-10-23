// The Claude Messages API behind an interface, so POST /v1/ask can be tested without the network.
// One single-turn request per answer, on Haiku at low effort. Resolves the answer text, or null
// when the model declined (a refusal) or ran out of room (max_tokens), so a partial answer is
// never shown. Rejects on any API or network failure after the SDK's one retry. The API key and
// workspace id come from the caller; this module never reads the environment.
import Anthropic from '@anthropic-ai/sdk';

import { ASK } from '../constants/ask.js';

import { buildAnthropicOptions } from './buildAnthropicOptions.js';
import type { AnthropicCredentials } from './buildAnthropicOptions.js';

interface AskPrompt {
  system: string;
  user: string;
}

interface ModelProvider {
  answer(prompt: AskPrompt): Promise<string | null>;
}

type MessagesClient = Pick<Anthropic['messages'], 'create'>;

interface ModelProviderDeps extends AnthropicCredentials {
  // Test seam: replaces the SDK's messages resource.
  messages?: MessagesClient;
}

const {
  MODEL: { EFFORT, ID, MAX_TOKENS },
} = ASK;

function createAnthropicModelProvider({ messages, ...credentials }: ModelProviderDeps): ModelProvider {
  const client = messages ?? new Anthropic(buildAnthropicOptions(credentials)).messages;
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
export type { AskPrompt, MessagesClient, ModelProvider };
