// The OpenAI fallback behind POST /v1/ask and GET /v1/study-note, behind the same interface as the
// Claude provider. One Responses API request per answer, with SDK retries off (the failover
// retries) and `store: false`, so OpenAI keeps no stored copy of the learner's message or the
// answer. Resolves the answer text, or null on a refusal, an incomplete response, an empty answer,
// or a prompt the vendor flags (a 400, or a failed response with a policy code), so a partial
// answer is never shown and a refused prompt is final. Any other failed response is transient. Rejects with a ModelProviderError; the SDK error is dropped because its request carries
// the learner's message. The key comes from the caller; this module never reads the environment.
import OpenAI from 'openai';
import type { ClientOptions } from 'openai';

import { MODEL } from '../constants/model.js';

import { classifyModelFailure, isDeclineCode, ModelProviderError } from './ModelProviderError.js';
import type { ModelProvider } from './modelProvider.js';

type ResponsesClient = Pick<OpenAI['responses'], 'create'>;

interface OpenAIProviderDeps {
  apiKey: string;
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Test seam: replaces the SDK's responses resource.
  responses?: ResponsesClient;
}

function buildOpenAIOptions(apiKey: string): ClientOptions {
  return { apiKey, maxRetries: MODEL.SDK_RETRIES, timeout: MODEL.ATTEMPT_TIMEOUT_MS };
}

function readAnswer(response: OpenAI.Responses.Response): string | null {
  if (response.status !== 'completed') return null;
  const parts: string[] = [];
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type === 'refusal') return null;
      if (content.type === 'output_text') parts.push(content.text);
    }
  }
  const text = parts.join('').trim();
  return text === '' ? null : text;
}

function createOpenAIModelProvider({ apiKey, model, reasoningEffort, responses }: OpenAIProviderDeps) {
  const client = responses ?? new OpenAI(buildOpenAIOptions(apiKey)).responses;
  const provider: ModelProvider = {
    id: 'openai',
    model,
    async answer({ system, user }) {
      let response: OpenAI.Responses.Response;
      try {
        response = await client.create({
          input: user,
          instructions: system,
          max_output_tokens: MODEL.MAX_TOKENS,
          model,
          store: false,
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        });
      } catch (error) {
        const isApiError = error instanceof OpenAI.APIError;
        const status = isApiError ? (error.status ?? null) : null;
        const outcome = classifyModelFailure(status, isApiError ? (error.code ?? null) : null);
        if (outcome === 'decline') return null;
        throw new ModelProviderError('openai', model, status, outcome);
      }
      if (response.status === 'failed' && !isDeclineCode(response.error?.code)) {
        throw new ModelProviderError('openai', model, null, 'transient');
      }
      return readAnswer(response);
    },
  };
  return provider;
}

export { buildOpenAIOptions, createOpenAIModelProvider };
export type { ResponsesClient };
