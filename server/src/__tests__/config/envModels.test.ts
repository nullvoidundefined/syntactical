// server/src/__tests__/config/envModels.test.ts
// The model settings: the Anthropic model id defaults to today's Haiku, the primary provider
// defaults to Anthropic, an OpenAI key needs an OpenAI model, and the reasoning effort is optional.
// An invalid value fails by variable name and never echoes the value.
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env.js';

import { buildValidEnv } from './envFixtures.js';

describe('loadEnv model settings', () => {
  it('defaults ANTHROPIC_MODEL to claude-haiku-5-5 and MODEL_PRIMARY to anthropic', () => {
    const env = loadEnv(buildValidEnv());
    expect(env.ANTHROPIC_MODEL).toBe('claude-haiku-5-5');
    expect(env.MODEL_PRIMARY).toBe('anthropic');
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('accepts a configured Claude model id', () => {
    expect(loadEnv(buildValidEnv({ ANTHROPIC_MODEL: 'claude-sonnet-5-5' })).ANTHROPIC_MODEL).toBe('claude-sonnet-5-5');
  });

  it.each(['gpt-5', 'claude haiku', 'claude-HAIKU', ''])('rejects ANTHROPIC_MODEL %j by name', (value) => {
    expect(() => loadEnv(buildValidEnv({ ANTHROPIC_MODEL: value }))).toThrow('Invalid environment: ANTHROPIC_MODEL');
  });

  it('requires OPENAI_MODEL when OPENAI_API_KEY is set', () => {
    expect(() => loadEnv(buildValidEnv({ OPENAI_API_KEY: 'sk-test' }))).toThrow('Invalid environment: OPENAI_MODEL');
  });

  it('accepts an OpenAI key, model, and reasoning effort, and openai as primary', () => {
    const env = loadEnv(
      buildValidEnv({
        MODEL_PRIMARY: 'openai',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_MODEL: 'small-model',
        OPENAI_REASONING_EFFORT: 'low',
      }),
    );
    expect(env).toMatchObject({
      MODEL_PRIMARY: 'openai',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'small-model',
      OPENAI_REASONING_EFFORT: 'low',
    });
  });

  it.each([
    ['MODEL_PRIMARY', 'gemini'],
    ['OPENAI_REASONING_EFFORT', 'max'],
  ])('rejects %s=%j by name, without the value', (name, value) => {
    const run = () => loadEnv(buildValidEnv({ [name]: value }));
    expect(run).toThrow(`Invalid environment: ${name}`);
    expect(run).not.toThrow(value);
  });
});
