// Picks the model path: `claude -p` ('cli') or the Anthropic API ('api').
import type { ModelProvider } from '../types/ModelProvider.js';
import { createAnthropicApiProvider } from './anthropicApiProvider.js';
import type { MessagesClient } from './anthropicApiProvider.js';
import { createClaudeCliProvider } from './claudeCliProvider.js';
import type { ExecFn } from '../types/ExecFn.js';

export interface ModelProviderDeps {
    exec?: ExecFn;
    messages?: MessagesClient;
}

export function createModelProvider(kind: 'api' | 'cli', deps: ModelProviderDeps = {}): ModelProvider {
    return kind === 'cli' ? createClaudeCliProvider(deps.exec) : createAnthropicApiProvider(deps.messages);
}
