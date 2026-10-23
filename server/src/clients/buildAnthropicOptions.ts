// The Anthropic client's options for the server: the API key, the timeout and retry bounds, and,
// when a workspace id is configured, the anthropic-workspace-id header. An organization-level API
// key is refused without that header, because it does not say which workspace a request bills to;
// a workspace-scoped key needs none.
import type { ClientOptions } from '@anthropic-ai/sdk';

import { MODEL } from '../constants/model.js';

const WORKSPACE_HEADER = 'anthropic-workspace-id';

interface AnthropicCredentials {
  apiKey: string;
  workspaceId?: string;
}

const { MAX_RETRIES, TIMEOUT_MS } = MODEL;

function buildAnthropicOptions({ apiKey, workspaceId }: AnthropicCredentials): ClientOptions {
  return {
    apiKey,
    maxRetries: MAX_RETRIES,
    timeout: TIMEOUT_MS,
    ...(workspaceId ? { defaultHeaders: { [WORKSPACE_HEADER]: workspaceId } } : {}),
  };
}

export { buildAnthropicOptions };
export type { AnthropicCredentials };
