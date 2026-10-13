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

// `model` picks a specific model; without it each path uses its own default.
export function createModelProvider(kind: 'api' | 'cli', deps: ModelProviderDeps = {}, model?: string): ModelProvider {
    return kind === 'cli'
        ? createClaudeCliProvider(deps.exec, model)
        : createAnthropicApiProvider(deps.messages, model);
}
