// The Anthropic client's options for the server: the API key, the per-attempt timeout, with SDK
// retries off (the failover wrapper retries), and, when a workspace id is configured, the anthropic-workspace-id header. An organization-level API
// key is refused without that header, because it does not say which workspace a request bills to;
// a workspace-scoped key needs none.
import type { ClientOptions } from '@anthropic-ai/sdk';

import { MODEL } from '../constants/model.js';

const WORKSPACE_HEADER = 'anthropic-workspace-id';

interface AnthropicCredentials {
  apiKey: string;
  workspaceId?: string;
}

const { ATTEMPT_TIMEOUT_MS, SDK_RETRIES } = MODEL;

function buildAnthropicOptions({ apiKey, workspaceId }: AnthropicCredentials): ClientOptions {
  return {
    apiKey,
    maxRetries: SDK_RETRIES,
    timeout: ATTEMPT_TIMEOUT_MS,
    ...(workspaceId ? { defaultHeaders: { [WORKSPACE_HEADER]: workspaceId } } : {}),
  };
}

export { buildAnthropicOptions };
export type { AnthropicCredentials };
