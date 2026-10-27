// The model providers behind POST /v1/ask and GET /v1/study-note, built from the environment: each
// provider whose key is set, MODEL_PRIMARY first, behind the failover (so its one retry, its time
// bound, its breaker, and its log line apply with one provider too). No key means no provider, and
// both routes answer 503. listConfiguredModels and buildConfiguredProvider hold the rules once for
// the server and the smoke script.
import type { Logger } from 'pino';

import type { Env } from '../config/env.js';

import { createFailoverModelProvider } from './failoverModelProvider.js';
import { createAnthropicModelProvider } from './modelProvider.js';
import type { ModelProvider } from './modelProvider.js';
import type { ProviderId } from './ModelProviderError.js';
import { createOpenAIModelProvider } from './openAIModelProvider.js';

type ModelEnv = Pick<
  Env,
  | 'ANTHROPIC_API_KEY'
  | 'ANTHROPIC_MODEL'
  | 'ANTHROPIC_WORKSPACE_ID'
  | 'MODEL_PRIMARY'
  | 'OPENAI_API_KEY'
  | 'OPENAI_MODEL'
  | 'OPENAI_REASONING_EFFORT'
>;

interface ConfiguredModel {
  id: ProviderId;
  model: string;
}

// Test seam: the two provider constructors.
interface ProviderFactories {
  createAnthropicModelProvider: typeof createAnthropicModelProvider;
  createOpenAIModelProvider: typeof createOpenAIModelProvider;
}

const DEFAULT_FACTORIES: ProviderFactories = { createAnthropicModelProvider, createOpenAIModelProvider };

function listConfiguredModels(env: ModelEnv): ConfiguredModel[] {
  const configured: ConfiguredModel[] = [];
  if (env.ANTHROPIC_API_KEY !== undefined) configured.push({ id: 'anthropic', model: env.ANTHROPIC_MODEL });
  // The env schema requires OPENAI_MODEL whenever OPENAI_API_KEY is set.
  if (env.OPENAI_API_KEY !== undefined && env.OPENAI_MODEL !== undefined) {
    configured.push({ id: 'openai', model: env.OPENAI_MODEL });
  }
  return configured.sort(
    (left, right) => Number(right.id === env.MODEL_PRIMARY) - Number(left.id === env.MODEL_PRIMARY),
  );
}

// One provider for one configured model, without the failover; the smoke script calls each alone.
function buildConfiguredProvider(
  { id, model }: ConfiguredModel,
  env: ModelEnv,
  factories: ProviderFactories = DEFAULT_FACTORIES,
): ModelProvider {
  if (id === 'anthropic') {
    return factories.createAnthropicModelProvider({
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      model,
      ...(env.ANTHROPIC_WORKSPACE_ID === undefined ? {} : { workspaceId: env.ANTHROPIC_WORKSPACE_ID }),
    });
  }
  const effort = env.OPENAI_REASONING_EFFORT;
  return factories.createOpenAIModelProvider({
    apiKey: env.OPENAI_API_KEY ?? '',
    model,
    ...(effort ? { reasoningEffort: effort } : {}),
  });
}

function buildModelProvider(
  env: ModelEnv,
  logger: Logger,
  factories: ProviderFactories = DEFAULT_FACTORIES,
): ModelProvider | undefined {
  const configured = listConfiguredModels(env);
  if (configured.length === 0) {
    logger.warn(
      'No model key is set (ANTHROPIC_API_KEY or OPENAI_API_KEY); POST /v1/ask and GET /v1/study-note answer 503',
    );
    return undefined;
  }
  const providers = configured.map((entry) => buildConfiguredProvider(entry, env, factories));
  return createFailoverModelProvider({ logger, providers });
}

export { buildConfiguredProvider, buildModelProvider, listConfiguredModels };
export type { ConfiguredModel, ModelEnv, ProviderFactories };
