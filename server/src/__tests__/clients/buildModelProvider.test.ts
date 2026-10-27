// server/src/__tests__/clients/buildModelProvider.test.ts
// Which providers answer, and in which order, from the environment: no key means no provider; one
// key means that provider alone, behind the failover so its one retry applies; two keys mean both,
// in MODEL_PRIMARY order.
import { describe, expect, it, vi } from 'vitest';

import { buildModelProvider, listConfiguredModels } from '../../clients/buildModelProvider.js';

import { createRecordingLogger } from '../support/recordingLogger.js';

const BASE = { ANTHROPIC_MODEL: 'claude-haiku-5-5', MODEL_PRIMARY: 'anthropic' } as const;

function factories() {
  const anthropic = vi.fn(({ model }: { model: string }) => ({ answer: vi.fn(), id: 'anthropic' as const, model }));
  const openai = vi.fn(({ model }: { model: string }) => ({ answer: vi.fn(), id: 'openai' as const, model }));
  return { anthropic, openai, seam: { createAnthropicModelProvider: anthropic, createOpenAIModelProvider: openai } };
}

describe('buildModelProvider', () => {
  it('returns undefined and warns when no key is set', () => {
    const { entries, logger } = createRecordingLogger();

    expect(buildModelProvider(BASE, logger, factories().seam)).toBeUndefined();
    expect(entries.some((entry) => entry.level === 'warn' && String(entry.msg).includes('OPENAI_API_KEY'))).toBe(true);
  });

  it('builds Claude alone with the configured model and workspace', () => {
    const { anthropic, openai, seam } = factories();
    const provider = buildModelProvider(
      { ...BASE, ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: 'wrkspc_test' },
      createRecordingLogger().logger,
      seam,
    );

    expect(provider?.id).toBe('anthropic');
    expect(anthropic).toHaveBeenCalledWith({ apiKey: 'k', model: 'claude-haiku-5-5', workspaceId: 'wrkspc_test' });
    expect(openai).not.toHaveBeenCalled();
  });

  it('builds both, Claude first by default, passing the reasoning effort only when set', () => {
    const { anthropic, openai, seam } = factories();
    const provider = buildModelProvider(
      { ...BASE, ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'small-model' },
      createRecordingLogger().logger,
      seam,
    );

    expect(provider?.id).toBe('anthropic');
    expect(anthropic).toHaveBeenCalledTimes(1);
    expect(openai).toHaveBeenCalledWith({ apiKey: 'o', model: 'small-model' });
  });

  it('lists the configured models in MODEL_PRIMARY order', () => {
    expect(
      listConfiguredModels({
        ...BASE,
        ANTHROPIC_API_KEY: 'k',
        MODEL_PRIMARY: 'openai',
        OPENAI_API_KEY: 'o',
        OPENAI_MODEL: 'small-model',
      }),
    ).toEqual([
      { id: 'openai', model: 'small-model' },
      { id: 'anthropic', model: 'claude-haiku-5-5' },
    ]);
    expect(listConfiguredModels(BASE)).toEqual([]);
  });

  it('puts OpenAI first when MODEL_PRIMARY is openai', () => {
    const provider = buildModelProvider(
      { ...BASE, ANTHROPIC_API_KEY: 'k', MODEL_PRIMARY: 'openai', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'small-model' },
      createRecordingLogger().logger,
      factories().seam,
    );

    expect(provider?.id).toBe('openai');
  });

  it('builds OpenAI alone when only its key is set, whatever MODEL_PRIMARY says', () => {
    const provider = buildModelProvider(
      { ...BASE, OPENAI_API_KEY: 'o', OPENAI_MODEL: 'small-model' },
      createRecordingLogger().logger,
      factories().seam,
    );

    expect(provider?.id).toBe('openai');
  });
});
