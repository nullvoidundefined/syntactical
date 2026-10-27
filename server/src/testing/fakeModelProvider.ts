// A model provider for tests: answers with canned text (or declines, or fails) and records each
// prompt it is given, so a test can check what reached the model without the network. `transient`
// and `config` fail the way a real provider does, so the failover and its breaker can be driven
// through the routes; `reject` fails with a plain Error.
import { ModelProviderError } from '../clients/ModelProviderError.js';
import type { ProviderId } from '../clients/ModelProviderError.js';
import type { ModelPrompt, ModelProvider } from '../clients/modelProvider.js';

interface FakeOptions {
  answer?: string;
  failure?: 'config' | 'decline' | 'reject' | 'transient';
  id?: ProviderId;
}

interface FakeModelProvider extends ModelProvider {
  prompts: ModelPrompt[];
}

const FAKE_MODEL = 'fake';

function createFakeModelProvider({
  answer = 'A short answer.',
  failure,
  id = 'anthropic',
}: FakeOptions = {}): FakeModelProvider {
  const prompts: ModelPrompt[] = [];
  return {
    answer(prompt) {
      prompts.push(prompt);
      switch (failure) {
        case 'decline':
          return Promise.resolve(null);
        case 'reject':
          return Promise.reject(new Error('Model request failed'));
        case 'transient':
          return Promise.reject(new ModelProviderError(id, FAKE_MODEL, 503, 'transient'));
        case 'config':
          return Promise.reject(new ModelProviderError(id, FAKE_MODEL, 404, 'config'));
        default:
          return Promise.resolve(answer);
      }
    },
    id,
    model: FAKE_MODEL,
    prompts,
  };
}

export { createFakeModelProvider };
export type { FakeModelProvider };
