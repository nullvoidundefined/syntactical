// The one rule for a failed model request, shared by both providers and the smoke script: a bad
// key, a missing model, or a forbidden request is config; a 400 that names the prompt is a decline
// (the learner's message is final there and never goes to the other vendor); everything else may
// succeed on retry. The error carries no SDK error and no prompt.
import { describe, expect, it } from 'vitest';

import { classifyModelFailure, ModelProviderError } from '../../clients/ModelProviderError.js';

describe('classifyModelFailure', () => {
  it.each([401, 403, 404])('calls a %i config', (status) => {
    expect(classifyModelFailure(status, null)).toBe('config');
  });

  it.each(['invalid_prompt', 'content_policy_violation'])('calls a 400 with code %s a decline', (code) => {
    expect(classifyModelFailure(400, code)).toBe('decline');
  });

  it.each([
    [400, null],
    [400, 'invalid_request_error'],
    [408, null],
    [409, null],
    [429, null],
    [500, null],
    [529, null],
    [null, null],
  ] as const)('calls status %s with code %s transient', (status, code) => {
    expect(classifyModelFailure(status, code)).toBe('transient');
  });

  it('reads the code only on a 400', () => {
    expect(classifyModelFailure(404, 'invalid_prompt')).toBe('config');
    expect(classifyModelFailure(429, 'invalid_prompt')).toBe('transient');
  });
});

describe('ModelProviderError', () => {
  it('builds its message from the provider, model, kind, and status only', () => {
    const error = new ModelProviderError('openai', 'small-model', 404, 'config');

    expect(error.message).toBe('openai small-model failed (config, 404)');
    expect(error).toMatchObject({ kind: 'config', model: 'small-model', provider: 'openai', status: 404 });
  });
});
